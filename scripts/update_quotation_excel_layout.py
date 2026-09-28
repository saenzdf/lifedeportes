#!/usr/bin/env python3
"""Aplica membrete tipo Excel (banner azul + footer ola) al PDF Odoo Life.

1. Sube header/footer del Excel de asesores como ir.attachment
2. Crea/actualiza QWeb inherit de web.external_layout_bubble
3. Colores navy/azul (evolución desde Bubble verde)
4. Condiciones de negociación casi iguales al Excel
5. Actualiza plantilla + pedidos/presupuestos con nota vieja

Uso:
  .venv/bin/python scripts/update_quotation_excel_layout.py --target prod
"""

from __future__ import annotations

import argparse
import base64
import html
import os
from pathlib import Path

import xmlrpc.client

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "quote_letterhead"
HEADER_IMG = ASSETS / "header_v2.png"
FOOTER_IMG = ASSETS / "footer_v2.png"

# Condiciones: evolución del Excel (Paola/Javier), oración normal — sin MAYÚSCULAS de bloque.
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

REPORT_FOOTER = (
    "<p>WhatsApp 310 336 2484 · 321 398 8464"
    " · info@lifedeportes.com"
    ' · <a href="https://lifedeportes.com">www.lifedeportes.com</a></p>'
)

# Navy / azul Life (Excel), no verde Bubble
PRIMARY_BLUE = "#0F385F"
SECONDARY_BLUE = "#4A90C8"

VIEW_KEY = "life.external_layout_bubble_excel_letterhead"
VIEW_NAME = "Life Excel letterhead (bubble inherit)"


def load_dotenv_file() -> None:
    env_path = ROOT / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip("'").strip('"'))


def odoo_client(target: str):
    if target == "prod":
        url = os.environ["ODOO_LIFEDEPORTES_PROD_URL"].rstrip("/")
        db = os.environ["ODOO_LIFEDEPORTES_PROD_DB"]
        user = os.environ["ODOO_LIFEDEPORTES_PROD_USERNAME"]
        password = os.environ["ODOO_LIFEDEPORTES_PROD_PASSWORD"]
        if "testlifesoluciones" in url:
            raise SystemExit(f"Refusing prod with test URL: {url}")
    else:
        url = os.environ["ODOO_LIFEDEPORTES_URL"].rstrip("/")
        db = os.environ["ODOO_LIFEDEPORTES_DB"]
        user = os.environ["ODOO_LIFEDEPORTES_USERNAME"]
        password = os.environ["ODOO_LIFEDEPORTES_PASSWORD"]
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, user, password, {})
    if not uid:
        raise SystemExit(f"Auth failed ({target} {url})")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
    return models, uid, db, password, url


def upsert_attachment(models, uid, db, password, *, name: str, path: Path, company_id: int) -> int:
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    suffix = path.suffix.lower()
    mimetype = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(suffix, "image/png")
    existing = models.execute_kw(
        db,
        uid,
        password,
        "ir.attachment",
        "search",
        [[["name", "=", name], ["res_model", "=", "res.company"], ["res_id", "=", company_id]]],
        {"limit": 1},
    )
    vals = {
        "name": name,
        "type": "binary",
        "datas": data,
        "mimetype": mimetype,
        "res_model": "res.company",
        "res_id": company_id,
        "public": True,
    }
    if existing:
        models.execute_kw(db, uid, password, "ir.attachment", "write", [existing, vals])
        att_id = existing[0]
        print(f"  updated attachment {att_id} {name} ({mimetype})")
    else:
        att_id = models.execute_kw(db, uid, password, "ir.attachment", "create", [vals])
        print(f"  created attachment {att_id} {name} ({mimetype})")
    return att_id


def build_inherit_arch(header_id: int, footer_id: int, base_url: str) -> str:
    # Public attachments + absolute URL (wkhtmltopdf on Odoo.sh can fetch same host).
    # Parent uses t-attf-class, not class.
    h = f"{base_url}/web/image/{header_id}"
    ftr = f"{base_url}/web/image/{footer_id}"
    return f"""<?xml version="1.0"?>
<data inherit_id="web.external_layout_bubble">
    <xpath expr="//div[contains(@t-attf-class, 'header')]" position="replace">
        <div t-attf-class="header o_company_#{{company.id}}_layout life-excel-header" style="padding:0; margin:0;">
            <img src="{h}"
                 style="width:100%; height:auto; max-height:4.2cm; object-fit:contain; object-position:left center; display:block;"
                 alt="Life Soluciones Deportivas"/>
        </div>
    </xpath>
    <xpath expr="//div[contains(@t-attf-class, 'footer')]" position="replace">
        <div t-attf-class="footer o_company_#{{company.id}}_layout life-excel-footer" style="padding:0; margin:0;">
            <div style="text-align:center;">
                <img src="{ftr}"
                     style="width:100%; height:auto; max-height:2.4cm; object-fit:contain; display:block; margin:0 auto;"
                     alt="Life Deportes contacto"/>
                <div style="font-size:9px; line-height:1.35; margin-top:2px;" t-field="company.report_footer"/>
                <span t-if="report_type == 'pdf'" class="text-muted" style="font-size:8px;">
                    Página <span class="page"/> / <span class="topage"/>
                </span>
            </div>
        </div>
    </xpath>
</data>
"""


def upsert_qweb_view(models, uid, db, password, arch: str) -> int:
    bubble_id = models.execute_kw(
        db,
        uid,
        password,
        "ir.ui.view",
        "search",
        [[["key", "=", "web.external_layout_bubble"]]],
        {"limit": 1},
    )[0]
    existing = models.execute_kw(
        db,
        uid,
        password,
        "ir.ui.view",
        "search",
        [[["key", "=", VIEW_KEY]]],
        {"limit": 1},
    )
    vals = {
        "name": VIEW_NAME,
        "key": VIEW_KEY,
        "type": "qweb",
        "mode": "extension",
        "inherit_id": bubble_id,
        "arch": arch,
        "active": True,
    }
    if existing:
        models.execute_kw(db, uid, password, "ir.ui.view", "write", [existing, vals])
        print(f"  updated view {existing[0]} {VIEW_KEY}")
        return existing[0]
    vid = models.execute_kw(db, uid, password, "ir.ui.view", "create", [vals])
    print(f"  created view {vid} {VIEW_KEY}")
    return vid


def update_company_style(models, uid, db, password, company_id: int) -> None:
    # Lema vacío: el banner ya trae FABRICAMOS TODO...
    # Detalles mínimos: el banner ya trae razón social + NIT
    models.execute_kw(
        db,
        uid,
        password,
        "res.company",
        "write",
        [
            [company_id],
            {
                "primary_color": PRIMARY_BLUE,
                "secondary_color": SECONDARY_BLUE,
                "report_header": "<p><br/></p>",
                "report_footer": REPORT_FOOTER,
                "company_details": (
                    "<p><strong>Life Soluciones Deportivas S.A.S</strong><br/>"
                    "Calle 66A #98A-12, Álamos, Bogotá D.C.<br/>"
                    "NIT 901164485-0</p>"
                ),
                "external_report_layout_id": 207,
                "font": "Oswald",
                "layout_background": "Blank",
            },
        ],
    )
    # Persist via document layout wizard too
    lid = models.execute_kw(
        db,
        uid,
        password,
        "base.document.layout",
        "create",
        [
            {
                "primary_color": PRIMARY_BLUE,
                "secondary_color": SECONDARY_BLUE,
                "report_header": "<p><br/></p>",
                "report_footer": REPORT_FOOTER,
                "company_details": (
                    "<p><strong>Life Soluciones Deportivas S.A.S</strong><br/>"
                    "Calle 66A #98A-12, Álamos, Bogotá D.C.<br/>"
                    "NIT 901164485-0</p>"
                ),
                "external_report_layout_id": 207,
                "font": "Oswald",
                "layout_background": "Blank",
                "paperformat_id": 2,
            }
        ],
    )
    models.execute_kw(db, uid, password, "base.document.layout", "document_layout_save", [[lid]])
    print(f"  company colors navy + document_layout_save id={lid}")

    # More room for banner in PDF header
    models.execute_kw(
        db,
        uid,
        password,
        "report.paperformat",
        "write",
        [[2], {"header_spacing": 55, "margin_top": 55, "margin_bottom": 40}],
    )
    print("  paperformat US Letter header_spacing=55")


def update_notes(models, uid, db, password) -> None:
    models.execute_kw(
        db,
        uid,
        password,
        "sale.order.template",
        "write",
        [[1], {"note": QUOTATION_NOTE_HTML}],
    )
    print("  Plantilla venta note → Condiciones de negociación (oración)")

    # Payment term
    pts = models.execute_kw(
        db,
        uid,
        password,
        "account.payment.term",
        "search",
        [[["name", "ilike", "50%"]]],
        {"limit": 1},
    )
    if pts:
        models.execute_kw(
            db,
            uid,
            password,
            "account.payment.term",
            "write",
            [
                pts,
                {
                    # Vacío: la forma de pago ya va en Condiciones de negociación (evita duplicado en PDF)
                    "note": False,
                },
            ],
        )

    # All draft/sent/sale with plantilla-style note (incl. confirmed)
    sos = models.execute_kw(
        db,
        uid,
        password,
        "sale.order",
        "search_read",
        [[["state", "in", ["draft", "sent", "sale"]]]],
        {"fields": ["id", "name", "note"], "limit": 400, "order": "id desc"},
    )
    updated = []
    marker_new = "Podemos preparar los diseños que necesiten"
    for s in sos:
        note = s.get("note") or ""
        if marker_new in note:
            continue
        if "<table" in note.lower() and "Condiciones" not in note and "condiciones" not in note:
            continue
        if (
            "Condiciones del presupuesto" in note
            or "CONDICIONES DE NEGOCIACIÓN" in note
            or "Condiciones de negociación" in note
            or not note.strip()
            or "Términos y condiciones" in note
        ):
            models.execute_kw(
                db, uid, password, "sale.order", "write", [[s["id"]], {"note": QUOTATION_NOTE_HTML}]
            )
            updated.append(s["name"])
    print(f"  updated notes on {len(updated)} orders (incl. confirmed): {updated[:15]}…")


def main() -> int:
    load_dotenv_file()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("test", "prod"), default="prod")
    parser.add_argument("--skip-notes", action="store_true")
    args = parser.parse_args()

    if not HEADER_IMG.is_file() or not FOOTER_IMG.is_file():
        raise SystemExit(
            f"Missing Excel media. Expected:\n  {HEADER_IMG}\n  {FOOTER_IMG}\n"
            "Unzip Paola xlsx xl/media first."
        )

    models, uid, db, password, url = odoo_client(args.target)
    print(f"Target={args.target} {url}")

    company_id = models.execute_kw(db, uid, password, "res.company", "search", [[]], {"limit": 1})[0]
    header_id = upsert_attachment(
        models, uid, db, password, name="life_quote_header_excel.jpg", path=HEADER_IMG, company_id=company_id
    )
    footer_id = upsert_attachment(
        models, uid, db, password, name="life_quote_footer_excel.jpg", path=FOOTER_IMG, company_id=company_id
    )

    arch = build_inherit_arch(header_id, footer_id, url)
    print(f"  qweb arch size ~{len(arch)} chars")
    print("  xpath preview:", arch[arch.find("xpath") : arch.find("xpath") + 80])
    upsert_qweb_view(models, uid, db, password, arch)
    update_company_style(models, uid, db, password, company_id)
    if not args.skip_notes:
        update_notes(models, uid, db, password)

    models.execute_kw(
        db,
        uid,
        password,
        "ir.config_parameter",
        "set_param",
        ["life.quote_header_attachment_id", str(header_id)],
    )
    models.execute_kw(
        db,
        uid,
        password,
        "ir.config_parameter",
        "set_param",
        ["life.quote_footer_attachment_id", str(footer_id)],
    )
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
