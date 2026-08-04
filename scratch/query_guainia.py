#!/usr/bin/env python3
import os
import xmlrpc.client

url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"]
db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
pwd = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]

common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
uid = common.authenticate(db, user, pwd, {})
models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
print(f"Connected uid={uid}")

today = "2026-07-01"


def sr(model, domain, fields, limit=20):
    return models.execute_kw(
        db, uid, pwd, model, "search_read", [domain],
        {"fields": fields, "limit": limit, "order": "create_date desc"},
    )


orders = sr(
    "sale.order",
    [
        "|",
        ("name", "ilike", "GUAINIA"),
        ("partner_id.name", "ilike", "GUAINIA"),
        ("create_date", ">=", today + " 00:00:00"),
    ],
    ["name", "partner_id", "state", "note", "create_date", "amount_total", "order_line"],
)

print("\n=== GUAINIA prod today ===")
for o in orders:
    print(o)

orders2 = sr(
    "sale.order",
    [
        "|",
        "|",
        ("name", "ilike", "GUAINIA"),
        ("partner_id.name", "ilike", "GUAINIA"),
        ("note", "ilike", "GUAINIA"),
        ("state", "=", "draft"),
    ],
    ["name", "partner_id", "state", "note", "create_date", "amount_total", "order_line"],
    10,
)

print("\n=== GUAINIA prod draft ===")
for o in orders2:
    print(o)

orders3 = sr(
    "sale.order",
    [
        ("create_date", ">=", today + " 00:00:00"),
        ("state", "=", "draft"),
    ],
    ["name", "partner_id", "state", "note", "create_date", "amount_total", "order_line"],
    30,
)

print("\n=== All draft prod today ===")
for o in orders3:
    print(o)
