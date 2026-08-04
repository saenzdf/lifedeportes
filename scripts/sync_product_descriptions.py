#!/usr/bin/env python3
"""Write sales descriptions for published products and sync to web fields."""

from __future__ import annotations

import argparse
import html
import os
import sys
import xmlrpc.client

PUBLISHED_PRODUCT_DESCRIPTIONS: dict[int, str] = {
    115: (
        "Uniforme completo de fútbol 100% personalizado con sublimación digital.\n"
        "Incluye camiseta, pantaloneta y medias en tela Dry Fit transpirable.\n"
        "Personaliza escudos, logos, nombres, números y patrocinadores.\n"
        "Disponible con medias semiprofesionales o profesionales."
    ),
    23: (
        "Uniforme completo de baloncesto personalizado con sublimación premium.\n"
        "Incluye camiseta y pantaloneta en tela Dry Fit de alto rendimiento.\n"
        "Diseño exclusivo para tu equipo con logos, nombres y números.\n"
        "Disponible con manga normal o raglan."
    ),
    31: (
        "Uniforme completo de voleibol personalizado con sublimación full color.\n"
        "Incluye camiseta y pantaloneta en tela técnica Dry Fit.\n"
        "Opciones de cuello en V o redondo, manga sisa o china, y pantaloneta o licra.\n"
        "Ideal para equipos femeninos, masculinos e infantiles."
    ),
    8: (
        "Uniforme de presentación para equipos deportivos.\n"
        "Conjunto personalizado con sublimación digital de alta calidad.\n"
        "Perfecto para entrada a cancha, protocolos y foto oficial del equipo.\n"
        "Fabricado en Colombia con envío a todo el país."
    ),
    35: (
        "Uniforme de atletismo personalizado con sublimación digital.\n"
        "Incluye camiseta manga sisa con cuello en V y pantaloneta a juego.\n"
        "Tela Dry Fit ligera para máximo rendimiento en pista y campo.\n"
        "Disponible también con pantaloneta en licra."
    ),
    62: (
        "Camiseta deportiva manga corta en tela Dry Fit.\n"
        "Disponible como prenda adicional en pedidos desde 6 uniformes completos.\n"
        "Sublimación digital full color con logos, nombres y diseños a medida.\n"
        "Transpirable, durable y ideal como camiseta extra del equipo.\n"
        "Disponible en manga corta, siza, china o larga."
    ),
    61: (
        "Camiseta deportiva con cuello polo sin botones, en tela Dry Fit.\n"
        "Sublimación digital personalizada para entrenadores, directivos y staff.\n"
        "Ideal para presentación institucional del equipo.\n"
        "Venta mínima de 6 unidades."
    ),
    947: (
        "Uniforme completo de fútbol con camiseta cuello polo con botones.\n"
        "Incluye camiseta polo, pantaloneta y medias en tela Dry Fit.\n"
        "Sublimación 100% personalizada con escudos, nombres y patrocinadores.\n"
        "Estilo formal ideal para equipos que prefieren cuello polo."
    ),
    684: (
        "Uniforme completo manga corta en material Dumonti premium.\n"
        "Incluye camiseta y pantaloneta con sublimación digital full color.\n"
        "Tela Dumonti: calidad superior a Dry Fit, excelente caída y durabilidad.\n"
        "Personalización total de diseño para tu equipo."
    ),
    197: (
        "Conjunto polo y pantalón para entrenamiento o presentación informal.\n"
        "Incluye camiseta con cuello polo y pantalón de sudadera sublimados.\n"
        "Conjunto cómodo y personalizado para staff, cuerpo técnico o equipo.\n"
        "Fabricación colombiana con diseño exclusivo Life Deportes."
    ),
    67: (
        "Pantalón de sudadera deportivo sublimado a medida.\n"
        "Prenda individual en tela cómoda para entrenamiento, viajes o calentamiento.\n"
        "Personalización full color con logos y diseños de tu equipo.\n"
        "Combina perfecto con chaquetas y conjuntos de presentación."
    ),
    68: (
        "Chaquetas deportivas sublimadas sin forro interior.\n"
        "Prenda ideal para calentamiento, banquillo y salida al campo.\n"
        "Material cortavientos con personalización digital full color.\n"
        "Diseño exclusivo para tu equipo."
    ),
    194: (
        "Bandera deportiva personalizada tamaño 1.10 x 1.50 metros.\n"
        "Disponible como complemento adicional en pedidos desde 6 uniformes completos.\n"
        "Impresión en sublimación con logos, escudos y diseños a medida.\n"
        "Ideal para estadio, camerino, eventos y presentación de equipo.\n"
        "Fabricada en tela resistente para uso en exteriores."
    ),
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


def text_to_web_html(text: str) -> str:
    paragraphs = [p.strip() for p in text.strip().split("\n") if p.strip()]
    return "".join(f"<p>{html.escape(p)}</p>" for p in paragraphs)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--only-empty",
        action="store_true",
        help="Only fill description_sale when currently empty",
    )
    args = parser.parse_args()

    models, uid, db, user, password = odoo_client()
    product_ids = sorted(PUBLISHED_PRODUCT_DESCRIPTIONS)
    products = models.execute_kw(
        db,
        uid,
        password,
        "product.template",
        "read",
        [product_ids],
        {"fields": ["id", "name", "description_sale", "website_description"]},
    )
    by_id = {p["id"]: p for p in products}

    for product_id in product_ids:
        product = by_id[product_id]
        new_sale = PUBLISHED_PRODUCT_DESCRIPTIONS[product_id]
        current_sale = (product.get("description_sale") or "").strip()

        if args.only_empty and current_sale:
            sale_to_write = current_sale
            source = "existing"
        else:
            sale_to_write = new_sale
            source = "catalog"

        web_html = text_to_web_html(sale_to_write)
        preview = sale_to_write.split("\n")[0]
        print(f"[{product_id}] {product['name']}")
        print(f"  source={source} | {preview[:70]}...")

        if not args.apply:
            continue

        models.execute_kw(
            db,
            uid,
            password,
            "product.template",
            "write",
            [
                [product_id],
                {
                    "description_sale": sale_to_write,
                    "website_description": web_html,
                    "description_ecommerce": web_html,
                },
            ],
        )
        print("  applied")

    if not args.apply:
        print("\nDry run. Re-run with --apply to update Odoo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
