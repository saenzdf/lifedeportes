#!/usr/bin/env python3
"""Create Life Deportes delivery methods (carriers) on Odoo production.

Idempotent: skips carriers that already exist by name.
Fixed price = 0 (flete al recibir; no inventa cobro en SO).

Usage:
  python scripts/setup_life_delivery_carriers.py          # dry-run
  python scripts/setup_life_delivery_carriers.py --apply
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import xmlrpc.client
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

# Canonical carriers from cuaderno transportadora column.
CARRIERS = [
    {
        "name": "Interrapidísimo",
        "aliases": ["inter", "Inter", "Interrapidisimo", "Interrapidísimo"],
        "default_code": "LIFE-INTER",
    },
    {
        "name": "Envía",
        "aliases": ["Envia", "Envía", "envia"],
        "default_code": "LIFE-ENVIA",
    },
    {
        "name": "Moto",
        "aliases": ["Moto", "moto"],
        "default_code": "LIFE-MOTO",
    },
    {
        "name": "Mensajero",
        "aliases": ["Mensajero", "mensajero"],
        "default_code": "LIFE-MENSAJERO",
    },
    {
        "name": "Carro",
        "aliases": ["Carro", "carro"],
        "default_code": "LIFE-CARRO",
    },
    {
        "name": "Terminal",
        "aliases": ["Terminal", "terminal"],
        "default_code": "LIFE-TERMINAL",
    },
]

SERVICE_PRODUCT_CODE = "LIFE-FLETE"
SERVICE_PRODUCT_NAME = "Flete Life (al recibir)"


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


def ensure_delivery_module(c) -> bool:
    mods = kw(
        c,
        "ir.module.module",
        "search_read",
        [("name", "=", "delivery")],
        fields=["id", "name", "state"],
        limit=1,
    )
    if not mods:
        print("Module 'delivery' not found in Apps.", file=sys.stderr)
        return False
    mod = mods[0]
    if mod["state"] == "installed":
        return True
    print(f"Installing module delivery (state={mod['state']})...", file=sys.stderr)
    kw(c, "ir.module.module", "button_immediate_install", [mod["id"]])
    return True


def ensure_service_product(c, apply: bool) -> int | None:
    existing = kw(
        c,
        "product.product",
        "search_read",
        [("default_code", "=", SERVICE_PRODUCT_CODE)],
        fields=["id", "name", "default_code", "type"],
        limit=1,
    )
    if existing:
        print(f"Service product exists id={existing[0]['id']}", file=sys.stderr)
        return existing[0]["id"]

    # Prefer product.template create then get variant
    tmpl = kw(
        c,
        "product.template",
        "search_read",
        [("default_code", "=", SERVICE_PRODUCT_CODE)],
        fields=["id", "product_variant_id"],
        limit=1,
    )
    if tmpl:
        vid = tmpl[0].get("product_variant_id")
        if isinstance(vid, (list, tuple)):
            return vid[0]
        return vid

    vals = {
        "name": SERVICE_PRODUCT_NAME,
        "default_code": SERVICE_PRODUCT_CODE,
        "type": "service",
        "list_price": 0.0,
        "sale_ok": False,
        "purchase_ok": False,
        "invoice_policy": "order",
    }
    if not apply:
        print(f"DRY-RUN would create product.template {vals}", file=sys.stderr)
        return None
    tid = kw(c, "product.template", "create", vals)
    created = kw(
        c,
        "product.template",
        "read",
        [tid],
        fields=["product_variant_id"],
    )[0]
    vid = created["product_variant_id"]
    pid = vid[0] if isinstance(vid, (list, tuple)) else vid
    print(f"Created service product template={tid} product={pid}", file=sys.stderr)
    return pid


def normalize_name(s: str) -> str:
    return (s or "").strip().casefold()


def find_carrier(c, name: str, aliases: list[str]) -> dict | None:
    names = [name] + list(aliases)
    for n in names:
        hits = kw(
            c,
            "delivery.carrier",
            "search_read",
            [("name", "=ilike", n)],
            fields=["id", "name", "delivery_type", "fixed_price", "product_id", "active"],
            limit=5,
        )
        if hits:
            # Prefer exact canonical name
            for h in hits:
                if normalize_name(h["name"]) == normalize_name(name):
                    return h
            return hits[0]
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
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
        raise SystemExit(f"Missing env: {missing}. Add to .env or secrets. Prod URL should be https://lifedeportes.odoo.com db=lifedeportes.")

    c = connect_prod()
    if not ensure_delivery_module(c):
        raise SystemExit("Cannot proceed without delivery module")

    # Confirm model exists
    try:
        kw(c, "delivery.carrier", "fields_get", [], attributes=["string"])
    except Exception as e:
        raise SystemExit(f"delivery.carrier unavailable: {e}")

    product_id = ensure_service_product(c, args.apply)
    report = {"apply": args.apply, "product_id": product_id, "carriers": []}

    for spec in CARRIERS:
        existing = find_carrier(c, spec["name"], spec["aliases"])
        if existing:
            report["carriers"].append(
                {
                    "action": "exists",
                    "id": existing["id"],
                    "name": existing["name"],
                    "fixed_price": existing.get("fixed_price"),
                }
            )
            continue

        vals = {
            "name": spec["name"],
            "delivery_type": "fixed",
            "fixed_price": 0.0,
            "active": True,
        }
        if product_id:
            vals["product_id"] = product_id
        if not args.apply:
            report["carriers"].append({"action": "would_create", "vals": vals})
            continue
        if not product_id:
            raise SystemExit("Need product_id to create carriers")
        cid = kw(c, "delivery.carrier", "create", vals)
        report["carriers"].append({"action": "created", "id": cid, "name": spec["name"]})
        print(f"Created carrier {spec['name']} id={cid}", file=sys.stderr)

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
