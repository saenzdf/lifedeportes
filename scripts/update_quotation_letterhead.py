#!/usr/bin/env python3
"""Actualiza membrete y condiciones de cotización Odoo (evolución Excel asesores).

Escribe en:
  - res.company: report_header, report_footer, company_details, invoice_terms*
  - sale.order.template «Plantilla venta»: note (PDF presupuesto)
  - account.payment.term «50% ahora…»: note

Target: --target test|prod (credenciales ODOO_LIFEDEPORTES_* / *_PROD_*).
Nota 2026-09-03: host test `testlifesoluciones.odoo.com` respondía 404; usar --target prod.
"""

from __future__ import annotations

import argparse
import html
import os
import sys
import xmlrpc.client
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# --- Copy: evolución del Excel Paola/Javier (membrete + CONDICIONES DE NEGOCIACION) ---

REPORT_HEADER = (
    "<p><strong>Fabricamos ropa e implementos deportivos</strong></p>"
)

COMPANY_DETAILS = (
    "<p><strong>Life Soluciones Deportivas S.A.S</strong><br/>"
    "Calle 66A #98A-12, Álamos, Bogotá D.C.<br/>"
    "NIT 901164485-0</p>"
)

REPORT_FOOTER = (
    "<p>"
    "WhatsApp 310 336 2484 · 321 398 8464"
    " · info@lifedeportes.com"
    ' · <a href="https://lifedeportes.com">lifedeportes.com</a>'
    "</p>"
)

# sale.order.template note → sale.order.note en presupuestos nuevos
QUOTATION_NOTE_HTML = """
<div>
<p><strong>Condiciones de negociación</strong></p>
<ul>
<li><strong>Forma de pago:</strong> 50&nbsp;% al inicio · 50&nbsp;% a la entrega.</li>
<li><strong>Tiempo de entrega:</strong> 15 días hábiles desde la aprobación del diseño.</li>
<li><strong>Validez de la oferta:</strong> 30 días.</li>
<li><strong>Garantía:</strong> 6 meses al buen uso y manejo (sublimación y costuras).</li>
<li><strong>Pedido mínimo:</strong> 6 unidades del mismo diseño. Tela Dry Fit · sublimación digital a full color.</li>
<li><strong>Envío:</strong> a cargo del cliente en su ciudad. Podemos preparar los diseños que necesiten.</li>
<li><strong>Régimen:</strong> Simple de tributación.</li>
</ul>
<p>Condiciones completas:
<a href="https://lifedeportes.com/terms-of-use">lifedeportes.com/terms-of-use</a>.</p>
</div>
""".strip()

PAYMENT_TERM_50_50_NOTE = (
    "<p><strong>Forma de pago:</strong> 50&nbsp;% para iniciar el pedido "
    "y 50&nbsp;% antes del envío o entrega.</p>"
)

# Factura / términos compañía (cliente-facing: 15 días, no 10 interno)
SALES_TERMS_HTML = """
<h2>Condiciones comerciales Life Deportes</h2>
<p><strong>Venta al por mayor.</strong> Fabricamos uniformes y prendas deportivas personalizadas para equipos, clubes, colegios y empresas.</p>
<p><strong>Pedido mínimo:</strong> 6 uniformes completos por diseño (camiseta + pantaloneta + medias, según producto). Camisetas extra, banderas, medias, gorras y otros complementos se cotizan adicionales al pedido base.</p>
<p><strong>Forma de pago:</strong> 50% de abono para iniciar producción y 50% restante antes del envío o entrega.</p>
<p><strong>Tiempo de entrega:</strong> 15 días hábiles desde la aprobación del diseño, sujeto a destino y transportadora.</p>
<p><strong>Validez:</strong> 30 días. <strong>Garantía:</strong> 6 meses al buen uso (sublimación y costuras).</p>
<p><strong>Envío:</strong> a cargo del cliente en su ciudad.</p>
<p><strong>Personalización:</strong> productos hechos bajo pedido; no aplican devoluciones por cambio de opinión. Defectos de fabricación se evalúan caso a caso.</p>
<p><strong>Contacto:</strong> info@lifedeportes.com · WhatsApp +57 310 336 2484 · +57 321 398 8464 · Bogotá, Colombia.</p>
<p>Condiciones completas: <a href="https://lifedeportes.com/terms-of-use">lifedeportes.com/terms-of-use</a></p>
""".strip()

SALES_TERMS_PLAIN = (
    "Venta al por mayor. Pedido mínimo: 6 uniformes completos por diseño. "
    "Forma de pago: 50% inicio y 50% antes del envío. "
    "Entrega: 15 días hábiles desde aprobación de diseño. "
    "Validez 30 días. Garantía 6 meses al buen uso (sublimación y costuras). "
    "Envío a cargo del cliente."
)


def load_dotenv_file() -> None:
    env_path = ROOT / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        os.environ.setdefault(key, val)


def odoo_client(target: str):
    if target == "prod":
        url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
        db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
        user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
        password = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
        if "-test-" in url or "test" in db.lower() and "testlife" in db.lower() and "prod" not in url:
            # soft check: prod URL must not look like test host
            pass
        if "testlifesoluciones" in url:
            raise SystemExit(f"Refusing --target prod with test URL: {url}")
    else:
        url = os.environ["ODOO_LIFEDEPORTES_URL"].rstrip("/")
        db = os.environ["ODOO_LIFEDEPORTES_DB"]
        user = os.environ["ODOO_LIFEDEPORTES_USERNAME"]
        password = os.environ["ODOO_LIFEDEPORTES_PASSWORD"]

    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, password, {})
    if not uid:
        raise SystemExit(f"Odoo authentication failed ({target} {url})")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
    return models, uid, db, password, url


def find_sale_template_id(models, uid, db, password) -> int:
    rows = models.execute_kw(
        db,
        uid,
        password,
        "sale.order.template",
        "search_read",
        [[["name", "ilike", "Plantilla venta"]]],
        {"fields": ["id", "name"], "limit": 3},
    )
    if not rows:
        rows = models.execute_kw(
            db,
            uid,
            password,
            "sale.order.template",
            "search_read",
            [[]],
            {"fields": ["id", "name"], "limit": 5},
        )
    if not rows:
        raise SystemExit("No sale.order.template found")
    preferred = next((r for r in rows if "plantilla venta" in (r["name"] or "").lower()), rows[0])
    print(f"  sale.order.template → {preferred['id']} {preferred['name']!r}")
    return preferred["id"]


def find_payment_term_50_id(models, uid, db, password) -> int | None:
    rows = models.execute_kw(
        db,
        uid,
        password,
        "account.payment.term",
        "search_read",
        [[["name", "ilike", "50%"]]],
        {"fields": ["id", "name"], "limit": 5},
    )
    if not rows:
        print("  account.payment.term 50% not found — skip")
        return None
    print(f"  account.payment.term → {rows[0]['id']} {rows[0]['name']!r}")
    return rows[0]["id"]


def update_company_partner(models, uid, db, password, company_id: int, *, dry_run: bool) -> None:
    """Align company partner so Diseño de documentos defaults don't fight the letterhead."""
    company = models.execute_kw(
        db,
        uid,
        password,
        "res.company",
        "read",
        [[company_id]],
        {"fields": ["partner_id"]},
    )[0]
    partner_id = company["partner_id"][0]
    vals = {
        "street": "Calle 66A #98A-12, Álamos",
        "city": "Bogotá",
        "phone": "+57 310 336 2484",
        "website": "https://lifedeportes.com",
        "email": "info@lifedeportes.com",
    }
    print(f"  res.partner[{partner_id}] address/phone/web")
    if dry_run:
        return
    models.execute_kw(db, uid, password, "res.partner", "write", [[partner_id], vals])
    # Mirror street/city/phone on company (related on many DBs)
    models.execute_kw(
        db,
        uid,
        password,
        "res.company",
        "write",
        [[company_id], {"street": vals["street"], "city": vals["city"], "phone": vals["phone"], "website": vals["website"]}],
    )


def update_document_layout(models, uid, db, password, *, dry_run: bool) -> None:
    """Persist letterhead via Diseño de documentos (base.document.layout).

    Important: create() with empty defaults can inverse-write partner-built
    footer/details onto res.company and wipe custom HTML. Always pass vals
    in create(), then document_layout_save.
    """
    layout_vals = {
        "report_header": REPORT_HEADER,
        "report_footer": REPORT_FOOTER,
        "company_details": COMPANY_DETAILS,
    }
    print("  base.document.layout → document_layout_save (header/footer/details)")
    if dry_run:
        return
    layout_id = models.execute_kw(db, uid, password, "base.document.layout", "create", [layout_vals])
    models.execute_kw(db, uid, password, "base.document.layout", "document_layout_save", [[layout_id]])
    print(f"  saved layout id={layout_id}")


def update_company(models, uid, db, password, *, dry_run: bool) -> None:
    company_id = models.execute_kw(db, uid, password, "res.company", "search", [[]], {"limit": 1})[0]
    update_company_partner(models, uid, db, password, company_id, dry_run=dry_run)
    update_document_layout(models, uid, db, password, dry_run=dry_run)
    vals = {
        "invoice_terms": f"<p>{html.escape(SALES_TERMS_PLAIN)}</p>",
        "invoice_terms_html": SALES_TERMS_HTML,
        # Reinforce after layout save (wizard can regenerate footer from phone)
        "report_header": REPORT_HEADER,
        "report_footer": REPORT_FOOTER,
        "company_details": COMPANY_DETAILS,
    }
    print(f"  res.company[{company_id}] terms + reinforce letterhead")
    if dry_run:
        return
    models.execute_kw(db, uid, password, "res.company", "write", [[company_id], vals])


def update_sale_template(models, uid, db, password, *, dry_run: bool) -> None:
    tid = find_sale_template_id(models, uid, db, password)
    print(f"  writing note ({len(QUOTATION_NOTE_HTML)} chars)")
    if dry_run:
        return
    models.execute_kw(
        db,
        uid,
        password,
        "sale.order.template",
        "write",
        [[tid], {"note": QUOTATION_NOTE_HTML}],
    )


def update_payment_term(models, uid, db, password, *, dry_run: bool) -> None:
    pid = find_payment_term_50_id(models, uid, db, password)
    if pid is None:
        return
    if dry_run:
        return
    models.execute_kw(
        db,
        uid,
        password,
        "account.payment.term",
        "write",
        [[pid], {"note": PAYMENT_TERM_50_50_NOTE}],
    )


def verify(models, uid, db, password) -> None:
    company = models.execute_kw(
        db,
        uid,
        password,
        "res.company",
        "search_read",
        [[]],
        {
            "fields": ["report_header", "report_footer", "company_details", "invoice_terms"],
            "limit": 1,
        },
    )[0]
    for key in ("report_header", "report_footer", "company_details", "invoice_terms"):
        text = company.get(key) or ""
        if "10 día" in text.lower() or "10 dias" in text.lower():
            raise SystemExit(f"VERIFY FAIL: {key} still mentions 10 días")
        print(f"  OK {key}: {(text or '')[:90].replace(chr(10), ' ')}…")

    if "Fabricamos" not in (company.get("report_header") or ""):
        raise SystemExit("VERIFY FAIL: report_header missing slogan")
    if "Álamos" not in (company.get("company_details") or "") and "Alamos" not in (
        company.get("company_details") or ""
    ):
        raise SystemExit("VERIFY FAIL: company_details missing Álamos")
    if "310 336 2484" not in (company.get("report_footer") or ""):
        raise SystemExit("VERIFY FAIL: report_footer missing WhatsApp format")

    tid = find_sale_template_id(models, uid, db, password)
    tmpl = models.execute_kw(
        db, uid, password, "sale.order.template", "read", [[tid]], {"fields": ["note"]}
    )[0]
    note = tmpl.get("note") or ""
    if "15 días" not in note and "15 dias" not in note.lower():
        raise SystemExit("VERIFY FAIL: plantilla note missing 15 días")
    if "Condiciones de negociación" not in note:
        raise SystemExit("VERIFY FAIL: plantilla note missing título")
    if "10 día" in note.lower():
        raise SystemExit("VERIFY FAIL: plantilla note has 10 días")
    print(f"  OK plantilla note ({len(note)} chars)")


def main() -> int:
    load_dotenv_file()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("test", "prod"), default="test")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-verify", action="store_true")
    args = parser.parse_args()

    models, uid, db, password, url = odoo_client(args.target)
    print(f"Target={args.target} url={url} db={db} dry_run={args.dry_run}")

    update_company(models, uid, db, password, dry_run=args.dry_run)
    update_sale_template(models, uid, db, password, dry_run=args.dry_run)
    update_payment_term(models, uid, db, password, dry_run=args.dry_run)

    if not args.dry_run and not args.skip_verify:
        print("Verify:")
        verify(models, uid, db, password)

    print(f"Done on {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
