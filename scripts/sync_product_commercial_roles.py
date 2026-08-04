#!/usr/bin/env python3
"""Tag Odoo product.template records with x_ld_commercial_role."""

from __future__ import annotations

import argparse
import os
import sys
import xmlrpc.client

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.export_sellable_catalog import infer_commercial_role, normalize_category


def odoo_client() -> tuple[xmlrpc.client.ServerProxy, int, str, str, str]:
    url = os.environ["ODOO_LIFEDEPORTES_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_USERNAME"]
    password = os.environ["ODOO_LIFEDEPORTES_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, password, {})
    if not uid:
        raise SystemExit("Odoo authentication failed")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
    return models, uid, db, password, url


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Only print planned updates")
    args = parser.parse_args()

    models, uid, db, password, url = odoo_client()
    products = models.execute_kw(
        db,
        uid,
        password,
        "product.template",
        "search_read",
        [[["sale_ok", "=", True]]],
        {"fields": ["id", "name", "x_ld_commercial_role"], "limit": 1000},
    )

    updated = 0
    for product in products:
        name = product.get("name", "")
        category = normalize_category(name)
        role = infer_commercial_role(category, name)
        current = product.get("x_ld_commercial_role")
        if current == role:
            continue
        print(f"{product['id']:>4} {role:<13} {name}")
        if not args.dry_run:
            models.execute_kw(
                db,
                uid,
                password,
                "product.template",
                "write",
                [[product["id"]], {"x_ld_commercial_role": role}],
            )
        updated += 1

    print(f"Done. {'Would update' if args.dry_run else 'Updated'} {updated} products on {url}")


if __name__ == "__main__":
    main()
