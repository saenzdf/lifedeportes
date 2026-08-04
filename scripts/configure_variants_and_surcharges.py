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
    if not uid:
        print("Failed to authenticate.")
        return 1

    print("--- 1. Configuring Cremallera Attribute for Sudadera Orión (ID 66) ---")
    # Check if 'Cremallera' attribute exists
    attr_ids = models.execute_kw(
        db, uid, password, "product.attribute", "search",
        [[("name", "=", "Cremallera")]]
    )
    if attr_ids:
        attr_id = attr_ids[0]
        print(f"Attribute 'Cremallera' already exists (ID: {attr_id})")
    else:
        attr_id = models.execute_kw(
            db, uid, password, "product.attribute", "create",
            [{"name": "Cremallera", "create_variant": "always"}]
        )
        print(f"Created Attribute 'Cremallera' (ID: {attr_id})")

    # Check/create attribute values 'Sin cremallera' and 'Con cremallera'
    val_ids = {}
    for name in ["Sin cremallera", "Con cremallera"]:
        ids = models.execute_kw(
            db, uid, password, "product.attribute.value", "search",
            [[("attribute_id", "=", attr_id), ("name", "=", name)]]
        )
        if ids:
            val_ids[name] = ids[0]
            print(f"Attribute Value '{name}' already exists (ID: {ids[0]})")
        else:
            vid = models.execute_kw(
                db, uid, password, "product.attribute.value", "create",
                [{"name": name, "attribute_id": attr_id}]
            )
            val_ids[name] = vid
            print(f"Created Attribute Value '{name}' (ID: {vid})")

    # Link to template 66 (Sudadera Orión)
    line_ids = models.execute_kw(
        db, uid, password, "product.template.attribute.line", "search",
        [[("product_tmpl_id", "=", 66), ("attribute_id", "=", attr_id)]]
    )
    if line_ids:
        line_id = line_ids[0]
        print(f"Attribute line for 'Cremallera' already linked to Orión (ID: {line_id})")
    else:
        line_id = models.execute_kw(
            db, uid, password, "product.template.attribute.line", "create",
            [{
                "product_tmpl_id": 66,
                "attribute_id": attr_id,
                "value_ids": [[6, 0, [val_ids["Sin cremallera"], val_ids["Con cremallera"]]]]
            }]
        )
        print(f"Linked 'Cremallera' attribute line to Orión template (ID: {line_id})")

    # Set price extra for 'Con cremallera' to +10,000 COP on template 66
    ptav_ids = models.execute_kw(
        db, uid, password, "product.template.attribute.value", "search",
        [[("product_tmpl_id", "=", 66), ("attribute_id", "=", attr_id), ("name", "=", "Con cremallera")]]
    )
    if ptav_ids:
        ptav_id = ptav_ids[0]
        models.execute_kw(
            db, uid, password, "product.template.attribute.value", "write",
            [[ptav_id], {"price_extra": 10000.0}]
        )
        print(f"Set 'Con cremallera' price_extra to 10000.0 on template 66 (PTAV ID: {ptav_id})")
    else:
        print("Warning: could not find product.template.attribute.value for 'Con cremallera' on template 66")


    print("\n--- 2. Configuring Bermuda de presentación impermeable for Presentación (ID 8) ---")
    # For template 8, the attribute line is 'Tipo de pantalon' (ID 19)
    # Let's search for this line
    line_ids = models.execute_kw(
        db, uid, password, "product.template.attribute.line", "search",
        [[("product_tmpl_id", "=", 8), ("attribute_id", "=", 19)]]
    )
    if line_ids:
        line_id = line_ids[0]
        # Check if 'Bermuda de presentación impermeable' exists as a global product.attribute.value for attribute 19
        val_ids = models.execute_kw(
            db, uid, password, "product.attribute.value", "search",
            [[("attribute_id", "=", 19), ("name", "=", "Bermuda de presentación impermeable")]]
        )
        if val_ids:
            val_id = val_ids[0]
            print(f"Attribute Value 'Bermuda de presentación impermeable' already exists (ID: {val_id})")
        else:
            val_id = models.execute_kw(
                db, uid, password, "product.attribute.value", "create",
                [{"name": "Bermuda de presentación impermeable", "attribute_id": 19}]
            )
            print(f"Created Attribute Value 'Bermuda de presentación impermeable' (ID: {val_id})")

        # Link value to the attribute line on template 8
        line = models.execute_kw(
            db, uid, password, "product.template.attribute.line", "read",
            [[line_id], ["value_ids"]]
        )[0]
        current_val_ids = line["value_ids"]
        if val_id not in current_val_ids:
            current_val_ids.append(val_id)
            models.execute_kw(
                db, uid, password, "product.template.attribute.line", "write",
                [[line_id], {"value_ids": [[6, 0, current_val_ids]]}]
            )
            print("Linked 'Bermuda de presentación impermeable' to Presentación template attribute line.")
        else:
            print("'Bermuda de presentación impermeable' already linked to Presentación template.")

        # Set price extra to +3,000 COP for 'Bermuda de presentación impermeable' on template 8
        ptav_ids = models.execute_kw(
            db, uid, password, "product.template.attribute.value", "search",
            [[("product_tmpl_id", "=", 8), ("attribute_id", "=", 19), ("name", "=", "Bermuda de presentación impermeable")]]
        )
        if ptav_ids:
            ptav_id = ptav_ids[0]
            models.execute_kw(
                db, uid, password, "product.template.attribute.value", "write",
                [[ptav_id], {"price_extra": 3000.0}]
            )
            print(f"Set 'Bermuda de presentación impermeable' price_extra to 3000.0 (PTAV ID: {ptav_id})")
        else:
            print("Warning: could not find product.template.attribute.value for 'Bermuda de presentación impermeable' on template 8")
    else:
        print("Warning: attribute line for 'Tipo de pantalon' (ID 19) not found on Presentación template 8")

    print("\nVariant configuration successfully completed!")
    return 0

if __name__ == "__main__":
    import sys
    sys.exit(main())
