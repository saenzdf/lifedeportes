#!/usr/bin/env python3
"""Upload lifestyle (in-use) secondary photos to Odoo product.image records."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import xmlrpc.client
from pathlib import Path

LIFESTYLE_DIR = Path(__file__).resolve().parents[1] / "assets" / "product_photos" / "lifestyle"

# product.template id -> lifestyle filename stem (without extension)
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


def resolve_lifestyle_path(stem: str) -> Path:
    for ext in (".png", ".webp", ".jpg"):
        candidate = LIFESTYLE_DIR / f"{stem}{ext}"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"Missing lifestyle asset for {stem} in {LIFESTYLE_DIR}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Create product.image rows in Odoo")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Delete existing lifestyle extras (name starts with 'Lifestyle') before upload",
    )
    args = parser.parse_args()

    report = []
    for product_id, stem in sorted(LIFESTYLE_MAP.items()):
        path = resolve_lifestyle_path(stem)
        report.append(
            {
                "product_id": product_id,
                "stem": stem,
                "path": str(path),
                "filename": path.name,
            }
        )

    manifest_path = LIFESTYLE_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Lifestyle assets: {len(report)}")
    print(f"Manifest: {manifest_path}")
    for row in report:
        print(f"  {row['product_id']:4d} -> {row['filename']}")

    if not args.apply:
        print("\nDry run. Re-run with --apply to upload to Odoo product.image.")
        return 0

    models, uid, db, user, password = odoo_client()
    created = 0
    for row in report:
        product_id = row["product_id"]
        if args.replace:
            existing = models.execute_kw(
                db,
                uid,
                password,
                "product.image",
                "search",
                [[["product_tmpl_id", "=", product_id], ["name", "ilike", "Lifestyle"]]],
            )
            if existing:
                models.execute_kw(db, uid, password, "product.image", "unlink", [existing])

        image_b64 = base64.b64encode(Path(row["path"]).read_bytes()).decode("ascii")
        prod = models.execute_kw(
            db,
            uid,
            password,
            "product.template",
            "read",
            [[product_id]],
            {"fields": ["name"]},
        )[0]
        name = f"Lifestyle — {prod['name']}"
        new_id = models.execute_kw(
            db,
            uid,
            password,
            "product.image",
            "create",
            [
                {
                    "name": name,
                    "product_tmpl_id": product_id,
                    "image_1920": image_b64,
                    "sequence": 10,
                }
            ],
        )
        created += 1
        print(f"Created product.image/{new_id} for template/{product_id} ({row['filename']})")

    print(f"\nDone. {created} lifestyle images uploaded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
