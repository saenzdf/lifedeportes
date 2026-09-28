#!/usr/bin/env python3
"""Renombra almacén WH→LIFE y salidas OUT→ENVIO (Remisión LIFE/ENVIO/…)."""

from __future__ import annotations

import argparse
import os
import time
import xmlrpc.client
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

WAREHOUSE_CODE = "LIFE"
OUT_SEQUENCE_CODE = "ENVIO"
OUT_PREFIX = "LIFE/ENVIO/"

SEQUENCE_PREFIX_FIXES = {
    # id filled at runtime by matching current prefix patterns
}


def load_dotenv_file() -> None:
    env_path = ROOT / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip("'").strip('"'))


def odoo_client(target: str = "prod"):
    load_dotenv_file()
    if target == "prod":
        url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
        db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
        user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
        password = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    else:
        url = os.environ["ODOO_LIFEDEPORTES_URL"].rstrip("/")
        db = os.environ["ODOO_LIFEDEPORTES_DB"]
        user = os.environ["ODOO_LIFEDEPORTES_USERNAME"]
        password = os.environ["ODOO_LIFEDEPORTES_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, password, {})
    if not uid:
        raise SystemExit("Odoo authentication failed")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)
    return models, uid, db, password, url


def kw(models, uid, db, password, model, method, *args, **kwargs):
    return models.execute_kw(db, uid, password, model, method, list(args), kwargs)


def run_rename_batches(models, uid, db, password, *, old: str, new: str, batch: int = 250) -> int:
    """One-shot server action: rename stock.picking names in batches on the server."""
    model_id = kw(
        models, uid, db, password, "ir.model", "search", [["model", "=", "stock.picking"]], limit=1
    )[0]
    code = f"""
old = {old!r}
new = {new!r}
pickings = env['stock.picking'].with_context(tracking_disable=True, mail_notrack=True).search(
    [('name', '=like', old + '%')], limit={batch}
)
for p in pickings:
    p.write({{'name': new + p.name[len(old):]}})
"""
    name = f"Life rename {old} → {new} (temp)"
    existing = kw(
        models, uid, db, password, "ir.actions.server", "search", [["name", "=", name]], limit=1
    )
    vals = {"name": name, "model_id": model_id, "state": "code", "code": code}
    if existing:
        aid = existing[0]
        kw(models, uid, db, password, "ir.actions.server", "write", [aid], vals)
    else:
        aid = kw(models, uid, db, password, "ir.actions.server", "create", [vals])
        if isinstance(aid, list):
            aid = aid[0]

    total = 0
    while True:
        left = kw(
            models, uid, db, password, "stock.picking", "search_count", [["name", "=ilike", old + "%"]]
        )
        if left == 0:
            break
        any_id = kw(models, uid, db, password, "stock.picking", "search", [], limit=1)[0]
        models.execute_kw(
            db,
            uid,
            password,
            "ir.actions.server",
            "run",
            [[aid]],
            {"context": {"active_model": "stock.picking", "active_ids": [any_id], "active_id": any_id}},
        )
        total += min(batch, left)
        time.sleep(0.2)

    kw(models, uid, db, password, "ir.actions.server", "unlink", [aid])
    return total


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("test", "prod"), default="prod")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-rename-existing", action="store_true")
    args = parser.parse_args()

    models, uid, db, password, url = odoo_client(args.target)
    print(f"Target={args.target} {url}")

    wh = kw(
        models, uid, db, password, "stock.warehouse", "search_read", [], fields=["id", "code", "name"], limit=1
    )[0]
    print(f"  warehouse {wh['id']} code={wh['code']!r} → {WAREHOUSE_CODE!r}")
    if not args.dry_run and wh["code"] != WAREHOUSE_CODE:
        kw(models, uid, db, password, "stock.warehouse", "write", [wh["id"]], {"code": WAREHOUSE_CODE})

    pts = kw(
        models,
        uid,
        db,
        password,
        "stock.picking.type",
        "search_read",
        [["code", "=", "outgoing"], ["warehouse_id", "=", wh["id"]], ["sequence_code", "in", ["OUT", "ENVIO"]]],
        fields=["id", "name", "sequence_code", "sequence_id"],
    )
    # Prefer main delivery (not POS): sequence ENVIO or OUT
    out_pt = None
    for p in pts:
        if p["sequence_code"] in ("OUT", "ENVIO") and "POS" not in (p.get("name") or ""):
            out_pt = p
            break
    if not out_pt and pts:
        out_pt = pts[0]
    if not out_pt:
        # fallback id 2 used historically on Life prod
        rows = kw(
            models,
            uid,
            db,
            password,
            "stock.picking.type",
            "search_read",
            [["id", "=", 2]],
            fields=["id", "name", "sequence_code", "sequence_id"],
        )
        out_pt = rows[0] if rows else None
    if not out_pt:
        raise SystemExit("Outgoing picking type not found")

    print(f"  picking type {out_pt['id']} sequence_code={out_pt['sequence_code']!r} → {OUT_SEQUENCE_CODE!r}")
    if not args.dry_run and out_pt["sequence_code"] != OUT_SEQUENCE_CODE:
        kw(
            models,
            uid,
            db,
            password,
            "stock.picking.type",
            "write",
            [out_pt["id"]],
            {"sequence_code": OUT_SEQUENCE_CODE},
        )
    if not args.dry_run:
        kw(
            models,
            uid,
            db,
            password,
            "stock.picking.type",
            "update_field_translations",
            [out_pt["id"]],
            "name",
            {"es_ES": "Envíos"},
        )

    # Align all WH/ sequence prefixes to LIFE/
    seqs = kw(
        models,
        uid,
        db,
        password,
        "ir.sequence",
        "search_read",
        ["|", ["prefix", "=ilike", "WH/%"], ["prefix", "=ilike", "LIFE/%"]],
        fields=["id", "name", "prefix"],
    )
    for s in seqs:
        prefix = s["prefix"] or ""
        if prefix.startswith("WH/"):
            new_prefix = "LIFE/" + prefix[3:]
            if new_prefix.startswith("LIFE/OUT/"):
                new_prefix = OUT_PREFIX
            print(f"  sequence {s['id']}: {prefix} → {new_prefix}")
            if not args.dry_run:
                kw(models, uid, db, password, "ir.sequence", "write", [s["id"]], {"prefix": new_prefix})
        elif prefix == "LIFE/OUT/":
            print(f"  sequence {s['id']}: {prefix} → {OUT_PREFIX}")
            if not args.dry_run:
                kw(models, uid, db, password, "ir.sequence", "write", [s["id"]], {"prefix": OUT_PREFIX})

    # Ensure OUT sequence is LIFE/ENVIO/
    if out_pt.get("sequence_id"):
        sid = out_pt["sequence_id"][0]
        seq = kw(
            models, uid, db, password, "ir.sequence", "search_read", [["id", "=", sid]], fields=["prefix"]
        )[0]
        if seq["prefix"] != OUT_PREFIX:
            print(f"  force out sequence {sid} prefix → {OUT_PREFIX}")
            if not args.dry_run:
                kw(models, uid, db, password, "ir.sequence", "write", [sid], {"prefix": OUT_PREFIX})

    if not args.skip_rename_existing and not args.dry_run:
        pairs = [
            ("WH/OUT/", OUT_PREFIX),
            ("LIFE/OUT/", OUT_PREFIX),
            ("WH/IN/", "LIFE/IN/"),
            ("WH/INT/", "LIFE/INT/"),
            ("WH/MO/", "LIFE/MO/"),
            ("WH/POS/", "LIFE/POS/"),
            ("WH/RES/", "LIFE/RES/"),
        ]
        for old, new in pairs:
            left = kw(
                models, uid, db, password, "stock.picking", "search_count", [["name", "=ilike", old + "%"]]
            )
            if left:
                print(f"  renaming {left} pickings {old}* → {new}*")
                run_rename_batches(models, uid, db, password, old=old, new=new)

    sample = kw(
        models,
        uid,
        db,
        password,
        "stock.picking",
        "search_read",
        [["picking_type_id", "=", out_pt["id"]]],
        fields=["id", "name"],
        limit=3,
        order="id desc",
    )
    print("  sample outgoing", sample)
    print(f"Done on {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
