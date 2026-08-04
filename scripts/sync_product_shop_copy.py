#!/usr/bin/env python3
"""Sync Odoo shop copy: concise quote text + 1–2 short web paragraphs."""

from __future__ import annotations

import argparse
import os
import sys
import xmlrpc.client

# description_sale → presupuestos / cotizaciones / listado tienda (corto).
PRESUPUESTO: dict[int, str] = {
    8: "Uniforme de presentación polo personalizado.",
    23: "Uniforme de baloncesto personalizado (camiseta sisa y pantaloneta).",
    31: "Uniforme de voleibol personalizado (camiseta y pantaloneta o licra).",
    35: "Uniforme de atletismo personalizado (camiseta sisa y pantaloneta o licra).",
    61: "Camiseta deportiva cuello polo personalizada.",
    62: "Camiseta deportiva dry-fit personalizada.",
    66: "Sudadera chaqueta y pantalón tela Orión personalizados.",
    67: "Pantalón de sudadera personalizado.",
    68: "Chaqueta rompevientos con capota personalizada.",
    69: "Petos sublimados para entrenamiento.",
    115: "Uniforme de fútbol personalizado (camiseta, pantaloneta y medias).",
    178: "Conjunto de arquero personalizado.",
    194: "Bandera institucional 1.10 × 1.50 m personalizada.",
    685: "Camiseta deportiva Dumonti personalizada.",
    1804: "Gorra con un bordado incluido.",
    1811: "Sudadera algodón lycrado con bordados personalizados.",
    1819: "Uniforme con bordado incluido (camiseta y pantaloneta).",
    70: "Tula deportiva sublimada personalizada.",
    1795: "Buso con capota en algodón Lotto sublimable.",
    1797: "Camiseta deportiva para lluvia personalizada.",
    1800: "Chaqueta en algodón Lotto sublimable.",
    1813: "Uniforme camiseta doble faz y pantaloneta personalizado.",
}

# description_ecommerce → ficha web (1 o 2 párrafos cortos).
WEB: dict[int, tuple[str, ...]] = {
    8: (
        "Conjunto de presentación con camiseta polo y bermuda para protocolo y foto oficial del equipo. "
        "Sublimación digital full color sobre tela deportiva.",
        "Diseño 100% personalizable. Pedido mínimo 6 unidades; fabricación 10 días hábiles.",
    ),
    23: (
        "Uniforme de baloncesto con camiseta manga sisa (tank) y pantaloneta en corte holgado para cancha indoor. "
        "Cuello en V o redondo; tela Dry-Fit con sublimación indeleble.",
        "Escudos, logos y números sin límite de color. Mínimo 6 uniformes completos por diseño.",
    ),
    31: (
        "Uniforme de voleibol: camiseta técnica más pantaloneta o licra según la variante. "
        "Configura cuello en V o redondo y manga corta, sisa o china.",
        "Colores vibrantes con sublimación premium. Desde 6 uniformes por diseño.",
    ),
    35: (
        "Uniforme de atletismo ultraligero para pista y campo: camiseta manga sisa con cuello en V "
        "y pantaloneta o licra.",
        "Tela Dry-Fit de secado rápido y diseño personalizado sin costo adicional. Mínimo 6 unidades.",
    ),
    61: (
        "Camiseta deportiva cuello polo para staff, entrenadores o uniforme alterno del club. "
        "Opciones con o sin botones, manga corta o larga y tela Dry-Fit o Dumonti.",
        "Sublimación full color. Pedido desde 6 camisetas del mismo diseño.",
    ),
    62: (
        "Camiseta deportiva dry-fit para entrenamiento o complemento del uniforme del equipo. "
        "Configura cuello, manga (corta, sisa, china o larga) y bordado.",
        "Sublimación digital indeleble. Mínimo 6 camisetas por diseño.",
    ),
    66: (
        "Conjunto sudadera chaqueta y pantalón en tela Orión para viajes, entrenamientos fríos "
        "y presentación del equipo.",
        "Personalización con sublimación digital full color.",
    ),
    67: (
        "Pantalón de sudadera personalizado para complementar buzos y chaquetas del equipo. "
        "Acabado deportivo durable con diseño full color en sublimación digital.",
    ),
    68: (
        "Chaqueta rompevientos con capota en tela repelente al agua, disponible con o sin forro interior. "
        "Protección ligera para lluvia, calentamiento y viajes.",
        "Diseño exclusivo del club en sublimación digital.",
    ),
    69: (
        "Petos sublimados en malla para entrenamiento y marcación en cancha. "
        "Livianos, coloridos y 100% personalizables con el escudo del club.",
    ),
    115: (
        "Uniforme completo de fútbol: camiseta, pantaloneta y medias en tela Dry-Fit transpirable. "
        "Personaliza cuello en V sencillo, redondo o escocés, manga corta o larga y tipo de pantaloneta.",
        "Sublimación digital full color sin límite de colores. Mínimo 6 uniformes por diseño; "
        "fabricación 10 días hábiles.",
    ),
    178: (
        "Conjunto de arquero diferenciado del uniforme de campo: camiseta manga larga y pantalón negro "
        "con diseño exclusivo en colores que destacan al guardameta.",
        "Sublimación indeleble en tela Dry-Fit. Pedido mínimo 6 conjuntos por diseño.",
    ),
    194: (
        "Bandera 1.10 × 1.50 m en poliéster con sublimación full color y filtro UV; "
        "ideal para estadio, camerino y eventos del club.",
    ),
    685: (
        "Camiseta deportiva en tela Dumonti, con mayor gramaje que el dry-fit estándar. "
        "Variantes de cuello y manga con sublimación personalizada.",
        "Ideal para equipos que buscan más estructura. Mínimo 6 camisetas.",
    ),
    1804: (
        "Gorra personalizada con un bordado incluido en el precio. "
        "Complemento institucional ideal para staff y directivos del club.",
        "Consulte colores disponibles y cantidades para pedidos grupales.",
    ),
    1811: (
        "Sudaderas en algodón lycrado con bordados personalizados. "
        "Confort premium fuera de cancha para staff, directivos y representación del club.",
    ),
    1819: (
        "Uniformes con bordado incluido en el precio: camiseta y pantaloneta en Dry-Fit o Dumonti, "
        "manga corta o larga.",
        "Acabado premium para equipos que exigen bordado sin sobrecosto adicional. Desde 6 uniformes.",
    ),
    70: (
        "Tula deportiva sublimada para llevar uniforme, balón y accesorios del equipo. "
        "Diseño full color con escudo y colores del club.",
        "Práctica, resistente y personalizable; ideal como complemento institucional o regalo del equipo.",
    ),
    1795: (
        "Buso con capota en tela Lotto: algodón sublimable de tacto suave y acabado mate. "
        "Ideal para días fríos, viajes y representación del club fuera de cancha.",
        "La sublimación en algodón permite diseños full color con tonos más opacos que el poliéster; "
        "confort premium con capucha y bolsillo canguro.",
    ),
    1797: (
        "Camiseta deportiva para lluvia: prenda ligera resistente al agua para entrenamientos "
        "y partidos bajo llovizna.",
        "Personalización con sublimación digital; protege sin perder movilidad. Consulte tallas y cantidades.",
    ),
    1800: (
        "Chaqueta en tela Lotto (algodón sublimable) con cierre frontal; disponible con o sin forro interior. "
        "Acabado mate propio del algodón, ideal para calentamiento y uso casual institucional.",
        "Diseño full color del club; la variante con forro aporta mayor abrigo en climas fríos.",
    ),
    1813: (
        "Uniforme con camiseta doble faz (reversible) y pantaloneta: dos diseños en una prenda "
        "para partido local/visitante o entrenamiento.",
        "Manga corta o larga; sublimación en Dry-Fit o Dumonti. Mínimo 6 uniformes por diseño.",
    ),
}


def build_ecommerce(paragraphs: tuple[str, ...]) -> str:
    return "".join(f"<p>{para}</p>" for para in paragraphs)


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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--product-ids", type=int, nargs="*", help="Default: all published products in PRESUPUESTO")
    args = parser.parse_args()
    ids = args.product_ids or sorted(PRESUPUESTO.keys())

    for pid in ids:
        if pid not in PRESUPUESTO or pid not in WEB:
            print(f"Skip {pid}: no copy defined")
            continue
        presupuesto = PRESUPUESTO[pid]
        ecommerce = build_ecommerce(WEB[pid])
        n_para = len(WEB[pid])
        print(f"[{pid}] presupuesto={len(presupuesto)} web={n_para}p ({len(ecommerce)} chars)")
        if not args.apply:
            continue
        models, uid, db, user, password = odoo_client()
        models.execute_kw(
            db, uid, password,
            "product.template", "write",
            [[pid], {
                "description_sale": presupuesto,
                "description_ecommerce": ecommerce,
                "website_description": False,
            }],
        )
        print("  ✓ updated")

    if not args.apply:
        print("\nDry run. Re-run with --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
