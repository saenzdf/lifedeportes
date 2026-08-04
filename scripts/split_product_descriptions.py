#!/usr/bin/env python3
"""Set short description_sale and markdown-based web descriptions for published products."""

from __future__ import annotations

import argparse
import html
import os
import re
import sys
import xmlrpc.client

COMMON_CONDITIONS = (
    "Venta al por mayor. Pedido mínimo de 6 uniformes completos por diseño. "
    "Los complementos (camiseta extra, bandera, medias, gorras, etc.) se cotizan adicionales al pedido base. "
    "Abono inicial del 50% para iniciar producción. "
    "Tiempo de fabricación: 10 días hábiles después del abono y de recibir tallas, nombres y números. "
    "Condiciones completas en lifedeportes.com/terms-of-use"
)

PRODUCT_COPY: dict[int, dict[str, str]] = {
    115: {
        "short": "Uniforme completo de fútbol personalizado (camiseta, pantaloneta y medias).",
        "markdown": """Uniforme deportivo profesional para fútbol con **sublimación digital full color**.

## Incluye
- Camiseta deportiva
- Pantaloneta
- Medias (semiprofesionales o profesionales según variante)

## Tela y material
Tela **Dry Fit** (poliéster) transpirable, ideal para competencia y entrenamiento.

## Detalles
- Personalización de escudos, logos, nombres, números y patrocinadores
- Variante de medias semiprofesionales o profesionales

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    23: {
        "short": "Uniforme completo de baloncesto personalizado (camiseta y pantaloneta).",
        "markdown": """Uniforme de baloncesto con **sublimación digital** para equipos escolares, clubes y ligas.

## Incluye
- Camiseta deportiva
- Pantaloneta

## Tela y material
Tela **Dry Fit** de alto rendimiento, cómoda y durable.

## Detalles
- Variantes de manga normal o raglan
- Diseño 100% personalizable

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    31: {
        "short": "Uniforme completo de voleibol personalizado (camiseta y pantaloneta).",
        "markdown": """Uniforme de voleibol confeccionado a medida con **sublimación premium**.

## Incluye
- Camiseta deportiva
- Pantaloneta o licra (según variante)

## Tela y material
Tela **Dry Fit** técnica para indoor y alto rendimiento.

## Detalles
- Opciones de cuello en V o redondo
- Manga sisa o china según variante
- Pantaloneta clásica o en licra

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    8: {
        "short": "Uniforme de presentación personalizado para equipos.",
        "markdown": """Conjunto de presentación para **entrada a cancha**, protocolos y foto oficial del equipo.

## Incluye
- Camiseta cuello polo
- Bermuda
- Medias media caña

## Tela y material
Sublimación digital full color sobre telas deportivas seleccionadas para presentación.

## Detalles
- Diseño exclusivo para tu institución o club
- Ideal para protocolos y foto oficial

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    35: {
        "short": "Uniforme de atletismo personalizado (camiseta manga sisa y pantaloneta).",
        "markdown": """Uniforme de atletismo **ligero** para pista y campo.

## Incluye
- Camiseta manga sisa con cuello en V
- Pantaloneta o licra (según variante)

## Tela y material
Tela **Dry Fit** liviana para máximo confort en competencia.

## Detalles
- Personalización completa del diseño del equipo
- Opción de pantaloneta en licra

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    62: {
        "short": "Camiseta deportiva manga corta Dry Fit sublimada.",
        "markdown": """Camiseta individual para entrenamiento o uso por separado.

## Incluye
- Camiseta deportiva manga corta

## Tela y material
Tela **Dry Fit** (poliéster) transpirable.

## Detalles
- Variantes de manga corta, sisa, china o larga
- Complemento ideal en pedidos desde 6 uniformes completos
- Sublimación digital full color con logos, nombres y diseños a medida

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    61: {
        "short": "Camiseta deportiva cuello polo sin botones.",
        "markdown": """Camiseta tipo **polo** para entrenadores, directivos y staff.

## Incluye
- Camiseta cuello polo sin botones

## Tela y material
Tela **Dry Fit** con sublimación digital.

## Detalles
- Ideal para presentación institucional del equipo
- Pedido mínimo recomendado: 6 unidades

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    947: {
        "short": "Uniforme de fútbol con camiseta cuello polo con botones.",
        "markdown": """Uniforme completo de fútbol con **estilo polo formal**.

## Incluye
- Camiseta cuello polo con botones
- Pantaloneta
- Medias

## Tela y material
Tela **Dry Fit** con sublimación digital full color.

## Detalles
- Personalización total de diseño, logos y numeración
- Estilo formal ideal para equipos que prefieren cuello polo

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    197: {
        "short": "Conjunto camiseta polo y pantalón de sudadera.",
        "markdown": """Conjunto de entrenamiento o presentación informal para **staff y equipos**.

## Incluye
- Camiseta cuello polo
- Pantalón de sudadera

## Tela y material
Telas deportivas sublimadas a medida.

## Detalles
- Ideal para cuerpo técnico, viajes y calentamiento
- Conjunto cómodo y personalizado

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    67: {
        "short": "Pantalón de sudadera deportivo sublimado.",
        "markdown": """Pantalón de sudadera **individual** personalizado.

## Incluye
- Pantalón de sudadera

## Tela y material
Tela cómoda para entrenamiento y uso diario del equipo.

## Detalles
- Personalización full color con logos y diseños de tu equipo
- Combina con chaquetas y conjuntos Life Deportes

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    68: {
        "short": "Chaqueta rompevientos sublimada sin forro.",
        "markdown": """Chaqueta para **calentamiento**, banquillo y salida al campo.

## Incluye
- Chaqueta rompevientos

## Tela y material
Material **cortavientos**, sin forro interior.

## Detalles
- Personalización full color con sublimación digital
- Ideal para banquillo y salida al campo

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    66: {
        "short": "Sudadera chaqueta y pantalón material Orión.",
        "markdown": """Conjunto de sudadera **chaqueta y pantalón** en material Orión.

## Incluye
- Chaqueta forrada
- Pantalón a juego

## Tela y material
Material **Orión** con acabado premium y excelente durabilidad.

## Detalles
- Conjunto completo para entrenamiento, viajes y presentación
- Personalización con sublimación digital full color

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    194: {
        "short": "Bandera personalizada 1.10 x 1.50 m.",
        "markdown": """Bandera institucional o deportiva de **alta visibilidad**.

## Incluye
- Bandera 1.10 x 1.50 metros

## Tela y material
Tela poliéster resistente con acabado liviano y **filtro UV**.

## Detalles
- Sublimación digital full color
- Ideal para estadio, camerino y eventos del equipo
- Complemento adicional en pedidos desde 6 uniformes completos

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    685: {
        "short": "Camiseta deportiva sublimada en Dry Fit.",
        "markdown": """Camiseta deportiva **100% personalizable** con sublimación digital.

## Incluye
- Camiseta deportiva

## Tela y material
Tela **Dry Fit** (poliéster) transpirable y durable.

## Detalles
- Diseño full color con logos, nombres y numeración
- Ideal como prenda adicional del equipo
- Variantes de manga según configuración del producto

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    178: {
        "short": "Conjunto completo de arquero personalizado.",
        "markdown": """Conjunto especializado para **arquero** con diseño diferenciado del resto del equipo.

## Incluye
- Camiseta manga larga de arquero
- Pantalón de arquero

## Tela y material
Tela **Dry Fit** con sublimación digital full color.

## Detalles
- Mismo diseño del equipo con color diferenciado para arquero
- Personalización de logos, nombres y numeración
- Ideal para equipos de fútbol escolar, club y liga

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    69: {
        "short": "Petos sublimados para entrenamiento.",
        "markdown": """Petos de entrenamiento **sublimados** para distinguir equipos en práctica.

## Incluye
- Peto sublimado

## Tela y material
Malla deportiva liviana y resistente.

## Detalles
- Sublimación digital full color
- Ideal para entrenamientos, escuelas y academias
- Diseño personalizado con logos y colores del club

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    1804: {
        "short": "Gorra deportiva con un bordado incluido.",
        "markdown": """Gorra deportiva personalizada con **un bordado incluido**.

## Incluye
- Gorra deportiva
- Un bordado (logo o texto)

## Tela y material
Gorra en tela resistente con acabado deportivo.

## Detalles
- Bordado de alta calidad incluido en el precio
- Ideal como complemento del uniforme o regalo institucional
- Personalización con logo del equipo

## Condiciones comerciales
Complemento disponible sin pedido mínimo de uniformes. Bordado adicional: consultar precio extra.""",
    },
    1811: {
        "short": "Sudadera en algodón lycrado con dos bordados incluidos.",
        "markdown": """Sudadera premium en **algodón lycrado** con bordados incluidos.

## Incluye
- Sudadera en algodón lycrado
- **2 bordados** incluidos

## Tela y material
Algodón lycrado de alta calidad, cómodo y con excelente caída.

## Detalles
- Bordados incluidos en el precio (2 ubicaciones)
- Acabado premium para equipos que buscan máxima calidad
- Ideal para staff, directivos y presentación institucional

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    1819: {
        "short": "Uniforme completo con un bordado incluido.",
        "markdown": """Uniforme completo con **sublimación digital** y un bordado incluido.

## Incluye
- Camiseta deportiva
- Pantaloneta
- **Un bordado** incluido

## Tela y material
Tela **Dry Fit** transpirable con sublimación full color.

## Detalles
- Bordado incluido en el precio (logo en pecho u otra ubicación acordada)
- Personalización total del diseño del equipo
- Bordados adicionales disponibles por separado

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
    1815: {
        "short": "Uniforme completo con pantaloneta impermeable.",
        "markdown": """Uniforme completo con pantaloneta **impermeable** para máximo rendimiento en lluvia.

## Incluye
- Camiseta deportiva
- Pantaloneta impermeable

## Tela y material
Camiseta en **Dry Fit** + pantaloneta en tela impermeable de alto rendimiento.

## Detalles
- Ideal para equipos que entrenan o compiten en condiciones húmedas
- Sublimación digital full color en camiseta
- Pantaloneta con acabado impermeable

## Condiciones comerciales
""" + COMMON_CONDITIONS,
    },
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


def escape_inline(text: str) -> str:
    text = html.escape(text)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)


def markdown_to_html(md: str) -> str:
    """Convert a small markdown subset (headings, lists, bold, paragraphs) to HTML."""
    lines = md.strip().splitlines()
    parts: list[str] = []
    in_list = False

    for raw in lines:
        line = raw.rstrip()
        if not line:
            if in_list:
                parts.append("</ul>")
                in_list = False
            continue

        if line.startswith("## "):
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<h4>{escape_inline(line[3:])}</h4>")
            continue

        if line.startswith("- "):
            if not in_list:
                parts.append("<ul>")
                in_list = True
            parts.append(f"<li>{escape_inline(line[2:])}</li>")
            continue

        if in_list:
            parts.append("</ul>")
            in_list = False
        parts.append(f"<p>{escape_inline(line)}</p>")

    if in_list:
        parts.append("</ul>")
    return "".join(parts)


def build_ecommerce_html(copy: dict[str, str]) -> str:
    md = copy["markdown"]
    intro = md.split("\n\n", 1)[0]
    fabric_match = re.search(r"## Tela y material\n(.+?)(?:\n\n|$)", md, re.S)
    fabric = fabric_match.group(1).strip() if fabric_match else ""
    return markdown_to_html(f"{intro}\n\n{fabric}" if fabric else intro)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--published-only",
        action="store_true",
        help="Only update products currently published on the website",
    )
    args = parser.parse_args()

    models, uid, db, user, password = odoo_client()

    if args.published_only:
        published = models.execute_kw(
            db,
            uid,
            password,
            "product.template",
            "search_read",
            [[["sale_ok", "=", True], ["is_published", "=", True]]],
            {"fields": ["id"]},
        )
        product_ids = sorted(
            pid for pid in (row["id"] for row in published) if pid in PRODUCT_COPY
        )
        missing = sorted(
            row["id"] for row in published if row["id"] not in PRODUCT_COPY
        )
        if missing:
            print(f"Warning: published products without copy: {missing}")
    else:
        product_ids = sorted(PRODUCT_COPY)

    products = models.execute_kw(
        db,
        uid,
        password,
        "product.template",
        "read",
        [product_ids],
        {"fields": ["id", "name"]},
    )

    for product in sorted(products, key=lambda row: row["name"]):
        copy = PRODUCT_COPY[product["id"]]
        short = copy["short"]
        web_html = markdown_to_html(copy["markdown"])
        ecom_html = build_ecommerce_html(copy)
        print(f"\n[{product['id']}] {product['name']}")
        print(f"  sale: {short}")
        print(f"  web:  markdown -> HTML ({len(web_html)} chars)")

        if not args.apply:
            continue

        models.execute_kw(
            db,
            uid,
            password,
            "product.template",
            "write",
            [
                [product["id"]],
                {
                    "description_sale": short,
                    "website_description": web_html,
                    "description_ecommerce": ecom_html,
                },
            ],
        )
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
                [variant_ids, {"description_sale": short}],
            )
        print("  applied")

    if not args.apply:
        print("\nDry run. Re-run with --apply to update Odoo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
