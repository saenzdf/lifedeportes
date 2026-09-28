#!/usr/bin/env python3
"""Etiquetas Colombia en PDF Odoo Life: Cotización/Pedido N°, Remisión, sin fila meta."""

from __future__ import annotations

import argparse
import os
import sys
import xmlrpc.client
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SALE_TITLE_KEY = "life.report_saleorder_document_titles_co"
SALE_META_KEY = "life.report_saleorder_hide_quote_meta_row"
DELIVERY_TITLE_KEY = "life.report_delivery_document_remision"
INVOICE_RECEIPT_KEY = "life.report_invoice_document_receipt_liquidacion"
TAX_TOTALS_SALDO_KEY = "life.document_tax_totals_receipt_saldo"
TAX_TOTALS_CCY_SALDO_KEY = "life.document_tax_totals_company_currency_receipt_saldo"

SALE_TITLE_ARCH = """<?xml version="1.0"?>
<data inherit_id="sale.report_saleorder_document">
    <xpath expr="//t[@t-set='layout_document_title']" position="replace">
        <t t-set="layout_document_title">
            <span t-if="is_proforma">Factura proforma N° </span>
            <span t-elif="doc.state in ['draft','sent']">Cotización N° </span>
            <span t-else="">Pedido N° </span>
            <span t-field="doc.name">SO0000</span>
        </t>
    </xpath>
</data>
"""

SALE_META_ARCH = """<?xml version="1.0"?>
<data inherit_id="sale.report_saleorder_document">
    <!-- Cotización: sin fila fecha/vencimiento/comercial; directo a productos -->
    <xpath expr="//div[@id='informations']" position="attributes">
        <attribute name="t-if">doc.state not in ('draft', 'sent') and not is_proforma</attribute>
    </xpath>
    <xpath expr="//div[@name='informations_date']" position="replace"/>
    <xpath expr="//div[@name='expiration_date']" position="replace"/>
    <xpath expr="//div[@id='informations']/div[@t-if='doc.user_id.name']" position="replace"/>
</data>
"""

DELIVERY_TITLE_ARCH = """<?xml version="1.0"?>
<data inherit_id="stock.report_delivery_document">
    <xpath expr="//h2/span[@t-out='o.picking_type_id._get_code_report_name()']" position="replace">
        <span t-if="o.picking_type_id.code == 'outgoing'">Remisión </span>
        <span t-elif="o.picking_type_id.code == 'incoming'">Recepción </span>
        <span t-else="" t-out="o.picking_type_id._get_code_report_name()"/>
    </xpath>
</data>
"""

INVOICE_RECEIPT_ARCH = """<?xml version="1.0"?>
<data inherit_id="account.report_invoice_document">
    <!-- Solo recibos: Liquidación. Facturas siguen Invoice→Factura. -->
    <xpath expr="//t[@name='self_billing_invoice_title']/.." position="after">
        <span t-elif="o.move_type == 'out_receipt' and o.state == 'posted'">
            <t name="receipt_title">Liquidación</t>
        </span>
        <span t-elif="o.move_type == 'out_receipt' and o.state == 'draft'">
            <t name="draft_receipt_title">Liquidación</t>
        </span>
        <span t-elif="o.move_type == 'out_receipt' and o.state == 'cancel'">
            <t name="cancelled_receipt_title">Liquidación cancelada</t>
        </span>
        <span t-elif="o.move_type == 'in_receipt'">
            <t name="vendor_receipt_title">Liquidación</t>
        </span>
    </xpath>
</data>
"""

TAX_TOTALS_SALDO_ARCH = """<?xml version="1.0"?>
<data inherit_id="account.document_tax_totals">
    <xpath expr="//tr[hasclass('o_total')]/td/strong" position="replace">
        <strong t-if="o._name == 'account.move' and o.move_type == 'out_receipt'">Saldo</strong>
        <strong t-else="">Total</strong>
    </xpath>
</data>
"""

TAX_TOTALS_CCY_SALDO_ARCH = """<?xml version="1.0"?>
<data inherit_id="account.document_tax_totals_company_currency_template">
    <xpath expr="//tr[hasclass('o_total')]/td/strong" position="replace">
        <strong t-if="o._name == 'account.move' and o.move_type == 'out_receipt'">Saldo</strong>
        <strong t-else="">Total</strong>
    </xpath>
</data>
"""


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


def odoo_client(target: str = "prod"):
    load_dotenv_file()
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
        raise SystemExit("Odoo authentication failed")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)
    return models, uid, db, password, url


def upsert_qweb_inherit(
    models,
    uid,
    db,
    password,
    *,
    parent_key: str,
    view_key: str,
    name: str,
    arch: str,
    dry_run: bool,
) -> int | None:
    parent = models.execute_kw(
        db,
        uid,
        password,
        "ir.ui.view",
        "search",
        [[["key", "=", parent_key]]],
        {"limit": 1},
    )
    if not parent:
        raise SystemExit(f"Parent view not found: {parent_key}")
    existing = models.execute_kw(
        db,
        uid,
        password,
        "ir.ui.view",
        "search",
        [[["key", "=", view_key]]],
        {"limit": 1},
    )
    print(f"  {view_key} (parent {parent[0]})")
    if dry_run:
        return existing[0] if existing else None
    vals = {
        "name": name,
        "key": view_key,
        "type": "qweb",
        "mode": "extension",
        "inherit_id": parent[0],
        "arch": arch,
        "active": True,
    }
    if existing:
        models.execute_kw(db, uid, password, "ir.ui.view", "write", [existing, vals])
        print(f"  updated view {existing[0]}")
        return existing[0]
    vid = models.execute_kw(db, uid, password, "ir.ui.view", "create", [vals])
    print(f"  created view {vid}")
    return vid


def rename_delivery_report_action(models, uid, db, password, *, dry_run: bool) -> None:
    """Menú Imprimir: Albarán de entrega → Remisión."""
    reports = models.execute_kw(
        db,
        uid,
        password,
        "ir.actions.report",
        "search_read",
        [[["report_name", "=", "stock.report_deliveryslip"]]],
        {"fields": ["id", "name"], "limit": 5},
    )
    if not reports:
        print("  WARNING: stock.report_deliveryslip action not found")
        return
    for rep in reports:
        rid = rep["id"]
        es = models.execute_kw(
            db,
            uid,
            password,
            "ir.actions.report",
            "read",
            [[rid], ["name"]],
            {"context": {"lang": "es_ES"}},
        )[0]["name"]
        print(f"  report action {rid}: es_ES={es!r} → Remisión")
        if dry_run:
            continue
        models.execute_kw(
            db,
            uid,
            password,
            "ir.actions.report",
            "update_field_translations",
            [[rid], "name", {"es_ES": "Remisión"}],
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--target", choices=("test", "prod"), default="prod")
    args = parser.parse_args()

    models, uid, db, password, url = odoo_client(args.target)
    print(f"Target={args.target} {url}")

    upsert_qweb_inherit(
        models,
        uid,
        db,
        password,
        parent_key="sale.report_saleorder_document",
        view_key=SALE_TITLE_KEY,
        name="Life Cotización/Pedido N° (Colombia)",
        arch=SALE_TITLE_ARCH,
        dry_run=args.dry_run,
    )
    upsert_qweb_inherit(
        models,
        uid,
        db,
        password,
        parent_key="sale.report_saleorder_document",
        view_key=SALE_META_KEY,
        name="Life cotización PDF sin fila fecha/vencimiento/comercial",
        arch=SALE_META_ARCH,
        dry_run=args.dry_run,
    )
    upsert_qweb_inherit(
        models,
        uid,
        db,
        password,
        parent_key="stock.report_delivery_document",
        view_key=DELIVERY_TITLE_KEY,
        name="Life Remisión en PDF entrega (Colombia)",
        arch=DELIVERY_TITLE_ARCH,
        dry_run=args.dry_run,
    )
    upsert_qweb_inherit(
        models,
        uid,
        db,
        password,
        parent_key="account.report_invoice_document",
        view_key=INVOICE_RECEIPT_KEY,
        name="Life recibo PDF título Liquidación",
        arch=INVOICE_RECEIPT_ARCH,
        dry_run=args.dry_run,
    )
    upsert_qweb_inherit(
        models,
        uid,
        db,
        password,
        parent_key="account.document_tax_totals",
        view_key=TAX_TOTALS_SALDO_KEY,
        name="Life liquidación PDF Total→Saldo",
        arch=TAX_TOTALS_SALDO_ARCH,
        dry_run=args.dry_run,
    )
    upsert_qweb_inherit(
        models,
        uid,
        db,
        password,
        parent_key="account.document_tax_totals_company_currency_template",
        view_key=TAX_TOTALS_CCY_SALDO_KEY,
        name="Life liquidación PDF Total→Saldo (company currency)",
        arch=TAX_TOTALS_CCY_SALDO_ARCH,
        dry_run=args.dry_run,
    )
    rename_delivery_report_action(models, uid, db, password, dry_run=args.dry_run)
    print(f"Done on {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
