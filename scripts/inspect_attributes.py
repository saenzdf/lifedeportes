#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import ssl
import xmlrpc.client
from pathlib import Path

def xmlrpc_clients(url: str):
    url = url.rstrip("/")
    ctx = ssl.create_default_context()
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", context=ctx, allow_none=True)
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", context=ctx, allow_none=True)
    return common, models

def main():
    env_path = Path(__file__).resolve().parent.parent / ".env"
    env_vars = {}
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env_vars[k.strip()] = v.strip().strip('"').strip("'")

    url = env_vars.get("ODOO_LIFEDEPORTES_PROD_URL")
    db = env_vars.get("ODOO_LIFEDEPORTES_PROD_DB")
    username = env_vars.get("ODOO_LIFEDEPORTES_PROD_USERNAME")
    password = env_vars.get("ODOO_LIFEDEPORTES_PROD_PASSWORD")

    common, models = xmlrpc_clients(url)
    uid = common.authenticate(db, username, password, {})
    
    for tid in [66, 8]:
        print(f"\n=== Template {tid} ===")
        # Get lines
        lines = models.execute_kw(
            db, uid, password, "product.template.attribute.line", "search_read",
            [[("product_tmpl_id", "=", tid)]],
            {"fields": ["attribute_id", "value_ids"]}
        )
        for line in lines:
            attr_name = line["attribute_id"][1]
            attr_id = line["attribute_id"][0]
            print(f"Attribute: {attr_name} (ID: {attr_id})")
            
            # Get values
            vals = models.execute_kw(
                db, uid, password, "product.template.attribute.value", "search_read",
                [[("attribute_line_id", "=", line["id"])]],
                {"fields": ["name", "price_extra"]}
            )
            for val in vals:
                print(f"  - Value: {val['name']} (ID: {val['id']}), Extra Price: {val['price_extra']}")

if __name__ == "__main__":
    main()
