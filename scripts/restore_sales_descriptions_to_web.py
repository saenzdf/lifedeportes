#!/usr/bin/env python3
"""Restore original sales descriptions (from SO history) and sync to web fields."""

from __future__ import annotations

import argparse
import html
import os
import sys
import xmlrpc.client

# Recovered from sale.order.line name (2nd line) — the text shown on quotations/orders.
SALES_DESCRIPTIONS: dict[int, str] = {
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
    8: "Camiseta cuello polo con Bermuda  y Medias media caña",
    61: "Sin botones",
    62: (
        "Camiseta deportiva profesional, diseñada para garantizar confort, rendimiento y "
        "estilo en la práctica deportiva."
    ),
    68: "Sin forro",
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
    # These products never had a sales paragraph on historical SO lines (only product name).
    67: "",
    197: "",
    684: "",
}


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


def sale_text_to_web_html(text: str) -> str | False:
    text = (text or "").strip()
    if not text:
        return False
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if len(paragraphs) == 1 and "\n" in paragraphs[0]:
        paragraphs = [p.strip() for p in paragraphs[0].split("\n") if p.strip()]
    return "".join(f"<p>{html.escape(p)}</p>" for p in paragraphs)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    models, uid, db, user, password = odoo_client()
    products = models.execute_kw(
        db,
        uid,
        password,
        "product.template",
        "read",
        [sorted(SALES_DESCRIPTIONS)],
        {"fields": ["id", "name", "description_sale"]},
    )

    for product in sorted(products, key=lambda row: row["name"]):
        sale_text = SALES_DESCRIPTIONS[product["id"]]
        web_html = sale_text_to_web_html(sale_text)
        print(f"\n[{product['id']}] {product['name']}")
        print(f"  sale -> {sale_text[:90] or '(vacío)'}...")
        print(f"  web  -> {'(vacío)' if not web_html else 'copiado'}")

        if not args.apply:
            continue

        vals: dict = {"description_sale": sale_text or False}
        if web_html:
            vals["website_description"] = web_html
            vals["description_ecommerce"] = web_html
        else:
            vals["website_description"] = False
            vals["description_ecommerce"] = False

        models.execute_kw(db, uid, password, "product.template", "write", [[product["id"]], vals])

        # Keep variants aligned for sales documents.
        variant_ids = models.execute_kw(
            db,
            uid,
            password,
            "product.product",
            "search",
            [[["product_tmpl_id", "=", product["id"]]]],
        )
        if variant_ids:
            models.execute_kw(
                db,
                uid,
                password,
                "product.product",
                "write",
                [variant_ids, {"description_sale": sale_text or False}],
            )
        print("  applied")

    if not args.apply:
        print("\nDry run. Re-run with --apply to update Odoo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
