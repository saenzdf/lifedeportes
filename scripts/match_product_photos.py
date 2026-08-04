#!/usr/bin/env python3
"""Index lifedeportes.com photos and assign modern images to published Odoo products."""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import urllib.request
import xmlrpc.client
from collections import Counter
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from pathlib import Path

BASE_URL = "https://lifedeportes.com"
PAGES = [f"{BASE_URL}/", f"{BASE_URL}/gallery"]
GENERATED_ASSETS_DIR = Path(__file__).resolve().parents[1] / "assets" / "product_photos"

# Curated mapping: product.template id -> best modern photo on the public site.
PRODUCT_PHOTO_OVERRIDES: dict[int, str] = {
    115: f"{BASE_URL}/img/uniformes-de-futbol-personalizados-colombia.webp",
    23: f"{BASE_URL}/img/uniformes-de-baloncesto-personalizados.webp",
    31: f"{BASE_URL}/img/uniformes-de-voleibol-personalizados.webp",
    35: str(GENERATED_ASSETS_DIR / "uniforme-atletismo-lifedeportes.png"),
    8: str(GENERATED_ASSETS_DIR / "uniforme-presentacion-polo-8.png"),
    66: str(GENERATED_ASSETS_DIR / "sudadera-orion-66.png"),
    62: f"{BASE_URL}/img/futbol-front.webp",
    61: str(GENERATED_ASSETS_DIR / "camiseta-polo-futbol-lifedeportes.png"),
    947: str(GENERATED_ASSETS_DIR / "uniforme-futbol-polo-lifedeportes.png"),
    684: f"{BASE_URL}/img/futbol-front.webp",
    197: str(GENERATED_ASSETS_DIR / "conjunto-polo-pantalon-lifedeportes.png"),
    # Generated catalog assets; no suitable isolated photos existed on the public site.
    67: str(GENERATED_ASSETS_DIR / "pantalon-sudadera-lifedeportes.png"),
    68: str(GENERATED_ASSETS_DIR / "rompevientos-sin-forro-68.png"),
    194: str(GENERATED_ASSETS_DIR / "bandera-lifedeportes.png"),
    # Newly published products without suitable site photos.
    685: str(GENERATED_ASSETS_DIR / "camiseta-deportiva-685.png"),
    178: str(GENERATED_ASSETS_DIR / "conjunto-arquero-178.png"),
    1804: str(GENERATED_ASSETS_DIR / "gorra-bordado-life-1804.png"),
    69: str(GENERATED_ASSETS_DIR / "petos-sublimados-69.png"),
    1811: str(GENERATED_ASSETS_DIR / "sudadera-algodon-lycrado-1811.png"),
    1819: str(GENERATED_ASSETS_DIR / "uniforme-bordado-1819.png"),
    1815: str(GENERATED_ASSETS_DIR / "uniforme-pantaloneta-impermeable-1815.png"),
    70: str(GENERATED_ASSETS_DIR / "tulas-70.png"),
    1795: str(GENERATED_ASSETS_DIR / "buso-capota-lotto-1795.png"),
    1797: str(GENERATED_ASSETS_DIR / "camiseta-lluvia-1797.png"),
    1800: str(GENERATED_ASSETS_DIR / "chaqueta-lotto-sin-forro-1800.png"),
    1813: str(GENERATED_ASSETS_DIR / "uniforme-doble-faz-corta-1813.png"),
}


@dataclass
class PhotoAsset:
    url: str
    alt: str
    page: str
    sport: str
    product_type: str
    view: str
    source: str
    filename: str
    modern_score: int


class ImgParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.imgs: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "img":
            return
        data = dict(attrs)
        src = data.get("src") or data.get("data-src") or ""
        alt = data.get("alt") or ""
        if src and "logo" not in src.lower() and "icon-" not in src:
            self.imgs.append({"src": src, "alt": alt})


def norm_url(src: str) -> str:
    if src.startswith("http"):
        return src
    if src.startswith("/"):
        return BASE_URL + src
    return f"{BASE_URL}/{src.lstrip('./')}"


def classify_photo(src: str, alt: str) -> dict[str, str | int]:
    text = f"{src} {alt}".lower()
    sport = "general"
    for key, tokens in {
        "futbol": ("futbol", "fútbol"),
        "baloncesto": ("baloncesto", "basketball", "basket"),
        "voleibol": ("voleibol",),
        "sudaderas": ("sudadera",),
        "atletismo": ("atletismo",),
    }.items():
        if any(token in text for token in tokens):
            sport = key
            break

    if any(token in text for token in ("camiseta", "dry fit", "dumonti", "falcao", "manga corta", "manga larga")):
        product_type = "camiseta_sola"
    elif "polo" in text and ("uniforme" in text or "conjunto" in text):
        product_type = "uniforme_completo"
    elif "polo" in text:
        product_type = "camiseta_sola"
    elif any(token in text for token in ("sudadera", "chaqueta")):
        product_type = "sudadera"
    elif "presentacion" in text or "presentación" in text:
        product_type = "presentacion"
    elif "bandera" in text:
        product_type = "bandera"
    else:
        product_type = "uniforme_completo"

    view = "front" if "front" in text else ("back" if "back" in text else "gallery")
    source = "homepage" if "gallery/" not in src else "gallery"
    filename = src.split("/")[-1].split("?")[0]
    modern_score = 0
    if source == "homepage":
        modern_score += 3
    if view == "front":
        modern_score += 2
    if "personalizado" in text:
        modern_score += 2
    if "hero" in text or "categoria-" in src:
        modern_score += 1
    return {
        "sport": sport,
        "product_type": product_type,
        "view": view,
        "source": source,
        "filename": filename,
        "modern_score": modern_score,
    }


def build_photo_index() -> dict[str, PhotoAsset]:
    index: dict[str, PhotoAsset] = {}
    for page in PAGES:
        req = urllib.request.Request(page, headers={"User-Agent": "Mozilla/5.0"})
        html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
        parser = ImgParser()
        parser.feed(html)
        for img in parser.imgs:
            url = norm_url(img["src"])
            if url in index:
                continue
            meta = classify_photo(url, img["alt"])
            index[url] = PhotoAsset(url=url, alt=img["alt"], page=page, **meta)
    return index


def classify_product(name: str) -> tuple[str, str]:
    text = name.lower()
    sport = "general"
    if "fútbol" in text or "futbol" in text:
        sport = "futbol"
    elif "baloncesto" in text:
        sport = "baloncesto"
    elif "voleibol" in text:
        sport = "voleibol"
    elif "atletismo" in text:
        sport = "atletismo"
    elif "sudadera" in text or "chaqueta" in text:
        sport = "sudaderas"

    if "bandera" in text:
        ptype = "bandera"
    elif "presentación" in text or "presentacion" in text:
        ptype = "presentacion"
    elif "pantalón de sudadera" in text or "chaqueta" in text:
        ptype = "sudadera"
    elif "camiseta" in text and "uniforme" not in text:
        ptype = "camiseta_sola"
    elif "uniforme" in text or "conjunto" in text:
        ptype = "uniforme_completo"
    else:
        ptype = "otros"
    return sport, ptype


def pick_photo(product_id: int, sport: str, ptype: str, index: dict[str, PhotoAsset]) -> tuple[str, str]:
    if product_id in PRODUCT_PHOTO_OVERRIDES:
        return PRODUCT_PHOTO_OVERRIDES[product_id], "override"

    candidates = [
        asset
        for asset in index.values()
        if asset.product_type == ptype and (asset.sport == sport or sport == "general")
    ]
    if not candidates:
        candidates = [asset for asset in index.values() if asset.sport == sport]
    if not candidates:
        candidates = list(index.values())
    best = sorted(
        candidates,
        key=lambda asset: (-asset.modern_score, asset.view == "front", asset.source == "homepage"),
    )[0]
    return best.url, "heuristic"


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


def fetch_image_b64(source: str) -> str:
    if source.startswith(("http://", "https://")):
        req = urllib.request.Request(source, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=30).read()
    else:
        data = Path(source).read_bytes()
    return base64.b64encode(data).decode("ascii")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write image_1920 to Odoo products")
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parents[2] / "photo_index.json"),
        help="Where to write the index + match report",
    )
    args = parser.parse_args()

    index = build_photo_index()
    models, uid, db, user, password = odoo_client()
    products = models.execute_kw(
        db,
        uid,
        password,
        "product.template",
        "search_read",
        [[["sale_ok", "=", True], ["is_published", "=", True]]],
        {"fields": ["id", "name", "image_128"]},
    )

    matches = []
    for product in sorted(products, key=lambda row: row["name"]):
        sport, ptype = classify_product(product["name"])
        photo_url, method = pick_photo(product["id"], sport, ptype, index)
        matches.append(
            {
                "id": product["id"],
                "name": product["name"],
                "sport": sport,
                "product_type": ptype,
                "had_image": bool(product.get("image_128")),
                "photo_url": photo_url,
                "photo_file": photo_url.split("/")[-1],
                "method": method,
            }
        )

    payload = {
        "photo_count": len(index),
        "photo_summary": {
            "sport": dict(Counter(asset.sport for asset in index.values())),
            "product_type": dict(Counter(asset.product_type for asset in index.values())),
        },
        "photos": [asdict(asset) for asset in index.values()],
        "matches": matches,
    }
    output_path = Path(args.output)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Indexed {len(index)} photos from lifedeportes.com")
    print(f"Matched {len(matches)} published products")
    print(f"Report: {output_path}")
    for row in matches:
        action = "APPLY" if args.apply else "PLAN"
        print(
            f"[{action}] {row['id']:4d} {row['name'][:42]:42} -> {row['photo_file']} ({row['method']})"
        )

    if not args.apply:
        print("\nDry run only. Re-run with --apply to upload images to Odoo.")
        return 0

    updated = 0
    for row in matches:
        image_b64 = fetch_image_b64(row["photo_url"])
        models.execute_kw(
            db,
            uid,
            password,
            "product.template",
            "write",
            [[row["id"]], {"image_1920": image_b64}],
        )
        updated += 1
        print(f"Updated product.template/{row['id']} with {row['photo_file']}")

    print(f"\nDone. Updated {updated} products.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
