#!/usr/bin/env python3
"""Configure Odoo shop SEO: shop landing homepage, shop meta, product SEO.

CRITICAL — Galería trabajos reales (Facebook):
  Do NOT unpublish /gallery or 301 to lifedeportes.com/galeria.html by default.
  That SEO redirect + push_ld_pages_via_rpc.py (--gallery) previously bulldozed
  the Facebook photo walls. Restore with:
    scripts/update_odoo_gallery_from_social.py --from-assets --apply
  Explicit destructive opt-in only: --remove-gallery
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import textwrap
import xmlrpc.client
from pathlib import Path

# Reuse product copy definitions
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sync_product_shop_copy import PRESUPUESTO, WEB  # noqa: E402

WEBSITE_ID = 2
GALLERY_PAGE_ID = 10
GALLERY_MENU_ID = 17
SHOP_MENU_ID = 19
ABOUT_MENU_ID = 18
HOME_PAGE_ID = 11
HOME_VIEW_ID = 5324
GALLERY_REDIRECT_FROM = "/gallery"
GALLERY_REDIRECT_TO = "https://lifedeportes.com/galeria.html"
SHOP_SEO_VIEW_KEY = "website_sale.products.ld_shop_seo"
SHOP_META_VIEW_KEY = "website.layout.ld_shop_meta"

HOME_META = {
    "name": "Tienda Life Deportes",
    "website_meta_title": "Tienda de Uniformes Deportivos | Catálogo Life Deportes",
    "website_meta_description": (
        "Catálogo online de uniformes deportivos personalizados: fútbol, baloncesto, "
        "voleibol y sudaderas. Configura variantes y cotiza. Pedido mínimo 6 unidades."
    ),
    "website_meta_keywords": (
        "tienda uniformes deportivos, catálogo uniformes Colombia, comprar uniformes personalizados"
    ),
}

SHOP_ADDITIONAL_TITLE = "Catálogo de Uniformes Deportivos"
SHOP_META_DESCRIPTION = (
    "Catálogo online de uniformes deportivos personalizados en Colombia. "
    "Fútbol, baloncesto, voleibol, sudaderas y complementos. Pedido mínimo 6 unidades."
)
SHOP_H1 = "Catálogo de uniformes deportivos"

PRODUCT_SEO_TITLE: dict[int, str] = {
    115: "Comprar Uniforme de Fútbol Personalizado",
    62: "Camiseta Deportiva Dry-Fit Personalizada",
    23: "Comprar Uniforme de Baloncesto Personalizado",
    61: "Camiseta Polo Deportiva Personalizada",
    31: "Comprar Uniforme de Voleibol Personalizado",
    685: "Camiseta Deportiva Dumonti Personalizada",
    66: "Sudadera Chaqueta y Pantalón Orión",
    68: "Chaqueta Rompevientos con Capota",
    8: "Uniforme de Presentación Polo",
    69: "Peto Sublimado para Entrenamiento",
    67: "Pantalón de Sudadera Personalizado",
    35: "Uniforme de Atletismo Personalizado",
    194: "Bandera Institucional Sublimada",
    178: "Conjunto de Arquero Personalizado",
    1813: "Uniforme Camiseta Doble Faz",
    1795: "Buso con Capota Algodón Lotto",
    1800: "Chaqueta Algodón Lotto Sublimable",
    1797: "Camiseta Deportiva para Lluvia",
    70: "Tula Deportiva Sublimada",
    1804: "Gorra con Bordado Personalizado",
    1811: "Sudadera Algodón Lycrado con Bordado",
    1819: "Uniforme con Bordado Incluido",
}

BRAND_SUFFIX = " | Life Deportes"


def odoo_client() -> tuple[xmlrpc.client.ServerProxy, int, str, str, str]:
    url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
    db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
    user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
    password = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, password, {})
    if not uid:
        raise RuntimeError("Odoo auth failed")
    return xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object"), uid, db, user, password


def extract_template_fragment(xml_file: Path, template_id: str) -> str:
    text = xml_file.read_text(encoding="utf-8")
    match = re.search(
        rf'<template\b[^>]*\bid=["\']{re.escape(template_id)}["\'][^>]*>(.*?)</template>',
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if not match:
        raise RuntimeError(f"Template {template_id!r} not found in {xml_file}")
    return match.group(1).strip()


def shop_landing_css() -> str:
    return textwrap.dedent(
        """
        .ld-shop-landing{font-family:'DM Sans',system-ui,sans-serif;color:#1a1a2e}
        .ld-shop-landing h1,.ld-shop-landing h2{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase}
        .ld-shop-hero{background:linear-gradient(135deg,#051B36 0%,#0a3060 55%,#051B36 100%);color:#fff;padding:72px 0 56px}
        .ld-shop-hero-inner{max-width:920px}
        .ld-shop-badge{display:inline-block;font-size:.75rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
          padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);margin-bottom:18px}
        .ld-shop-hero h1{font-size:clamp(2rem,5vw,3.2rem);line-height:1.05;margin:0 0 16px}
        .ld-shop-lead{font-size:1.05rem;line-height:1.65;opacity:.95;max-width:760px;margin-bottom:24px}
        .ld-shop-actions{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:18px}
        .ld-shop-btn-primary{background:#0F385F!important;border:none!important;border-radius:999px!important;
          padding:.85rem 1.6rem!important;font-weight:700!important;text-transform:uppercase!important}
        .ld-shop-btn-outline{border:2px solid rgba(255,255,255,.65)!important;border-radius:999px!important;
          padding:.75rem 1.35rem!important;font-weight:700!important;text-transform:uppercase!important;color:#fff!important}
        .ld-shop-note{font-size:.92rem;opacity:.9;margin:0}
        .ld-shop-note a{color:#9ec5f0;text-decoration:underline}
        .ld-shop-featured{padding:56px 0 40px;background:#f8f9fa}
        .ld-shop-featured h2{font-size:clamp(1.8rem,4vw,2.4rem);margin:0 0 8px;color:#051B36}
        .ld-shop-sub{color:#5a6677;margin:0 0 28px}
        .ld-shop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}
        .ld-shop-card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(5,27,54,.08);
          text-decoration:none!important;color:inherit!important;display:flex;flex-direction:column;height:100%}
        .ld-shop-card img{width:100%;aspect-ratio:4/5;object-fit:cover;background:#eef1f5}
        .ld-shop-card-body{padding:14px 16px 18px;display:flex;flex-direction:column;gap:8px;flex:1}
        .ld-shop-card h3{font-size:1rem;font-weight:700;margin:0;line-height:1.3;text-transform:none;font-family:inherit}
        .ld-shop-card p{font-size:.86rem;color:#5a6677;margin:0;line-height:1.45;flex:1}
        .ld-shop-price{font-weight:800;color:#0F385F;font-size:1rem}
        .ld-shop-trust{padding:36px 0;background:#fff;border-top:1px solid rgba(5,27,54,.06)}
        .ld-shop-trust-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:20px;text-align:center}
        .ld-shop-trust strong{display:block;font-family:'Barlow Condensed',sans-serif;font-size:1.8rem;color:#051B36}
        .ld-shop-trust span{font-size:.82rem;color:#5a6677;text-transform:uppercase;letter-spacing:.05em}
        .ld-shop-cta{padding:52px 0 64px;background:linear-gradient(135deg,#0F385F 0%,#051B36 100%);color:#fff}
        .ld-shop-cta h2{font-size:clamp(1.6rem,3.5vw,2.2rem);margin-bottom:10px}
        .ld-shop-cta p{opacity:.92;margin-bottom:22px}
        """
    ).strip()


def featured_products_html(models, uid, db, user, password, base_url: str, limit: int = 8) -> str:
    products = models.execute_kw(
        db,
        uid,
        password,
        "product.template",
        "search_read",
        [[["is_published", "=", True]]],
        {
            "fields": ["id", "name", "website_url", "list_price", "description_sale"],
            "order": "website_sequence asc",
            "limit": limit,
        },
    )
    cards: list[str] = []
    for product in products:
        pid = product["id"]
        href = product.get("website_url") or f"/shop?search={product['name']}"
        img = f"{base_url}/web/image/product.template/{pid}/image_512"
        desc = product.get("description_sale") or PRESUPUESTO.get(pid, "")
        price = f"$ {int(product['list_price']):,}".replace(",", ".")
        cards.append(
            f"""
            <a class="ld-shop-card" href="{href}">
              <img src="{img}" alt="{product['name']}" loading="lazy"/>
              <div class="ld-shop-card-body">
                <h3>{product['name']}</h3>
                <p>{desc}</p>
                <span class="ld-shop-price">Desde {price}</span>
              </div>
            </a>
            """.strip()
        )
    return "\n".join(cards)


def build_homepage_arch(featured_html: str, view_key: str) -> str:
    theme_views = Path(__file__).resolve().parents[1] / "odoo_website" / "lifedeportes_theme" / "views"
    inner = extract_template_fragment(theme_views / "shop_landing_homepage.xml", "shop_landing_homepage")
    inner = inner.replace(
        '<div class="ld-shop-grid" data-ld-featured-products="1"/>',
        f'<div class="ld-shop-grid">{featured_html}</div>',
    )
    inner = inner.replace(
        '<div id="wrap" class="oe_structure ld-shop-landing">',
        '<div id="wrap" class="oe_structure ld-shop-landing">\n'
        f'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&amp;family=DM+Sans:wght@400;500;700&amp;display=swap"/>\n'
        f"<style type=\"text/css\">\n{shop_landing_css()}\n</style>",
    )
    if f't-name="{view_key}"' not in inner:
        inner = f'<t t-name="{view_key}">\n{inner}\n</t>'
    return inner


def build_shop_seo_view_arch() -> str:
    return textwrap.dedent(
        f"""
        <data>
          <xpath expr="//t[@t-call='website.layout']//t[@t-set='additional_title']" position="replace">
            <t t-set="additional_title" t-value="category and category.name or '{SHOP_ADDITIONAL_TITLE}'"/>
          </xpath>
          <xpath expr="//h1[contains(@class, 'o_wsale_shop_title')]" position="replace">
            <h1 class="o_wsale_shop_title h4-fs mb-0" t-if="not category and not search">{SHOP_H1}</h1>
          </xpath>
        </data>
        """
    ).strip()


def build_shop_meta_view_arch() -> str:
    escaped = SHOP_META_DESCRIPTION.replace("'", "\\'")
    return textwrap.dedent(
        f"""
        <data>
          <xpath expr="//t[@t-set='meta_description']" position="after">
            <t t-if="request.httprequest.path == '/shop' and not (category or search)"
               t-set="meta_description"
               t-value="'{escaped}'"/>
          </xpath>
        </data>
        """
    ).strip()


def upsert_view(models, uid, db, user, password, *, key: str, name: str, arch: str, dry_run: bool) -> None:
    existing = models.execute_kw(
        db, uid, password, "ir.ui.view", "search", [[["key", "=", key], ["website_id", "in", [False, WEBSITE_ID]]]]
    )
    vals = {
        "name": name,
        "type": "qweb",
        "key": key,
        "arch_db": arch,
        "website_id": WEBSITE_ID,
        "active": True,
    }
    if existing:
        print(f"  update view {key!r} id={existing[0]}")
        if not dry_run:
            models.execute_kw(db, uid, password, "ir.ui.view", "write", [[existing[0]], vals])
    else:
        parent = models.execute_kw(
            db, uid, password, "ir.ui.view", "search", [[["key", "=", "website_sale.products"]]], {"limit": 1}
        )
        layout_parent = models.execute_kw(
            db, uid, password, "ir.ui.view", "search", [[["key", "=", "website.layout"]]], {"limit": 1}
        )
        inherit_key = "website_sale.products" if "website_sale.products" in key else "website.layout"
        parent_id = parent[0] if inherit_key == "website_sale.products" else layout_parent[0]
        vals["inherit_id"] = parent_id
        vals["mode"] = "extension"
        print(f"  create view {key!r} inheriting {inherit_key}")
        if not dry_run:
            models.execute_kw(db, uid, password, "ir.ui.view", "create", [vals])


def apply_homepage(models, uid, db, user, password, base_url: str, dry_run: bool) -> None:
    print("Homepage → shop landing")
    view = models.execute_kw(
        db, uid, password, "ir.ui.view", "read", [[HOME_VIEW_ID]], {"fields": ["key"]}
    )[0]
    featured = featured_products_html(models, uid, db, user, password, base_url)
    arch = build_homepage_arch(featured, view["key"])
    print(f"  arch length={len(arch)}")
    if dry_run:
        return
    models.execute_kw(db, uid, password, "ir.ui.view", "write", [[HOME_VIEW_ID], {"arch_db": arch}])
    models.execute_kw(db, uid, password, "website.page", "write", [[HOME_PAGE_ID], HOME_META])


def apply_gallery_removal(models, uid, db, user, password, dry_run: bool) -> None:
    print("Gallery → unpublish + redirect to lifedeportes.com")
    if not dry_run:
        models.execute_kw(
            db,
            uid,
            password,
            "website.page",
            "write",
            [[GALLERY_PAGE_ID], {"is_published": False, "website_indexed": False}],
        )
        models.execute_kw(
            db,
            uid,
            password,
            "website.menu",
            "write",
            [[GALLERY_MENU_ID], {"is_visible": False}],
        )
        existing = models.execute_kw(
            db,
            uid,
            password,
            "website.rewrite",
            "search",
            [[["url_from", "=", GALLERY_REDIRECT_FROM], ["website_id", "=", WEBSITE_ID]]],
        )
        rewrite_vals = {
            "name": "Gallery → lifedeportes.com",
            "website_id": WEBSITE_ID,
            "active": True,
            "url_from": GALLERY_REDIRECT_FROM,
            "url_to": GALLERY_REDIRECT_TO,
            "redirect_type": "301",
        }
        if existing:
            models.execute_kw(db, uid, password, "website.rewrite", "write", [[existing[0]], rewrite_vals])
        else:
            models.execute_kw(db, uid, password, "website.rewrite", "create", [rewrite_vals])


def apply_menus(models, uid, db, user, password, dry_run: bool) -> None:
    print("Menus → Tienda primero; Galería visible en /gallery (trabajos reales FB)")
    if dry_run:
        return
    models.execute_kw(
        db,
        uid,
        password,
        "website.menu",
        "write",
        [[SHOP_MENU_ID], {"name": "Catálogo", "sequence": 0}],
    )
    models.execute_kw(
        db,
        uid,
        password,
        "website.menu",
        "write",
        [[GALLERY_MENU_ID], {"name": "Galería", "url": "/gallery", "is_visible": True, "sequence": 5}],
    )
    models.execute_kw(
        db,
        uid,
        password,
        "website.menu",
        "write",
        [[ABOUT_MENU_ID], {"sequence": 10}],
    )


def apply_shop_views(models, uid, db, user, password, dry_run: bool) -> None:
    print("Shop SEO views")
    upsert_view(
        models, uid, db, user, password,
        key=SHOP_SEO_VIEW_KEY,
        name="LD Shop SEO title and H1",
        arch=build_shop_seo_view_arch(),
        dry_run=dry_run,
    )
    upsert_view(
        models, uid, db, user, password,
        key=SHOP_META_VIEW_KEY,
        name="LD Shop meta description",
        arch=build_shop_meta_view_arch(),
        dry_run=dry_run,
    )


def product_meta_description(product_id: int) -> str:
    paragraphs = WEB.get(product_id)
    if not paragraphs:
        return PRESUPUESTO.get(product_id, "")
    text = " ".join(paragraphs)
    return text[:158] + ("…" if len(text) > 158 else "")


def apply_product_seo(models, uid, db, user, password, dry_run: bool) -> None:
    print("Product SEO titles and descriptions")
    for product_id, title in sorted(PRODUCT_SEO_TITLE.items()):
        meta_title = f"{title}{BRAND_SUFFIX}"
        meta_desc = product_meta_description(product_id)
        print(f"  [{product_id}] {meta_title[:70]}")
        if dry_run:
            continue
        models.execute_kw(
            db,
            uid,
            password,
            "product.template",
            "write",
            [[product_id], {
                "website_meta_title": meta_title,
                "website_meta_description": meta_desc,
                "is_seo_optimized": True,
            }],
        )


def apply_product_copy(models, uid, db, user, password, dry_run: bool) -> None:
    print("Product copy (description_sale + description_ecommerce)")
    for product_id in sorted(PRESUPUESTO.keys()):
        if product_id not in WEB:
            continue
        ecommerce = "".join(f"<p>{para}</p>" for para in WEB[product_id])
        if dry_run:
            print(f"  [{product_id}] dry-run copy sync")
            continue
        models.execute_kw(
            db,
            uid,
            password,
            "product.template",
            "write",
            [[product_id], {
                "description_sale": PRESUPUESTO[product_id],
                "description_ecommerce": ecommerce,
                "website_description": False,
            }],
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--skip-copy", action="store_true", help="Skip description_sale/ecommerce sync")
    parser.add_argument(
        "--remove-gallery",
        action="store_true",
        help=(
            "DESTRUCTIVE: unpublish Odoo /gallery and 301 to lifedeportes.com/galeria.html "
            "(SEO webps). Do not use — restores wipe Facebook trabajos reales. "
            "See wiki/concepts/life-galeria-trabajos-reales.md"
        ),
    )
    args = parser.parse_args()
    dry_run = not args.apply

    if dry_run:
        print("DRY RUN — pass --apply to write to Odoo production\n")

    models, uid, db, user, password = odoo_client()
    base_url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")

    if args.remove_gallery:
        apply_gallery_removal(models, uid, db, user, password, dry_run)
    else:
        print("Gallery → kept (Facebook trabajos reales). Pass --remove-gallery only if intentional.")

    apply_menus(models, uid, db, user, password, dry_run)
    apply_homepage(models, uid, db, user, password, base_url, dry_run)
    apply_shop_views(models, uid, db, user, password, dry_run)
    apply_product_seo(models, uid, db, user, password, dry_run)
    if not args.skip_copy:
        apply_product_copy(models, uid, db, user, password, dry_run)

    if dry_run:
        print("\nDry run complete. Re-run with --apply")
    else:
        print("\nOdoo shop SEO configuration applied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
