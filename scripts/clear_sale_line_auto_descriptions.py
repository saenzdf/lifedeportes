#!/usr/bin/env python3
"""Quita descripciones automáticas de pedidos/liquidaciones; conserva copy en la web.

- description_ecommerce / website_description: se rellenan/conservan (ficha tienda).
- description_sale: se vacía (ya no se pega en líneas de SO).
- Líneas SO / factura: se quita el párrafo automático tras el nombre; se dejan
  anotaciones manuales distintas del catálogo.
- PDF cotización y liquidación: muestran el nombre completo (notas manuales sí).
"""

from __future__ import annotations

import argparse
import html
import os
import re
import sys
import time
import xmlrpc.client
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

# Import shop WEB copy map from sibling script.
from sync_product_shop_copy import PRESUPUESTO, WEB, build_ecommerce  # noqa: E402

# Long blurbs historically pasted into SO lines (restore_sales_descriptions_to_web).
LEGACY_LONG: dict[int, str] = {
    115: (
        "Uniforme deportivo profesional compuesto por camiseta, pantaloneta y medias, "
        "diseñado para brindar máximo rendimiento y confort en cada práctica o competencia."
    ),
    23: (
        "Uniforme deportivo profesional compuesto por camiseta, pantaloneta y medias, "
        "diseñado para brindar máximo rendimiento y confort en cada práctica o competencia."
    ),
    31: (
        "Uniforme deportivo profesional compuesto por camiseta, pantaloneta y medias, "
        "diseñado para brindar máximo rendimiento y confort en cada práctica o competencia."
    ),
    947: (
        "Uniforme deportivo profesional compuesto por camiseta, pantaloneta y medias, "
        "diseñado para brindar máximo rendimiento y confort en cada práctica o competencia."
    ),
    35: (
        "Uniforme deportivo profesional compuesto por camiseta, pantaloneta y medias, "
        "diseñado para brindar máximo rendimiento y confort en cada práctica o competencia."
    ),
    62: (
        "Camiseta deportiva profesional, diseñada para garantizar confort, rendimiento y "
        "estilo en la práctica deportiva."
    ),
    194: (
        "Bandera personalizada de alta calidad, ideal para acompañar al equipo en competencias, "
        "entrenamientos, presentaciones o eventos institucionales.\n\n"
        "Confeccionada en tela resistente tipo poliéster de excelente durabilidad y acabado liviano, "
        "lo que permite un fácil manejo, buena caída y visibilidad óptima incluso en movimiento. "
        "Incorpora protección con filtro UV, que ayuda a preservar los colores y evitar el desgaste "
        "prematuro por exposición solar.\n\n"
        "La bandera se personaliza mediante sublimación digital a full color, lo que permite aplicar "
        "escudos, logotipos, mensajes o cualquier diseño con acabados nítidos, colores intensos y alta "
        "fidelidad gráfica."
    ),
    8: "Camiseta cuello polo con Bermuda  y Medias media caña",
    61: "Sin botones",
    68: "Sin forro",
}

GENERIC_AUTO_PREFIXES = (
    "uniforme deportivo profesional compuesto",
    "camiseta deportiva profesional, diseñada",
    "bandera personalizada de alta calidad",
)

QUOTE_DESC_VIEW_KEY = "life.report_saleorder_hide_product_description"
INVOICE_DESC_VIEW_KEY = "life.report_invoice_hide_product_auto_description"


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


def kw(models, uid, db, password, model, method, *args, **kwargs):
    return models.execute_kw(db, uid, password, model, method, list(args), kwargs)


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def build_auto_blurb_set(models, uid, db, password) -> set[str]:
    blurbs: set[str] = set()
    for text in PRESUPUESTO.values():
        if text and text.strip():
            blurbs.add(norm(text))
    for text in LEGACY_LONG.values():
        if text and text.strip():
            blurbs.add(norm(text))
    rows = kw(
        models,
        uid,
        db,
        password,
        "product.template",
        "search_read",
        [["description_sale", "!=", False]],
        fields=["description_sale"],
    )
    for row in rows:
        t = (row.get("description_sale") or "").strip()
        if t:
            blurbs.add(norm(t))
    rows = kw(
        models,
        uid,
        db,
        password,
        "product.product",
        "search_read",
        [["description_sale", "!=", False]],
        fields=["description_sale"],
        limit=5000,
    )
    for row in rows:
        t = (row.get("description_sale") or "").strip()
        if t:
            blurbs.add(norm(t))
    return blurbs


def is_auto_blurb(rest: str, blurbs: set[str]) -> bool:
    n = norm(rest)
    if not n:
        return True
    if n in blurbs:
        return True
    for prefix in GENERIC_AUTO_PREFIXES:
        if n.startswith(prefix):
            return True
    # Short catalog one-liners often end with "personalizada(o)."
    if n in blurbs:
        return True
    return False


def clean_line_name(name: str, blurbs: set[str]) -> str | None:
    """Return cleaned name, or None if unchanged."""
    if not name or "\n" not in name:
        return None
    first, *rest_parts = name.split("\n")
    rest = "\n".join(rest_parts).strip()
    if not rest:
        cleaned = first.rstrip()
        return cleaned if cleaned != name else None
    if is_auto_blurb(rest, blurbs):
        return first.rstrip()
    # Mixed: first paragraph auto, later paragraphs manual
    paragraphs = [p.strip() for p in rest.split("\n\n") if p.strip()]
    if len(paragraphs) > 1 and is_auto_blurb(paragraphs[0], blurbs):
        kept = "\n\n".join(paragraphs[1:])
        return f"{first.rstrip()}\n{kept}" if kept else first.rstrip()
    return None


def ensure_web_copy(models, uid, db, password, *, dry_run: bool) -> None:
    """Write marketing copy to ecommerce/web; never wipe existing non-empty web HTML."""
    ids = sorted(set(PRESUPUESTO) | set(WEB) | set(LEGACY_LONG))
    products = kw(
        models,
        uid,
        db,
        password,
        "product.template",
        "search_read",
        [["id", "in", ids]],
        fields=["id", "name", "description_ecommerce", "website_description", "description_sale"],
    )
    by_id = {p["id"]: p for p in products}
    for pid in ids:
        p = by_id.get(pid)
        if not p:
            continue
        existing_ecom = (p.get("description_ecommerce") or "").strip()
        existing_web = (p.get("website_description") or "").strip()
        if pid in WEB:
            ecom = build_ecommerce(WEB[pid])
        elif LEGACY_LONG.get(pid):
            paras = [x.strip() for x in LEGACY_LONG[pid].split("\n\n") if x.strip()]
            ecom = "".join(f"<p>{html.escape(x)}</p>" for x in paras)
        elif (p.get("description_sale") or "").strip():
            ecom = f"<p>{html.escape(p['description_sale'].strip())}</p>"
        else:
            ecom = ""
        vals = {}
        if ecom and not existing_ecom:
            vals["description_ecommerce"] = ecom
        if ecom and not existing_web:
            vals["website_description"] = ecom
        print(f"  web [{pid}] {p['name'][:40]}: write={bool(vals)} ecom_len={len(existing_ecom)}→{len(vals.get('description_ecommerce', existing_ecom))}")
        if vals and not dry_run:
            kw(models, uid, db, password, "product.template", "write", [pid], vals)


def clear_description_sale(models, uid, db, password, *, dry_run: bool) -> None:
    tmpl_ids = kw(
        models,
        uid,
        db,
        password,
        "product.template",
        "search",
        [["description_sale", "!=", False]],
    )
    print(f"  clear description_sale on {len(tmpl_ids)} templates")
    if tmpl_ids and not dry_run:
        kw(
            models,
            uid,
            db,
            password,
            "product.template",
            "write",
            tmpl_ids,
            {"description_sale": False},
        )
    var_ids = kw(
        models,
        uid,
        db,
        password,
        "product.product",
        "search",
        [["description_sale", "!=", False]],
    )
    print(f"  clear description_sale on {len(var_ids)} variants")
    if var_ids and not dry_run:
        # batch
        for i in range(0, len(var_ids), 200):
            chunk = var_ids[i : i + 200]
            kw(
                models,
                uid,
                db,
                password,
                "product.product",
                "write",
                chunk,
                {"description_sale": False},
            )


def strip_lines(models, uid, db, password, *, dry_run: bool, blurbs: set[str]) -> None:
    # Prefer searching known auto fragments (newline ilike is unreliable over XML-RPC).
    fragments = [
        "diseñada para garantizar confort",
        "Uniforme deportivo profesional compuesto",
        "Bandera personalizada de alta calidad",
        "personalizada.",
        "personalizado.",
        "personalizados.",
        "personalizada)",
    ]
    sol_ids: list[int] = []
    for frag in fragments:
        found = kw(
            models,
            uid,
            db,
            password,
            "sale.order.line",
            "search",
            [
                ["order_id.state", "in", ["draft", "sent", "sale"]],
                ["display_type", "=", False],
                ["name", "ilike", frag],
            ],
        )
        sol_ids.extend(found)
    sol_ids = sorted(set(sol_ids))
    print(f"  SO lines candidates: {len(sol_ids)}")
    changed = 0
    for i in range(0, len(sol_ids), 80):
        chunk = sol_ids[i : i + 80]
        rows = kw(
            models,
            uid,
            db,
            password,
            "sale.order.line",
            "search_read",
            [["id", "in", chunk]],
            fields=["id", "name"],
        )
        for row in rows:
            cleaned = clean_line_name(row["name"] or "", blurbs)
            if cleaned is None:
                continue
            changed += 1
            if not dry_run:
                kw(
                    models,
                    uid,
                    db,
                    password,
                    "sale.order.line",
                    "write",
                    [row["id"]],
                    {"name": cleaned},
                )
        if i and i % 400 == 0:
            print(f"    SO progress {i}/{len(sol_ids)} changed={changed}")
            time.sleep(0.1)
    print(f"  SO lines cleaned: {changed}")

    aml_ids: list[int] = []
    for frag in fragments:
        found = kw(
            models,
            uid,
            db,
            password,
            "account.move.line",
            "search",
            [
                ["move_id.move_type", "in", ["out_invoice", "out_receipt", "out_refund"]],
                ["display_type", "=", "product"],
                ["name", "ilike", frag],
            ],
        )
        aml_ids.extend(found)
    aml_ids = sorted(set(aml_ids))
    print(f"  invoice/receipt line candidates: {len(aml_ids)}")
    changed_i = 0
    for i in range(0, len(aml_ids), 80):
        chunk = aml_ids[i : i + 80]
        rows = kw(
            models,
            uid,
            db,
            password,
            "account.move.line",
            "search_read",
            [["id", "in", chunk]],
            fields=["id", "name"],
        )
        for row in rows:
            cleaned = clean_line_name(row["name"] or "", blurbs)
            if cleaned is None:
                continue
            changed_i += 1
            if not dry_run:
                kw(
                    models,
                    uid,
                    db,
                    password,
                    "account.move.line",
                    "write",
                    [row["id"]],
                    {"name": cleaned},
                )
    print(f"  invoice lines cleaned: {changed_i}")


def upsert_pdf_views(models, uid, db, password, *, dry_run: bool) -> None:
    """Show full line name on quote/invoice PDFs (manual notes kept; auto already stripped)."""
    # Quotation: revert first-line-only hide → show full name (notes manuales)
    parent_sale = kw(
        models, uid, db, password, "ir.ui.view", "search", [["key", "=", "sale.report_saleorder_document"]], limit=1
    )[0]
    sale_arch = """<?xml version="1.0"?>
<data inherit_id="sale.report_saleorder_document">
    <!-- Nombre + anotación manual del staff (description_sale ya vacío en producto). -->
    <xpath expr="//td[@name='td_product_name']/span[@t-field='line.name']" position="replace">
        <span t-field="line.name" t-options="{'widget': 'text'}"/>
    </xpath>
</data>
"""
    # If hide view exists, rewrite it to pass-through full name
    existing = kw(
        models, uid, db, password, "ir.ui.view", "search", [["key", "=", QUOTE_DESC_VIEW_KEY]], limit=1
    )
    vals = {
        "name": "Life quotation PDF product name (manual notes ok)",
        "key": QUOTE_DESC_VIEW_KEY,
        "type": "qweb",
        "mode": "extension",
        "inherit_id": parent_sale,
        "arch": sale_arch,
        "active": True,
    }
    print(f"  quote PDF view {QUOTE_DESC_VIEW_KEY}")
    if not dry_run:
        if existing:
            kw(models, uid, db, password, "ir.ui.view", "write", [existing[0]], vals)
        else:
            kw(models, uid, db, password, "ir.ui.view", "create", [vals])

    parent_inv = kw(
        models, uid, db, password, "ir.ui.view", "search", [["key", "=", "account.report_invoice_document"]], limit=1
    )[0]
    # Invoice lines: ensure text widget; auto blurbs stripped from data.
    # Optional: still show only first line if somehow auto remains — prefer full name for notes.
    inv_arch = """<?xml version="1.0"?>
<data inherit_id="account.report_invoice_document">
    <!-- Sin cambio de markup: el texto automático ya se limpió en account.move.line.
         Esta vista documenta la política Life; t-field line.name ya muestra notas manuales. -->
    <xpath expr="//span[@t-field='line.name'][1]" position="attributes">
        <attribute name="t-options">{"widget": "text"}</attribute>
    </xpath>
</data>
"""
    existing_i = kw(
        models, uid, db, password, "ir.ui.view", "search", [["key", "=", INVOICE_DESC_VIEW_KEY]], limit=1
    )
    vals_i = {
        "name": "Life liquidación/factura PDF notes (manual ok)",
        "key": INVOICE_DESC_VIEW_KEY,
        "type": "qweb",
        "mode": "extension",
        "inherit_id": parent_inv,
        "arch": inv_arch,
        "active": True,
    }
    print(f"  invoice PDF view {INVOICE_DESC_VIEW_KEY}")
    if not dry_run:
        if existing_i:
            kw(models, uid, db, password, "ir.ui.view", "write", [existing_i[0]], vals_i)
        else:
            try:
                kw(models, uid, db, password, "ir.ui.view", "create", [vals_i])
            except Exception as e:
                print(f"  skip invoice view create ({e})")
                # Not critical — data cleanup is the real fix for liquidación


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("test", "prod"), default="prod")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-lines", action="store_true")
    parser.add_argument("--skip-web", action="store_true")
    args = parser.parse_args()

    models, uid, db, password, url = odoo_client(args.target)
    print(f"Target={args.target} {url} dry_run={args.dry_run}")

    if not args.skip_web:
        print("1) Ensure web/ecommerce copy")
        ensure_web_copy(models, uid, db, password, dry_run=args.dry_run)

    print("2) Collect auto blurbs")
    blurbs = build_auto_blurb_set(models, uid, db, password)
    print(f"  known auto blurbs: {len(blurbs)}")

    if not args.skip_lines:
        print("3) Strip auto blurbs from open lines")
        strip_lines(models, uid, db, password, dry_run=args.dry_run, blurbs=blurbs)

    print("4) Clear product description_sale")
    clear_description_sale(models, uid, db, password, dry_run=args.dry_run)

    print("5) PDF views")
    upsert_pdf_views(models, uid, db, password, dry_run=args.dry_run)

    # Sample
    sample = kw(
        models,
        uid,
        db,
        password,
        "sale.order.line",
        "search_read",
        [["order_id.state", "in", ["draft", "sent", "sale"]], ["display_type", "=", False]],
        fields=["id", "name", "order_id"],
        limit=3,
        order="id desc",
    )
    for s in sample:
        print("  sample", s["order_id"], repr((s["name"] or "")[:120]))
    pt = kw(
        models,
        uid,
        db,
        password,
        "product.template",
        "search_read",
        [["id", "=", 62]],
        fields=["description_sale", "description_ecommerce"],
    )
    print("  product 62", {k: (len(v) if isinstance(v, str) else v) for k, v in pt[0].items()})
    print(f"Done on {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
