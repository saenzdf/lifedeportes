#!/usr/bin/env python3
"""Apply cuaderno batch: Empacado (by SO #) + delivery validate (by name + carrier).

Reads docs/odoo/cuaderno_batches/2026-09-09/extracted.json (or scratch/memory fallback).

Usage:
  python scripts/apply_cuaderno_batch.py                 # dry-run
  python scripts/apply_cuaderno_batch.py --apply
  python scripts/apply_cuaderno_batch.py --packing-only
  python scripts/apply_cuaderno_batch.py --delivery-only
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
import xmlrpc.client
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
# Prefer versioned batch under docs/; fall back to local scratch working copy.
_BATCH_CANDIDATES = [
    ROOT / "docs" / "odoo" / "cuaderno_batches" / "2026-09-09" / "extracted.json",
    ROOT / "scratch" / "cuaderno_2026-09-09" / "extracted.json",
    ROOT / "memory" / "cuaderno_2026-09-09" / "extracted.json",
]
EXTRACTED_PATH = next((p for p in _BATCH_CANDIDATES if p.exists()), _BATCH_CANDIDATES[0])
REPORT_OUT = EXTRACTED_PATH.parent / "dry_run_report.json"

PROJECT_IDS = [8, 9, 12]  # Javier, Paola, Kapso pedidos
EMPACADO_BY_PROJECT = {8: 38, 9: 39, 12: 60}

CARRIER_CANONICAL = {
    "interrapidísimo": "Interrapidísimo",
    "interrapidisimo": "Interrapidísimo",
    "inter": "Interrapidísimo",
    "envía": "Envía",
    "envia": "Envía",
    "moto": "Moto",
    "mensajero": "Mensajero",
    "carro": "Carro",
    "terminal": "Terminal",
}


def load_env():
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def connect_prod():
    url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
    pwd = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", allow_none=True)
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)
    uid = common.authenticate(db, user, pwd, {})
    if not uid:
        raise SystemExit(f"Auth failed for prod ({url})")
    print(f"Connected {url} db={db} uid={uid}", file=sys.stderr)
    return {"db": db, "uid": uid, "pwd": pwd, "models": models, "url": url}


def kw(c, model, method, *args, **kwargs):
    return c["models"].execute_kw(
        c["db"], c["uid"], c["pwd"], model, method, list(args), kwargs or {}
    )


def chunks(seq, size=80):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s.casefold().strip()


def bare_order_number(raw) -> int | None:
    s = str(raw or "").strip().upper()
    s = re.sub(r"^S0*", "", s)
    s = re.sub(r"^S", "", s)
    s = re.sub(r"[^0-9]", "", s)
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


def order_name_candidates(n: int) -> list[str]:
    return list(
        dict.fromkeys(
            [
                f"S0{str(n).zfill(4)}",
                f"S0{n}",
                f"S{n}",
                f"S{str(n).zfill(5)}",
            ]
        )
    )


def so_name(n: int) -> str:
    return f"S{n:05d}"


def resolve_carrier_name(raw: str | None, address: str | None = None) -> str | None:
    if not raw:
        return None
    text = fold(raw)
    addr = fold(address or "")
    # Combo Envia inter
    if "envia" in text and "inter" in text:
        if "inter" in addr or "oficina" in addr:
            return "Interrapidísimo"
        return "Envía"
    for key, canon in CARRIER_CANONICAL.items():
        if key in text:
            return canon
    return None


def load_carriers(c) -> dict[str, int]:
    carriers = kw(
        c,
        "delivery.carrier",
        "search_read",
        [("active", "in", [True, False])],
        fields=["id", "name"],
        limit=200,
    )
    by_name = {}
    for car in carriers:
        by_name[fold(car["name"])] = car["id"]
        # also map short aliases
    # canonical map
    out = {}
    for canon in (
        "Interrapidísimo",
        "Envía",
        "Moto",
        "Mensajero",
        "Carro",
        "Terminal",
    ):
        cid = by_name.get(fold(canon))
        if cid:
            out[canon] = cid
        else:
            # fuzzy
            for name, i in by_name.items():
                if fold(canon) in name or name in fold(canon):
                    out[canon] = i
                    break
    return out


def stage_name(t) -> str:
    sid = t.get("stage_id")
    if isinstance(sid, (list, tuple)):
        return sid[1] or ""
    return str(sid or "")


def proj_id(t) -> int | None:
    p = t.get("project_id")
    if isinstance(p, (list, tuple)):
        return p[0]
    return p


def is_empacado_or_hecho(t) -> str | None:
    sn = fold(stage_name(t))
    st = t.get("state") or ""
    if "hecho" in sn or st == "1_done":
        return "hecho"
    if "empacado" in sn:
        return "empacado"
    return None


def find_orders_by_numbers(c, numbers: list[int]) -> dict[int, dict]:
    names = []
    for n in numbers:
        names.extend(order_name_candidates(n))
    names = list(dict.fromkeys(names))
    orders = []
    for batch in chunks(names, 80):
        orders.extend(
            kw(
                c,
                "sale.order",
                "search_read",
                [("name", "in", batch)],
                fields=["id", "name", "partner_id", "state", "picking_ids"],
                limit=500,
            )
        )
    by_bare: dict[int, dict] = {}
    for o in orders:
        bare = bare_order_number(o["name"])
        if bare is not None and bare not in by_bare:
            by_bare[bare] = o
    return by_bare


def tasks_for_orders(c, order_ids: list[int]) -> list[dict]:
    tasks = []
    fields = [
        "id",
        "name",
        "project_id",
        "stage_id",
        "state",
        "sale_order_id",
        "sale_line_id",
    ]
    # Try optional studio field
    try:
        fg = kw(
            c,
            "project.task",
            "fields_get",
            ["x_studio_nombre_del_pedido"],
            attributes=["string"],
        )
        if "x_studio_nombre_del_pedido" in fg:
            fields.append("x_studio_nombre_del_pedido")
    except Exception:
        pass

    for batch in chunks(order_ids, 60):
        tasks.extend(
            kw(
                c,
                "project.task",
                "search_read",
                [
                    ("project_id", "in", PROJECT_IDS),
                    "|",
                    ("sale_order_id", "in", batch),
                    ("sale_line_id.order_id", "in", batch),
                ],
                fields=fields,
                limit=2000,
            )
        )
    return tasks


def outgoing_pickings_for_orders(c, so_names: list[str], order_ids: list[int]) -> list[dict]:
    pickings = []
    fields = [
        "id",
        "name",
        "origin",
        "sale_id",
        "state",
        "picking_type_code",
        "partner_id",
        "carrier_id",
    ]
    for batch in chunks(so_names, 40):
        pickings.extend(
            kw(
                c,
                "stock.picking",
                "search_read",
                [("origin", "in", batch), ("picking_type_code", "=", "outgoing")],
                fields=fields,
                limit=500,
            )
        )
    # also via sale_id
    if order_ids:
        for batch in chunks(order_ids, 60):
            more = kw(
                c,
                "stock.picking",
                "search_read",
                [
                    ("sale_id", "in", batch),
                    ("picking_type_code", "=", "outgoing"),
                ],
                fields=fields,
                limit=500,
            )
            seen = {p["id"] for p in pickings}
            for p in more:
                if p["id"] not in seen:
                    pickings.append(p)
    return pickings


def search_tasks_by_name(c, query: str, limit=15) -> list[dict]:
    q = (query or "").strip()
    if len(q) < 3:
        return []
    fields = [
        "id",
        "name",
        "project_id",
        "stage_id",
        "state",
        "sale_order_id",
        "partner_id",
    ]
    domain = [("project_id", "in", PROJECT_IDS), ("name", "ilike", q)]
    hits = kw(c, "project.task", "search_read", domain, fields=fields, limit=limit)
    # studio field
    try:
        fg = kw(
            c,
            "project.task",
            "fields_get",
            ["x_studio_nombre_del_pedido"],
            attributes=["string"],
        )
        if "x_studio_nombre_del_pedido" in fg:
            more = kw(
                c,
                "project.task",
                "search_read",
                [
                    ("project_id", "in", PROJECT_IDS),
                    ("x_studio_nombre_del_pedido", "ilike", q),
                ],
                fields=fields + ["x_studio_nombre_del_pedido"],
                limit=limit,
            )
            seen = {h["id"] for h in hits}
            for m in more:
                if m["id"] not in seen:
                    hits.append(m)
    except Exception:
        pass
    return hits


def mark_moves_picked(c, picking_id: int):
    moves = kw(
        c,
        "stock.move",
        "search_read",
        [("picking_id", "=", picking_id), ("state", "not in", ["done", "cancel"])],
        fields=["id", "product_uom_qty", "quantity", "state"],
    )
    for m in moves:
        qty = m.get("product_uom_qty") or 0
        kw(c, "stock.move", "write", [m["id"]], {"quantity": qty, "picked": True})


def validate_picking(c, picking_id: int):
    return kw(c, "stock.picking", "button_validate", [picking_id])


def process_packing(c, rows: list[dict], apply: bool) -> dict:
    numbers = []
    for r in rows:
        n = bare_order_number(r.get("so_number"))
        if n is not None:
            numbers.append(n)
    numbers = sorted(set(numbers))
    orders = find_orders_by_numbers(c, numbers)
    missing = [n for n in numbers if n not in orders]
    order_ids = [o["id"] for o in orders.values()]
    tasks = tasks_for_orders(c, order_ids) if order_ids else []

    # map order_id -> tasks
    by_so: dict[int, list] = {}
    for t in tasks:
        so = t.get("sale_order_id")
        so_id = so[0] if isinstance(so, (list, tuple)) else so
        if so_id:
            by_so.setdefault(so_id, []).append(t)

    actions = []
    for n in numbers:
        o = orders.get(n)
        if not o:
            actions.append({"so_number": n, "status": "so_missing"})
            continue
        ts = by_so.get(o["id"], [])
        if not ts:
            # try name contains SO
            ts = kw(
                c,
                "project.task",
                "search_read",
                [
                    ("project_id", "in", PROJECT_IDS),
                    ("name", "ilike", o["name"]),
                ],
                fields=[
                    "id",
                    "name",
                    "project_id",
                    "stage_id",
                    "state",
                    "sale_order_id",
                ],
                limit=10,
            )
        if not ts:
            actions.append(
                {
                    "so_number": n,
                    "so_name": o["name"],
                    "status": "task_missing",
                }
            )
            continue
        for t in ts:
            cur = is_empacado_or_hecho(t)
            pid = proj_id(t)
            target_stage = EMPACADO_BY_PROJECT.get(pid)
            entry = {
                "so_number": n,
                "so_name": o["name"],
                "task_id": t["id"],
                "task_name": t["name"],
                "project_id": pid,
                "stage": stage_name(t),
                "state": t.get("state"),
                "target_stage_id": target_stage,
            }
            if cur == "hecho":
                entry["status"] = "skip_already_hecho"
            elif cur == "empacado":
                entry["status"] = "skip_already_empacado"
            elif not target_stage:
                entry["status"] = "no_empacado_stage"
            else:
                entry["status"] = "would_move_empacado"
                if apply:
                    kw(
                        c,
                        "project.task",
                        "write",
                        [t["id"]],
                        {"stage_id": target_stage, "state": "01_in_progress"},
                    )
                    kw(
                        c,
                        "project.task",
                        "message_post",
                        [t["id"]],
                        body=(
                            "Marcado Empacado desde cuaderno "
                            f"(# {n}) sesión 2026-09-09."
                        ),
                    )
                    entry["status"] = "moved_empacado"
            actions.append(entry)

    return {
        "so_requested": numbers,
        "so_found": len(orders),
        "so_missing": missing,
        "actions": actions,
    }


def process_delivery(c, rows: list[dict], apply: bool, carriers: dict[str, int]) -> dict:
    results = []
    for r in rows:
        if r.get("needs_review"):
            results.append({**r, "status": "skip_needs_review"})
            continue
        name = (r.get("raw_name") or "").strip()
        if not name or len(name) < 3:
            results.append({**r, "status": "skip_no_name"})
            continue
        carrier_name = r.get("carrier_canonical") or resolve_carrier_name(
            r.get("carrier_raw"), r.get("address")
        )
        carrier_id = carriers.get(carrier_name) if carrier_name else None

        # Prefer so_number if present on delivery row
        so_n = bare_order_number(r.get("so_number"))
        tasks = []
        order = None
        if so_n:
            orders = find_orders_by_numbers(c, [so_n])
            order = orders.get(so_n)
            if order:
                tasks = tasks_for_orders(c, [order["id"]])

        if not tasks:
            tasks = search_tasks_by_name(c, name)

        # Filter canceled/done preference for open tasks
        open_tasks = [
            t
            for t in tasks
            if (t.get("state") or "") not in ("1_canceled",)
            and "hecho" not in fold(stage_name(t))
        ]
        candidates = open_tasks or tasks

        if not candidates:
            results.append(
                {
                    "raw_name": name,
                    "carrier": carrier_name,
                    "status": "no_match",
                }
            )
            continue
        if len(candidates) > 1:
            # If one clearly contains the name as whole token, prefer it
            folded = fold(name)
            strong = [
                t
                for t in candidates
                if folded in fold(t.get("name") or "")
                and len(fold(t.get("name") or "")) < len(folded) + 40
            ]
            if len(strong) == 1:
                candidates = strong
            else:
                results.append(
                    {
                        "raw_name": name,
                        "carrier": carrier_name,
                        "status": "ambiguous",
                        "hits": [
                            {
                                "id": t["id"],
                                "name": t["name"],
                                "stage": stage_name(t),
                                "sale_order_id": t.get("sale_order_id"),
                            }
                            for t in candidates[:8]
                        ],
                    }
                )
                continue

        t = candidates[0]
        so = t.get("sale_order_id")
        so_id = so[0] if isinstance(so, (list, tuple)) else so
        so_label = so[1] if isinstance(so, (list, tuple)) and len(so) > 1 else None

        if not order and so_id:
            ords = kw(
                c,
                "sale.order",
                "read",
                [so_id],
                fields=["id", "name", "partner_id", "state", "picking_ids"],
            )
            order = ords[0] if ords else None
            so_label = order["name"] if order else so_label

        pickings = []
        if order:
            pickings = outgoing_pickings_for_orders(c, [order["name"]], [order["id"]])
        elif so_label:
            pickings = outgoing_pickings_for_orders(c, [so_label], [so_id] if so_id else [])

        open_p = [p for p in pickings if p.get("state") not in ("done", "cancel")]
        done_p = [p for p in pickings if p.get("state") == "done"]

        entry = {
            "raw_name": name,
            "carrier": carrier_name,
            "carrier_id": carrier_id,
            "task_id": t["id"],
            "task_name": t["name"],
            "stage": stage_name(t),
            "so_name": so_label or (order or {}).get("name"),
            "open_pickings": [
                {"id": p["id"], "name": p["name"], "state": p["state"]} for p in open_p
            ],
            "done_pickings_count": len(done_p),
        }

        if is_empacado_or_hecho(t) == "hecho" and not open_p:
            entry["status"] = "skip_already_done"
            # optionally set carrier on done pickings if empty
            if apply and carrier_id and done_p:
                for p in done_p:
                    if not p.get("carrier_id"):
                        kw(c, "stock.picking", "write", [p["id"]], {"carrier_id": carrier_id})
                        entry["status"] = "set_carrier_on_done"
            results.append(entry)
            continue

        if not open_p:
            entry["status"] = "no_open_picking"
            results.append(entry)
            continue

        entry["status"] = "would_validate"
        if apply:
            errors = []
            for p in open_p:
                try:
                    vals = {}
                    if carrier_id:
                        vals["carrier_id"] = carrier_id
                    if vals:
                        kw(c, "stock.picking", "write", [p["id"]], vals)
                    mark_moves_picked(c, p["id"])
                    validate_picking(c, p["id"])
                    kw(
                        c,
                        "stock.picking",
                        "message_post",
                        [p["id"]],
                        body=(
                            f"Cuaderno entrega 2026-09-09; carrier {carrier_name}; "
                            f"nombre '{name}'."
                        ),
                    )
                except Exception as e:
                    errors.append({"picking_id": p["id"], "error": str(e)})
            entry["status"] = "validated" if not errors else "partial_error"
            entry["errors"] = errors
        results.append(entry)

    return {
        "rows": len(rows),
        "actions": results,
        "summary": {
            "would_validate": sum(1 for x in results if x.get("status") == "would_validate"),
            "validated": sum(1 for x in results if x.get("status") == "validated"),
            "no_match": sum(1 for x in results if x.get("status") == "no_match"),
            "ambiguous": sum(1 for x in results if x.get("status") == "ambiguous"),
            "skip_already_done": sum(
                1 for x in results if x.get("status") == "skip_already_done"
            ),
            "needs_review": sum(
                1 for x in results if x.get("status") == "skip_needs_review"
            ),
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--packing-only", action="store_true")
    parser.add_argument("--delivery-only", action="store_true")
    parser.add_argument(
        "--extracted",
        type=Path,
        default=EXTRACTED_PATH,
        help="Path to extracted.json",
    )
    args = parser.parse_args()
    load_env()
    missing = [
        k
        for k in (
            "ODOO_LIFEDEPORTES_PROD_URL",
            "ODOO_LIFEDEPORTES_PROD_DB",
            "ODOO_LIFEDEPORTES_PROD_USERNAME",
            "ODOO_LIFEDEPORTES_PROD_PASSWORD",
        )
        if not os.environ.get(k)
    ]
    if missing:
        raise SystemExit(f"Missing env: {missing}")

    if not args.extracted.exists():
        raise SystemExit(f"Missing {args.extracted}")

    data = json.loads(args.extracted.read_text())
    packing_rows = data.get("packing_rows") or []
    delivery_rows = data.get("delivery_rows") or []

    c = connect_prod()
    report: dict = {"apply": args.apply}

    do_packing = not args.delivery_only
    do_delivery = not args.packing_only

    if do_packing:
        report["packing"] = process_packing(c, packing_rows, args.apply)
    if do_delivery:
        carriers = load_carriers(c)
        report["carriers_loaded"] = carriers
        report["delivery"] = process_delivery(c, delivery_rows, args.apply, carriers)

    REPORT_OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str))
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
    print(f"Wrote {REPORT_OUT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
