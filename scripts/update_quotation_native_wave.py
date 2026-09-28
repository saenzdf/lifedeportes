#!/usr/bin/env python3
"""PDF cotización Life: layout Wave nativo Odoo (textos reales + logo transparente).

Sustituye el banner/footer imagen del Excel por:
  - Logo LIFE PNG transparente → res.company.logo
  - Diseño Wave (SVG ola Odoo) con colores navy/azul
  - report_header / company_details / report_footer como HTML (texto)
  - Desactiva el inherit QWeb que inyectaba JPEGs del Excel

Uso:
  .venv/bin/python scripts/update_quotation_native_wave.py --target prod
"""

from __future__ import annotations

import argparse
import base64
import os
from pathlib import Path

import xmlrpc.client

ROOT = Path(__file__).resolve().parents[1]
# Logo oficial de lifedeportes.com (img/logo-color.webp → PNG transparente)
LOGO_PATH = ROOT / "assets" / "quote_letterhead" / "life_logo_official.png"

VIEW_INHERIT_KEY = "life.external_layout_bubble_excel_letterhead"
WAVE_BLUE_KEY = "life.external_layout_wave_blue_tint"
WAVE_VIEW_ID = 206  # web.external_layout_wave
WAVE_REPORT_LAYOUT_ID = 6

# Azules de la referencia Excel Paola (#004070 navy / #10A8D8 cielo)
PRIMARY = "#004070"
SECONDARY = "#10A8D8"

# Textos nativos (oración; proporciones tipográficas las define Odoo/Oswald)
REPORT_HEADER = (
    "<p><strong>Fabricamos todo en ropa e implementos deportivos</strong></p>"
)

COMPANY_DETAILS = """
<p>
<strong>Life Soluciones Deportivas S.A.S</strong><br/>
NIT 901164485-0<br/>
WhatsApp 321 398 8464 · 310 336 2484<br/>
@lifedeportes
</p>
""".strip()

REPORT_FOOTER = """
<p>
Calle 66A #98A-12, Álamos · 792 6668 ·
<a href="https://www.lifedeportes.com">www.lifedeportes.com</a>
· info@lifedeportes.com
</p>
""".strip()

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


def upsert_wave_blue_tint(models, uid, db, password) -> None:
    """Ola Wave un poco más visible y en el cielo del Excel (secondary)."""
    arch = """<?xml version="1.0"?>
<data inherit_id="web.external_layout_wave">
    <xpath expr="//*[@t-att-fill='company.primary_color']" position="attributes">
        <attribute name="t-att-fill">company.secondary_color</attribute>
        <attribute name="fill-opacity">0.22</attribute>
    </xpath>
    <xpath expr="//*[@t-att-fill='company.secondary_color']" position="attributes">
        <attribute name="fill-opacity">0.22</attribute>
    </xpath>
</data>
"""
    existing = models.execute_kw(
        db, uid, password, "ir.ui.view", "search", [[["key", "=", WAVE_BLUE_KEY]]], {"limit": 1}
    )
    vals = {
        "name": "Life Wave blue tint (Excel sky)",
        "key": WAVE_BLUE_KEY,
        "type": "qweb",
        "mode": "extension",
        "inherit_id": WAVE_VIEW_ID,
        "arch": arch,
        "active": True,
    }
    if existing:
        models.execute_kw(db, uid, password, "ir.ui.view", "write", [existing, vals])
        print(f"  updated wave tint view {existing[0]}")
    else:
        vid = models.execute_kw(db, uid, password, "ir.ui.view", "create", [vals])
        print(f"  created wave tint view {vid}")


def deactivate_image_inherit(models, uid, db, password) -> None:
    ids = models.execute_kw(
        db,
        uid,
        password,
        "ir.ui.view",
        "search",
        [[["key", "=", VIEW_INHERIT_KEY]]],
    )
    if ids:
        models.execute_kw(db, uid, password, "ir.ui.view", "write", [ids, {"active": False}])
        print(f"  deactivated image inherit view(s) {ids}")
    else:
        print("  no image inherit to deactivate")


def apply_native_wave(models, uid, db, password) -> None:
    if not LOGO_PATH.is_file():
        raise SystemExit(f"Missing logo: {LOGO_PATH}")
    logo_b64 = base64.b64encode(LOGO_PATH.read_bytes()).decode("ascii")

    company_id = models.execute_kw(db, uid, password, "res.company", "search", [[]], {"limit": 1})[0]

    # Wizard first (official Diseño de documentos path)
    layout_vals = {
        "logo": logo_b64,
        "report_header": REPORT_HEADER,
        "report_footer": REPORT_FOOTER,
        "company_details": COMPANY_DETAILS,
        "external_report_layout_id": WAVE_VIEW_ID,
        "report_layout_id": WAVE_REPORT_LAYOUT_ID,
        "primary_color": PRIMARY,
        "secondary_color": SECONDARY,
        "font": "Oswald",
        "layout_background": "Blank",
        "paperformat_id": 2,
    }
    lid = models.execute_kw(db, uid, password, "base.document.layout", "create", [layout_vals])
    models.execute_kw(db, uid, password, "base.document.layout", "document_layout_save", [[lid]])
    print(f"  document_layout_save Wave id={lid}")

    # Reinforce on company (logo + texts + Wave)
    models.execute_kw(
        db,
        uid,
        password,
        "res.company",
        "write",
        [
            [company_id],
            {
                "logo": logo_b64,
                "report_header": REPORT_HEADER,
                "report_footer": REPORT_FOOTER,
                "company_details": COMPANY_DETAILS,
                "external_report_layout_id": WAVE_VIEW_ID,
                "primary_color": PRIMARY,
                "secondary_color": SECONDARY,
                "font": "Oswald",
                "layout_background": "Blank",
            },
        ],
    )
    print(f"  res.company[{company_id}] Wave + logo + HTML texts")

    # Sensible margins for Wave so the official LIFE logo doesn't clip
    models.execute_kw(
        db,
        uid,
        password,
        "report.paperformat",
        "write",
        [[2], {"header_spacing": 48, "margin_top": 48, "margin_bottom": 36}],
    )
    print("  paperformat US Letter margins tuned for Wave")


def refresh_notes(models, uid, db, password) -> None:
    models.execute_kw(
        db, uid, password, "sale.order.template", "write", [[1], {"note": QUOTATION_NOTE_HTML}]
    )
    pts = models.execute_kw(
        db, uid, password, "account.payment.term", "search", [[["name", "ilike", "50%"]]], {"limit": 1}
    )
    if pts:
        models.execute_kw(db, uid, password, "account.payment.term", "write", [pts, {"note": False}])

    sos = models.execute_kw(
        db,
        uid,
        password,
        "sale.order",
        "search_read",
        [[["state", "in", ["draft", "sent", "sale"]]]],
        {"fields": ["id", "name", "note"], "limit": 400, "order": "id desc"},
    )
    marker = "Podemos preparar los diseños que necesiten"
    updated = []
    for s in sos:
        note = s.get("note") or ""
        if marker in note and "Régimen" in note:
            continue
        if "<table" in note.lower() and "Condiciones" not in note and "condiciones" not in note:
            continue
        if any(
            x in note
            for x in (
                "Condiciones del presupuesto",
                "CONDICIONES DE NEGOCIACIÓN",
                "Condiciones de negociación",
                "Términos y condiciones",
            )
        ) or not note.strip():
            models.execute_kw(
                db, uid, password, "sale.order", "write", [[s["id"]], {"note": QUOTATION_NOTE_HTML}]
            )
            updated.append(s["name"])
    print(f"  notes refreshed: {len(updated)}")


def verify(models, uid, db, password) -> None:
    c = models.execute_kw(
        db,
        uid,
        password,
        "res.company",
        "read",
        [[1]],
        {
            "fields": [
                "external_report_layout_id",
                "report_header",
                "report_footer",
                "company_details",
                "primary_color",
                "logo",
            ]
        },
    )[0]
    layout = c["external_report_layout_id"]
    assert layout and layout[0] == WAVE_VIEW_ID, f"expected Wave {WAVE_VIEW_ID}, got {layout}"
    assert c.get("logo"), "logo missing"
    assert "Fabricamos todo" in (c.get("report_header") or "")
    assert "Álamos" in (c.get("report_footer") or "") or "Alamos" in (c.get("report_footer") or "")
    assert "901164485" in (c.get("company_details") or "")
    inh = models.execute_kw(
        db,
        uid,
        password,
        "ir.ui.view",
        "search_read",
        [[["key", "=", VIEW_INHERIT_KEY]]],
        {"fields": ["active"]},
    )
    if inh and inh[0]["active"]:
        raise SystemExit("image inherit still active")
    print("  verify OK: Wave + logo + texts; image inherit off")


def main() -> int:
    load_dotenv_file()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("test", "prod"), default="prod")
    parser.add_argument("--skip-notes", action="store_true")
    args = parser.parse_args()

    models, uid, db, password, url = odoo_client(args.target)
    print(f"Target={args.target} {url}")
    deactivate_image_inherit(models, uid, db, password)
    upsert_wave_blue_tint(models, uid, db, password)
    apply_native_wave(models, uid, db, password)
    if not args.skip_notes:
        refresh_notes(models, uid, db, password)
    verify(models, uid, db, password)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
