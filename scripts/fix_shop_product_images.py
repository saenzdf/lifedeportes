#!/usr/bin/env python3
"""Fix Odoo shop images: template swaps, variant mapping, sales-based ordering."""

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
PUBLISHED = [8, 23, 31, 35, 61, 62, 66, 67, 68, 69, 70, 115, 178, 194, 685, 1795, 1797, 1800, 1804, 1811, 1813, 1819]

# website_sequence: lower = more prominent (ordered by historical sales qty desc)
SALES_SEQUENCE = [115, 62, 23, 61, 31, 685, 66, 68, 8, 69, 67, 35, 194, 178, 1813, 1795, 1800, 1797, 70, 1804, 1811, 1819]

TEMPLATE_IMAGES: dict[int, str] = {
    8: "uniforme-presentacion-polo-8.png",
    66: "sudadera-orion-66.png",
    23: "baloncesto-sisa-v-23.png",
    68: "rompevientos-sin-forro-68.png",
    61: "polo-61_sin_dryfit_corta.png",
    1804: "gorra-bordado-life-1804.png",
    115: "futbol-kit-v-simple-115.png",
    70: "tulas-70.png",
    178: "conjunto-arquero-178.png",
    1795: "buso-capota-lotto-1795.png",
    1797: "camiseta-lluvia-1797.png",
    1800: "chaqueta-lotto-sin-forro-1800.png",
    1813: "uniforme-doble-faz-corta-1813.png",
}

VOLEY_FILES = {
    "china": "voley_manga_china_31.png",
    "siza": "voley_manga_sisa_31.png",
    "sport": "voley_cuello_sport_31.png",
    "redondo_licra": "voley-redondo-licra-31.png",
    "redondo_pantaloneta": "voley-redondo-corta-pantaloneta-31.png",
    "redondo": "voley-redondo-corta-pantaloneta-31.png",
    "licra": "voley_licra_31.png",
    "default": "voley_cuello_v_corta_31.png",
}

FUTBOL_FILES = {
    "larga_v": "futbol-kit-larga-v-115.png",
    "larga_escoces": "futbol-kit-larga-escoces-115.png",
    "larga_redondo": "futbol-kit-larga-redondo-115.png",
    "escoces": "futbol-kit-escoces-115.png",
    "redondo": "futbol-kit-redondo-115.png",
    "v": "futbol-kit-v-simple-115.png",
}

POLO_SLUG = {
    ("Con botones", "Corta"): "polo-61_con_dryfit_corta.png",
    ("Con botones", "Larga"): "polo-61_con_dryfit_larga.png",
    ("Sin botones", "Corta"): "polo-61_sin_dryfit_corta.png",
    ("Sin botones", "Larga"): "polo-61_sin_dryfit_larga.png",
}


def odoo_client():
    url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
    password = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, password, {})
    if not uid:
        raise RuntimeError("Odoo auth failed")
    return xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object"), uid, db, user, password


def compress_b64(path: Path) -> str:
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp_path = tmp.name
    subprocess.run(["sips", "-s", "format", "jpeg", "-Z", "1200", str(path), "--out", tmp_path], check=True, capture_output=True)
    data = Path(tmp_path).read_bytes()
    Path(tmp_path).unlink(missing_ok=True)
    return base64.b64encode(data).decode("ascii")


def asset_b64(name: str) -> str:
    path = ASSETS / name
    if not path.exists():
        raise FileNotFoundError(path)
    return compress_b64(path)


def variant_attrs(models, uid, db, pwd, ptav_ids: list[int]) -> dict[str, str]:
    if not ptav_ids:
        return {}
    rows = models.execute_kw(
        db, uid, pwd,
        "product.template.attribute.value", "read",
        [ptav_ids],
        {"fields": ["name", "attribute_id"]},
    )
    return {r["attribute_id"][1]: r["name"] for r in rows}


def pick_voley(attrs: dict[str, str]) -> str:
    manga = attrs.get("Largo Manga", "")
    cuello = attrs.get("Cuello", "")
    pant = attrs.get("Tipo de pantalon", "")
    if manga == "China":
        return VOLEY_FILES["china"]
    if manga == "Siza":
        return VOLEY_FILES["siza"]
    if cuello == "Cuello Personalizado o Sport":
        return VOLEY_FILES["sport"]
    if cuello == "Cuello Redondo":
        if pant == "Licra":
            return VOLEY_FILES["redondo_licra"]
        return VOLEY_FILES["redondo_pantaloneta"]
    if pant == "Licra":
        return VOLEY_FILES["licra"]
    return VOLEY_FILES["default"]


def pick_futbol(attrs: dict[str, str]) -> str:
    manga = attrs.get("Largo Manga", "")
    cuello = attrs.get("Cuello", "")
    if manga == "Larga":
        if cuello == "Cuello Personalizado o Sport":
            return FUTBOL_FILES["larga_escoces"]
        if cuello == "Cuello Redondo":
            return FUTBOL_FILES["larga_redondo"]
        return FUTBOL_FILES["larga_v"]
    if cuello == "Cuello Personalizado o Sport":
        return FUTBOL_FILES["escoces"]
    if cuello == "Cuello Redondo":
        return FUTBOL_FILES["redondo"]
    return FUTBOL_FILES["v"]


def pick_doble_faz(attrs: dict[str, str]) -> str:
    if attrs.get("Largo Manga") == "Larga":
        return "uniforme-doble-faz-larga-1813.png"
    return "uniforme-doble-faz-corta-1813.png"


def pick_chaqueta_lotto(attrs: dict[str, str]) -> str:
    if attrs.get("Forro") == "Con forro":
        return "chaqueta-lotto-con-forro-1800.png"
    return "chaqueta-lotto-sin-forro-1800.png"


def pick_polo(attrs: dict[str, str]) -> str | None:
    # Tela (Dry-fit / Dumonti) no cambia la foto — solo botones × manga.
    key = (
        attrs.get("Tipo de camiseta", ""),
        attrs.get("Largo Manga", ""),
    )
    return POLO_SLUG.get(key)


def upload_templates(models, uid, db, pwd, apply: bool) -> None:
    for tid, fn in TEMPLATE_IMAGES.items():
        print(f"TEMPLATE {tid} <- {fn}")
        if apply:
            models.execute_kw(
                db, uid, pwd,
                "product.template", "write",
                [[tid], {"image_1920": asset_b64(fn)}],
            )


def upload_variants(models, uid, db, pwd, apply: bool) -> None:
    mappings: dict[int, object] = {
        23: lambda a: "baloncesto-sisa-v-23.png" if a.get("Cuello") == "Cuello en V" else "baloncesto-sisa-redondo-23.png",
        31: pick_voley,
        61: pick_polo,
        66: lambda a: "sudadera-orion-con-cremallera.png" if a.get("Cremallera") == "Con cremallera" else "sudadera-orion-sin-cremallera.png",
        68: lambda a: "rompevientos-con-forro-68.png" if a.get("Forro") == "Con forro" else "rompevientos-sin-forro-68.png",
        1800: pick_chaqueta_lotto,
        115: pick_futbol,
        1813: pick_doble_faz,
        35: lambda a: "atletismo_licra_35.png" if a.get("Tipo de pantalon") == "Licra" else "atletismo_pantaloneta_35.png",
        8: lambda a: "uniforme-presentacion-pantalon-8.png" if a.get("Tipo de pantalon") == "Pantalon impermeable" else ("uniforme-presentacion-bermuda-8.png" if a.get("Tipo de pantalon") == "Bermuda de presentación impermeable" else "uniforme-presentacion-polo-8.png"),
    }
    for tid, picker in mappings.items():
        variants = models.execute_kw(
            db, uid, pwd,
            "product.product", "search_read",
            [[("product_tmpl_id", "=", tid)]],
            {"fields": ["id", "display_name", "product_template_attribute_value_ids"]},
        )
        for v in variants:
            attrs = variant_attrs(models, uid, db, pwd, v["product_template_attribute_value_ids"])
            fn = picker(attrs) if callable(picker) else picker
            if not fn:
                print(f"  SKIP {v['id']} incomplete attrs {attrs}")
                continue
            path = ASSETS / fn
            if not path.exists():
                print(f"  MISSING {v['id']} {fn}")
                continue
            print(f"  VARIANT {v['id']} <- {fn}")
            if apply:
                models.execute_kw(
                    db, uid, pwd,
                    "product.product", "write",
                    [[v["id"]], {"image_variant_1920": asset_b64(fn)}],
                )


def reorder_by_sales(models, uid, db, pwd, apply: bool) -> None:
    for seq, tid in enumerate(SALES_SEQUENCE, start=10):
        print(f"SEQUENCE {tid} -> {seq}")
        if apply:
            models.execute_kw(
                db, uid, pwd,
                "product.template", "write",
                [[tid], {"website_sequence": seq}],
            )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--templates-only", action="store_true")
    parser.add_argument("--variants-only", action="store_true")
    parser.add_argument("--sequence-only", action="store_true")
    args = parser.parse_args()

    models, uid, db, user, password = odoo_client()
    if not args.variants_only and not args.sequence_only:
        upload_templates(models, uid, db, password, args.apply)
    if not args.templates_only and not args.sequence_only:
        upload_variants(models, uid, db, password, args.apply)
    if not args.templates_only and not args.variants_only:
        reorder_by_sales(models, uid, db, password, args.apply)

    if not args.apply:
        print("\nDry run. Re-run with --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
