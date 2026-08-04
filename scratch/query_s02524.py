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

# Order lines
lines = models.execute_kw(
    db, uid, pwd, "sale.order.line", "read",
    [[6001, 6002, 6004]],
    {"fields": ["name", "product_id", "product_uom_qty", "price_unit", "price_subtotal"]},
)
print("=== Order lines ===")
for l in lines:
    print(l)

# Partner
partner = models.execute_kw(
    db, uid, pwd, "res.partner", "read",
    [[3284]],
    {"fields": ["name", "phone", "mobile", "email"]},
)
print("\n=== Partner ===")
print(partner)

# Full order
order = models.execute_kw(
    db, uid, pwd, "sale.order", "read",
    [[2522]],
    {"fields": ["name", "state", "amount_total", "note", "order_line"]},
)
print("\n=== Order ===")
print(f"name={order[0]['name']} state={order[0]['state']} total={order[0]['amount_total']}")
