#!/usr/bin/env python3
"""Promote lifestyle images to product cover and sync sales descriptions to web."""

from __future__ import annotations

import argparse
import base64
import html
import os
import re
import sys
import xmlrpc.client
from pathlib import Path

LIFESTYLE_DIR = Path(__file__).resolve().parents[1] / "assets" / "product_photos" / "lifestyle"
CATALOG_DIR = Path(__file__).resolve().parents[1] / "assets" / "product_photos"

LIFESTYLE_MAP: dict[int, str] = {
    115: "lifestyle-uniforme-futbol-115",
    23: "lifestyle-uniforme-baloncesto-23",
    31: "lifestyle-uniforme-voleibol-31",
    35: "lifestyle-uniforme-atletismo-35",
    8: "lifestyle-uniforme-presentacion-8",
    62: "lifestyle-camiseta-manga-corta-62",
    61: "lifestyle-camiseta-polo-61",
    947: "lifestyle-uniforme-futbol-polo-947",
    684: "lifestyle-uniforme-dumonti-684",
    197: "lifestyle-conjunto-polo-pantalon-197",
    67: "lifestyle-pantalon-sudadera-67",
    68: "lifestyle-chaqueta-68",
    194: "lifestyle-bandera-194",
}

CATALOG_MAP: dict[int, str] = {
    115: "uniformes-de-futbol-personalizados-colombia.webp",  # remote - use odoo current
    23: "uniformes-de-baloncesto-personalizados.webp",
    31: "uniformes-de-voleibol-personalizados.webp",
    35: "uniforme-atletismo-lifedeportes.png",
    8: "sudaderas-single.webp",
    62: "futbol-front.webp",
    61: "camiseta-polo-futbol-lifedeportes.png",
    947: "uniforme-futbol-polo-lifedeportes.png",
    684: "futbol-front.webp",
    197: "conjunto-polo-pantalon-lifedeportes.png",
    67: "pantalon-sudadera-lifedeportes.png",
    68: "chaqueta-sudadera-lifedeportes.png",
    194: "bandera-lifedeportes.png",
}


def odoo_client() -> tuple[xmlrpc.client.ServerProxy, int, str, str, str]:
    url = os.environ["ODOO_LIFEDEPORTES_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_USERNAME"]
    password = os.environ["ODOO_LIFEDEPORTES_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, password, {})
    if not uid:
        raise RuntimeError("Odoo authentication failed")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
    return models, uid, db, user, password


def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def sales_text_to_web_html(description_sale: str, description: str) -> str | False:
    sale = (description_sale or "").strip()
    if sale:
        if sale.startswith("<"):
            return sale
        return f"<p>{html.escape(sale)}</p>"

    desc_plain = strip_html(description)
    if desc_plain:
        return f"<p>{html.escape(desc_plain)}</p>"
    return False


def resolve_lifestyle_path(stem: str) -> Path:
    for ext in (".png", ".webp", ".jpg"):
        candidate = LIFESTYLE_DIR / f"{stem}{ext}"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"Missing lifestyle asset: {stem}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    models, uid, db, user, password = odoo_client()
    product_ids = sorted(LIFESTYLE_MAP)
    products = models.execute_kw(
        db,
        uid,
        password,
        "product.template",
        "read",
        [product_ids],
        {
            "fields": [
                "id",
                "name",
                "image_1920",
                "description_sale",
                "description",
                "website_description",
                "description_ecommerce",
                "product_template_image_ids",
            ]
        },
    )
    by_id = {p["id"]: p for p in products}

    for product_id in product_ids:
        product = by_id[product_id]
        lifestyle_path = resolve_lifestyle_path(LIFESTYLE_MAP[product_id])
        web_html = sales_text_to_web_html(
            product.get("description_sale") or "",
            product.get("description") or "",
        )
        print(f"\n[{product_id}] {product['name']}")
        print(f"  cover <= {lifestyle_path.name}")
        if web_html:
            preview = strip_html(web_html)[:80]
            print(f"  web desc <= {preview!r}")
        else:
            print("  web desc <= (sin descripción de venta)")

        if not args.apply:
            continue

        lifestyle_b64 = base64.b64encode(lifestyle_path.read_bytes()).decode("ascii")
        catalog_b64 = product.get("image_1920") or ""

        models.execute_kw(
            db,
            uid,
            password,
            "product.template",
            "write",
            [[product_id], {"image_1920": lifestyle_b64}],
        )

        extra_ids = product.get("product_template_image_ids") or []
        lifestyle_extra_id = None
        if extra_ids:
            extras = models.execute_kw(
                db,
                uid,
                password,
                "product.image",
                "read",
                [extra_ids],
                {"fields": ["id", "name", "image_1920"]},
            )
            for extra in extras:
                if (extra.get("name") or "").startswith("Lifestyle"):
                    lifestyle_extra_id = extra["id"]
                    break

        if catalog_b64:
            catalog_name = f"Catálogo — {product['name']}"
            if lifestyle_extra_id:
                models.execute_kw(
                    db,
                    uid,
                    password,
                    "product.image",
                    "write",
                    [
                        [lifestyle_extra_id],
                        {
                            "name": catalog_name,
                            "image_1920": catalog_b64,
                            "sequence": 20,
                        },
                    ],
                )
            else:
                models.execute_kw(
                    db,
                    uid,
                    password,
                    "product.image",
                    "create",
                    [
                        {
                            "name": catalog_name,
                            "product_tmpl_id": product_id,
                            "image_1920": catalog_b64,
                            "sequence": 20,
                        }
                    ],
                )

        if web_html:
            models.execute_kw(
                db,
                uid,
                password,
                "product.template",
                "write",
                [
                    [product_id],
                    {
                        "website_description": web_html,
                        "description_ecommerce": web_html,
                    },
                ],
            )

        print("  applied")

    if not args.apply:
        print("\nDry run. Re-run with --apply to update Odoo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
