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

# Full order with tax fields
order = models.execute_kw(
    db, uid, pwd, "sale.order", "read",
    [[2522]],
    {"fields": ["name", "state", "amount_total", "amount_untaxed", "amount_tax", "order_line"]},
)
print("Order:", order)

# Search arquero products
for term in ["arquero", "Conjunto de arquero"]:
    prods = models.execute_kw(
        db, uid, pwd, "product.template", "search_read",
        [[("name", "ilike", term), ("sale_ok", "=", True)]],
        {"fields": ["name", "list_price", "id"], "limit": 5},
    )
    print(f"\nTemplate '{term}':", prods)

# product.product for template 178
pp = models.execute_kw(
    db, uid, pwd, "product.product", "search_read",
    [[("product_tmpl_id", "=", 178)]],
    {"fields": ["id", "name", "list_price"]},
)
print("\nArquero variants (178):", pp)

# Partner phone
partner = models.execute_kw(
    db, uid, pwd, "res.partner", "read",
    [[3284]],
    {"fields": ["name", "phone", "email"]},
)
print("\nPartner:", partner)
