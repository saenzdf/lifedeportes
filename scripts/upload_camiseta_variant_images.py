#!/usr/bin/env python3
"""Map camiseta variant attributes to asset filename and upload to Odoo prod."""

from __future__ import annotations

import argparse
import base64
import os
import subprocess
import sys
import tempfile
from pathlib import Path
import xmlrpc.client

ASSETS = Path(__file__).resolve().parent.parent / "assets" / "product_photos"

MANGA_SLUG = {"Corta": "corta", "Siza": "siza", "China": "china", "Larga": "larga"}
CUELLO_SLUG = {
    "Cuello en V": "v",
    "Cuello Redondo": "redondo",
    "Cuello Personalizado o Sport": "sport",
}


def filename_for(tid: int, attrs: dict[str, str]) -> str:
    """Bordado y tela no cambian la foto visible — siempre usa *_normal."""
    m = MANGA_SLUG[attrs["Largo Manga"]]
    c = CUELLO_SLUG[attrs["Cuello"]]
    return f"camiseta-{tid}_{m}_{c}_normal.png"


def compress_b64(path: Path) -> str:
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp_path = tmp.name
    subprocess.run(
        ["sips", "-s", "format", "jpeg", "-Z", "1200", str(path), "--out", tmp_path],
        check=True,
        capture_output=True,
    )
    data = Path(tmp_path).read_bytes()
    Path(tmp_path).unlink(missing_ok=True)
    return base64.b64encode(data).decode("ascii")


def odoo_client():
    url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
    password = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, password, {})
    if not uid:
        raise RuntimeError("auth failed")
    return xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object"), uid, db, user, password


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--template-ids", type=int, nargs="+", default=[62, 685])
    args = parser.parse_args()

    models, uid, db, user, password = odoo_client()
    missing = []
    uploaded = 0

    for tid in args.template_ids:
        ptavs = {
            p["id"]: (p["attribute_id"][1], p["name"])
            for p in models.execute_kw(
                db, uid, password,
                "product.template.attribute.value", "search_read",
                [[("product_tmpl_id", "=", tid)]],
                {"fields": ["id", "name", "attribute_id"]},
            )
        }
        variants = models.execute_kw(
            db, uid, password,
            "product.product", "search_read",
            [[("product_tmpl_id", "=", tid)]],
            {"fields": ["id", "display_name", "product_template_attribute_value_ids"]},
        )
        for v in variants:
            attrs = {
                ptavs[p][0]: ptavs[p][1]
                for p in v["product_template_attribute_value_ids"]
                if p in ptavs and ptavs[p][0] in ("Largo Manga", "Cuello", "Bordado")
            }
            if len(attrs) != 3:
                print(f"SKIP {v['id']} attrs incomplete: {attrs}")
                continue
            fn = filename_for(tid, attrs)
            path = ASSETS / fn
            if not path.exists():
                missing.append(fn)
                continue
            bordado = attrs.get("Bordado", "")
            print(f"{'UPLOAD' if args.apply else 'PLAN'} {v['id']} <- {fn} (bordado={bordado})")
            if args.apply:
                models.execute_kw(
                    db, uid, password,
                    "product.product", "write",
                    [[v["id"]], {"image_variant_1920": compress_b64(path)}],
                )
                uploaded += 1

    print(f"\nMissing assets: {len(missing)}")
    for m in sorted(set(missing)):
        print(f"  - {m}")
    if args.apply:
        print(f"Uploaded: {uploaded}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
