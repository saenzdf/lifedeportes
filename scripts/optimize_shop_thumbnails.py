#!/usr/bin/env python3
"""Force shop product tiles to use image_512 instead of image_1024."""

from __future__ import annotations

import argparse
import os
import textwrap
import xmlrpc.client

WEBSITE_ID = 2
VIEW_KEY = "website_sale.products_item.ld_image_512"
PARENT_KEY = "website_sale.products_item"


def arch() -> str:
    return textwrap.dedent(
        """
        <data>
          <xpath expr="//span[@t-field='primary_image_holder.image_1920']" position="attributes">
            <attribute name="t-options">{'widget': 'image', 'preview_image': 'image_512', 'class': 'oe_product_image_img h-100 w-100'}</attribute>
          </xpath>
          <xpath expr="//span[@t-field='secondary_image_holder.image_1920']" position="attributes">
            <attribute name="t-options">{'widget': 'image', 'preview_image': 'image_512', 'class': 'oe_product_image_img_secondary h-100 w-100'}</attribute>
          </xpath>
        </data>
        """
    ).strip()


def client():
    url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
    password = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    uid = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common").authenticate(db, user, password, {})
    if not uid:
        raise RuntimeError("Odoo auth failed")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)
    return models, uid, db, password


def upsert(dry_run: bool) -> int:
    models, uid, db, password = client()
    parent = models.execute_kw(
        db, uid, password, "ir.ui.view", "search", [[["key", "=", PARENT_KEY]]], {"limit": 1}
    )
    if not parent:
        raise RuntimeError(f"Parent view {PARENT_KEY!r} not found")

    existing = models.execute_kw(
        db,
        uid,
        password,
        "ir.ui.view",
        "search",
        [[["key", "=", VIEW_KEY], ["website_id", "in", [False, WEBSITE_ID]]]],
    )
    vals = {
        "name": "LD Shop product tiles image_512",
        "type": "qweb",
        "key": VIEW_KEY,
        "arch_db": arch(),
        "inherit_id": parent[0],
        "mode": "extension",
        "website_id": WEBSITE_ID,
        "active": True,
        "priority": 32,
    }
    if existing:
        print(f"update {VIEW_KEY} id={existing[0]}")
        if not dry_run:
            models.execute_kw(db, uid, password, "ir.ui.view", "write", [existing, vals])
        return existing[0]

    print(f"create {VIEW_KEY} inheriting {PARENT_KEY} id={parent[0]}")
    if dry_run:
        return 0
    return models.execute_kw(db, uid, password, "ir.ui.view", "create", [vals])


def clear_website_cache() -> None:
    models, uid, db, password = client()
    # Best-effort: clear assets / website cache if methods exist
    for model, method in (
        ("website", "button_clear_cache"),
        ("ir.attachment", "regenerate_assets_bundles"),
    ):
        try:
            models.execute_kw(db, uid, password, model, method, [[]])
            print(f"called {model}.{method}")
        except Exception as exc:  # noqa: BLE001
            print(f"skip {model}.{method}: {exc}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--clear-cache", action="store_true")
    args = parser.parse_args()
    view_id = upsert(dry_run=args.dry_run)
    print(f"view_id={view_id}")
    if args.clear_cache and not args.dry_run:
        clear_website_cache()


if __name__ == "__main__":
    main()
