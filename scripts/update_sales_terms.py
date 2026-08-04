#!/usr/bin/env python3
"""Publica condiciones de venta en Odoo: página web + términos de factura/cotización."""

from __future__ import annotations

import argparse
import html
import os
import re
import sys
import xmlrpc.client
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TERMS_XML = ROOT / "odoo_website" / "lifedeportes_theme" / "views" / "terms_page.xml"

SALES_TERMS_HTML = """
<h2>Condiciones comerciales Life Deportes</h2>
<p><strong>Venta al por mayor.</strong> Fabricamos uniformes y prendas deportivas personalizadas para equipos, clubes, colegios y empresas.</p>
<p><strong>Pedido mínimo:</strong> 6 uniformes completos por diseño (camiseta + pantaloneta + medias, según producto). Camisetas extra, banderas, medias, gorras y otros complementos se cotizan adicionales al pedido base.</p>
<p><strong>Pago:</strong> 50% de abono para iniciar producción y 50% restante antes del envío o entrega.</p>
<p><strong>Tiempos:</strong> 10 días hábiles de fabricación después del abono y de recibir tallas, nombres, números y aprobación de diseño. Entrega estimada ~15 días hábiles tras aprobación, sujeta a destino y transportadora.</p>
<p><strong>Personalización:</strong> productos hechos bajo pedido; no aplican devoluciones por cambio de opinión. Defectos de fabricación se evalúan caso a caso.</p>
<p><strong>Contacto:</strong> info@lifedeportes.com · WhatsApp +57 310 336 2484 · Bogotá, Colombia.</p>
<p>Condiciones completas: <a href="https://lifedeportes.com/terms-of-use">lifedeportes.com/terms-of-use</a></p>
""".strip()

SALES_TERMS_PLAIN = (
    "Venta al por mayor. Pedido mínimo: 6 uniformes completos por diseño. "
    "Abono 50% para iniciar producción; 50% restante antes del envío. "
    "Fabricación: 10 días hábiles tras abono y datos del pedido. "
    "Complementos (camisetas extra, banderas, medias, etc.) adicionales al pedido base."
)


def odoo_client():
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


def extract_template_fragment(xml_path: Path, template_id: str) -> str:
    text = xml_path.read_text(encoding="utf-8")
    pattern = rf'<template id="{re.escape(template_id)}"[\s\S]*?</template>'
    match = re.search(pattern, text)
    if not match:
        raise ValueError(f"Template {template_id!r} not found in {xml_path}")
    block = match.group(0)
    inner = re.sub(r"^\s*<template[^>]*>\s*", "", block)
    inner = re.sub(r"\s*</template>\s*$", "", inner, flags=re.S)
    return inner.strip()


def finalize_arch(inner: str, view_key: str) -> str:
    if not (inner.startswith("<t ") and "t-call=" in inner[:120]):
        inner = f"<t t-call=\"website.layout\">\n{inner}\n</t>"
    if f't-name="{view_key}"' in inner[:300]:
        return inner
    return f'<t t-name="{view_key}">\n{inner}\n</t>'


def inject_legal_css(arch: str) -> str:
    css = """
<style type="text/css">
.ld-legal-page{font-family:'DM Sans',system-ui,sans-serif;color:#1a1a2e}
.ld-legal-page .ld-legal-hero{background:linear-gradient(135deg,#051B36 0%,#0a3060 100%);color:#fff}
.ld-legal-page .ld-section-label{display:inline-block;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#9ec5ff;margin-bottom:12px}
.ld-legal-page h1{font-family:'Barlow Condensed',sans-serif;font-size:clamp(2rem,4vw,3rem);font-weight:800;text-transform:uppercase;margin:0 0 16px}
.ld-legal-page .ld-legal-lead{max-width:860px;font-size:1.05rem;line-height:1.7;margin:0 0 12px;color:rgba(255,255,255,.92)}
.ld-legal-page .ld-legal-meta{opacity:.75;margin:0}
.ld-legal-page .ld-legal-grid{display:grid;gap:18px}
.ld-legal-page .ld-legal-card{background:#fff;border:1px solid rgba(5,27,54,.08);border-radius:14px;padding:22px 24px;box-shadow:0 8px 24px rgba(5,27,54,.05)}
.ld-legal-page .ld-legal-highlight{border-color:#0F385F;background:#f7fbff}
.ld-legal-page h2{font-family:'Barlow Condensed',sans-serif;font-size:1.35rem;font-weight:700;color:#051B36;margin:0 0 12px}
.ld-legal-page p,.ld-legal-page li{line-height:1.65;color:#334155}
.ld-legal-page ul{margin:8px 0 0;padding-left:1.2rem}
.ld-legal-page a{color:#0F385F;font-weight:600}
</style>
"""
    pos = arch.find(">")
    if pos == -1:
        return css + arch
    return arch[: pos + 1] + css + arch[pos + 1 :]


def update_terms_page(models, uid, db, password, *, dry_run: bool) -> None:
    pages = models.execute_kw(
        db,
        uid,
        password,
        "website.page",
        "search_read",
        [[["url", "in", ["/terms-of-use", "/condiciones-de-uso"]]]],
        {"fields": ["id", "url", "name", "view_id"], "limit": 5},
    )
    if not pages:
        raise SystemExit("No website.page found for /terms-of-use")

    page = pages[0]
    vid = page["view_id"][0]
    view = models.execute_kw(
        db,
        uid,
        password,
        "ir.ui.view",
        "read",
        [[vid]],
        {"fields": ["key", "name"]},
    )[0]
    key = view.get("key") or "website.terms-of-use"
    inner = extract_template_fragment(TERMS_XML, "terms_ld_page")
    arch = inject_legal_css(finalize_arch(inner, key))

    print(f"Updating website page {page['url']!r} → view {vid} ({len(arch)} chars)")
    if dry_run:
        return

    models.execute_kw(db, uid, password, "ir.ui.view", "write", [[vid], {"arch_db": arch}])
    models.execute_kw(
        db,
        uid,
        password,
        "website.page",
        "write",
        [[page["id"]], {"name": "Condiciones de venta", "website_published": True}],
    )


def update_company_terms(models, uid, db, password, *, dry_run: bool) -> None:
    company_id = models.execute_kw(db, uid, password, "res.company", "search", [[]], {"limit": 1})[0]
    print(f"Updating res.company[{company_id}] invoice terms")
    if dry_run:
        return
    models.execute_kw(
        db,
        uid,
        password,
        "res.company",
        "write",
        [
            [company_id],
            {
                "invoice_terms": f"<p>{html.escape(SALES_TERMS_PLAIN)}</p>",
                "invoice_terms_html": SALES_TERMS_HTML,
            },
        ],
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    models, uid, db, password, url = odoo_client()
    update_terms_page(models, uid, db, password, dry_run=args.dry_run)
    update_company_terms(models, uid, db, password, dry_run=args.dry_run)
    print(f"Done on {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
