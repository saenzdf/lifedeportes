#!/usr/bin/env python3
"""Restore rich website_description footer (gallery + sections) without touching sale/ecommerce copy."""

from __future__ import annotations

import argparse
import os
import sys
import xmlrpc.client

BASE = "https://lifedeportes.com/img/gallery"

# Top 5 sellers + sport uniforms from lifedeportes.com/galeria
FOOTER_PRODUCT_IDS = [115, 62, 23, 61, 31, 35]

GALLERY: dict[str, list[tuple[str, str]]] = {
    "futbol": [
        ("uniformes-de-futbol-personalizados.webp", "Uniforme de fútbol personalizado"),
        ("uniformes-de-futbol-bogota.webp", "Uniformes de fútbol Bogotá"),
        ("uniformes-de-futbol-bogota-7-de-agosto.webp", "Uniformes fútbol 7 de Agosto"),
        ("uniformes-de-futbol.webp", "Diseño uniforme fútbol Colombia"),
        ("uniformes-futbol-bogota.webp", "Uniformes fútbol Bogotá"),
        ("uniformes-para-futbol.webp", "Uniformes para fútbol"),
        ("fabrica-de-uniformes-de-futbol.webp", "Fábrica uniformes fútbol"),
        ("uniformes-de-futbol-cali.webp", "Uniformes fútbol Cali"),
    ],
    "baloncesto": [
        ("uniformes-baloncesto.webp", "Uniformes baloncesto Life Deportes"),
        ("uniformes-basketball.webp", "Uniformes basketball Colombia"),
        ("uniformes-para-baloncesto-femenino.webp", "Baloncesto femenino"),
        ("uniforme-de-basketball.webp", "Uniforme basketball sublimación"),
        ("uniformes-de-baloncesto-femenino.webp", "Baloncesto femenino sublimación"),
        ("uniformes-de-baloncesto-colombia.webp", "Baloncesto Colombia"),
        ("venta-de-uniformes-de-baloncesto-en-bogota.webp", "Baloncesto Bogotá"),
        ("uniforme-de-baloncesto.webp", "Uniforme baloncesto personalizado"),
    ],
    "voleibol": [
        ("uniforme-de-voleibol-completo.webp", "Uniforme voleibol completo"),
        ("uniforme-de-voleibol.webp", "Diseño uniforme voleibol"),
        ("uniforme-voleibol-femenino.webp", "Voleibol femenino"),
        ("uniformes-de-voleibol-bogota.webp", "Voleibol Bogotá"),
        ("uniformes-de-voleibol-colombia.webp", "Voleibol Colombia"),
        ("uniformes-de-voleibol-femenino.webp", "Voleibol femenino sublimación"),
        ("uniformes-de-voleibol-masculino.webp", "Voleibol masculino"),
        ("venta-de-uniformes-de-voleibol.webp", "Voleibol sublimación premium"),
    ],
    "atletismo": [
        ("uniforme-voleibol-femenino.webp", "Inspiración atletismo femenino"),
        ("uniformes-de-voleibol-femenino.webp", "Diseño pista personalizado"),
        ("uniformes-de-voleibol-masculino.webp", "Atletismo masculino"),
        ("uniforme-de-voleibol-completo.webp", "Conjunto deportivo pista"),
        ("uniformes-de-voleibol-colombia.webp", "Atletismo Colombia"),
        ("uniformes-voleibol-masculino.webp", "Uniforme pista y campo"),
        ("uniformes-para-voleibol-femenino.webp", "Diseño ligero competencia"),
        ("diseñar-uniformes-de-voleibol-online.webp", "Diseños personalizados atletismo"),
    ],
}

FOOTER: dict[int, dict] = {
    115: {
        "sport": "futbol",
        "title": "Confección Premium y Diseño 100% Personalizado",
        "lead": (
            "En Life Deportes diseñamos y fabricamos uniformes de fútbol de alto rendimiento para equipos "
            "profesionales, escuelas, clubes amateur y empresas. Escudos, logos, patrocinadores, números y nombres "
            "sin límite de color gracias a nuestra sublimación digital premium."
        ),
        "includes": [
            ("Camiseta deportiva", "sublimada a tu gusto"),
            ("Pantaloneta", "con cordón ajustable"),
            ("Medias deportivas", "semiprofesionales o profesionales según variante"),
        ],
        "dry_fit": (
            "Microfibra de poliéster de secado rápido que expulsa el sudor y mantiene al jugador fresco "
            "durante todo el partido."
        ),
        "min_uniforms": True,
    },
    62: {
        "sport": "futbol",
        "title": "Camisetas Deportivas Personalizadas",
        "lead": (
            "Camisetas dry-fit para entrenamiento, torneos escolares y complemento del uniforme de tu equipo. "
            "Personaliza cuello, manga y bordado con sublimación digital full color sin límite de detalles."
        ),
        "includes": [
            ("Camiseta dry-fit", "sublimada — cuello V, redondo o sport"),
            ("Variantes de manga", "corta, sisa, china o larga"),
        ],
        "dry_fit": (
            "Tela transpirable de secado rápido, ideal para entrenamientos intensos y uso frecuente en cancha."
        ),
        "min_uniforms": True,
    },
    23: {
        "sport": "baloncesto",
        "title": "Confección Premium y Diseño 100% Personalizado",
        "lead": (
            "Uniformes de baloncesto para escuelas, clubes y ligas con corte holgado y tela transpirable "
            "para saltos, pivotes y juego indoor. Personalización 100% libre sin costo adicional."
        ),
        "includes": [
            ("Camiseta manga sisa", "tank sublimado — cuello en V o redondo"),
            ("Pantaloneta", "corte basket holgado con cordón"),
        ],
        "dry_fit": (
            "Secado rápido en cancha indoor: expulsa el sudor y mantiene al jugador fresco en cuartos intensos."
        ),
        "min_uniforms": True,
    },
    61: {
        "sport": "futbol",
        "title": "Camiseta Polo Deportiva Personalizada",
        "lead": (
            "Camisetas cuello polo para staff, entrenadores y uniforme alterno del club. "
            "Acabado institucional con sublimación full color en Dry-Fit o Dumonti."
        ),
        "includes": [
            ("Camiseta cuello polo", "con o sin botones"),
            ("Manga corta o larga", "según variante"),
        ],
        "dry_fit": (
            "Opción Dry-Fit transpirable o Dumonti con mayor estructura; ambas personalizables a full color."
        ),
        "min_uniforms": True,
    },
    31: {
        "sport": "voleibol",
        "title": "Confección Premium y Diseño 100% Personalizado",
        "lead": (
            "Uniformes de voleibol para categorías femenino y masculino con tela técnica para saltos, "
            "bloqueos y movimiento explosivo en cancha. Diseño 100% personalizable."
        ),
        "includes": [
            ("Camiseta deportiva", "manga corta, sisa o china"),
            ("Pantaloneta o licra", "según variante"),
        ],
        "dry_fit": (
            "Control de sudoración y secado rápido para libertad de movimiento en todo el set."
        ),
        "min_uniforms": True,
    },
    35: {
        "sport": "atletismo",
        "title": "Confección Premium y Diseño 100% Personalizado",
        "lead": (
            "Uniformes de atletismo ultraligeros para pista y campo: máximo confort en carrera, salto "
            "y lanzamiento. Personalización completa con sublimación digital premium."
        ),
        "includes": [
            ("Camiseta manga sisa", "cuello en V sublimada"),
            ("Pantaloneta o licra", "según variante"),
        ],
        "dry_fit": (
            "Tela liviana que reduce peso y acelera el secado en competencia al aire libre y en pista cubierta."
        ),
        "min_uniforms": True,
    },
}


def build_footer(cfg: dict) -> str:
    sport = cfg["sport"]
    gallery = GALLERY[sport]
    includes_li = "\n".join(
        f'                <li class="mb-2"><i class="fa fa-check-circle text-success me-2"></i>'
        f"<strong>{t}</strong> {d}</li>"
        for t, d in cfg["includes"]
    )
    gallery_html = "\n".join(
        f"""            <div class="col-6 col-md-4 col-lg-3">
                <div class="card h-100 border-0 shadow-sm">
                    <img src="{BASE}/{fn}" alt="{alt}" class="card-img-top rounded img-fluid" loading="lazy" />
                </div>
            </div>"""
        for fn, alt in gallery
    )
    min_line = (
        "<li><strong>Pedido mínimo:</strong> 6 uniformes completos por diseño.</li>"
        if cfg.get("min_uniforms")
        else "<li><strong>Pedido mínimo:</strong> consulte cantidades según producto.</li>"
    )
    return f"""<div class="container ld-product-desc py-4">
    <div class="row align-items-center mb-5">
        <div class="col-lg-7">
            <h3 class="fw-bold text-primary mb-3">{cfg["title"]}</h3>
            <p class="lead text-muted">{cfg["lead"]}</p>
        </div>
        <div class="col-lg-5 bg-light p-4 rounded-3 border border-start-accent">
            <h5 class="fw-bold mb-3"><i class="fa fa-shopping-cart text-primary me-2"></i>¿Qué incluye?</h5>
            <ul class="list-unstyled mb-0">
{includes_li}
            </ul>
        </div>
    </div>
    <div class="row g-4 mb-5">
        <div class="col-md-4">
            <div class="p-3 border rounded text-center h-100 bg-light shadow-sm">
                <i class="fa fa-tint fa-2x text-primary mb-3"></i>
                <h5 class="fw-bold">Tecnología Dry-Fit</h5>
                <p class="text-muted small mb-0">{cfg["dry_fit"]}</p>
            </div>
        </div>
        <div class="col-md-4">
            <div class="p-3 border rounded text-center h-100 bg-light shadow-sm">
                <i class="fa fa-paint-brush fa-2x text-primary mb-3"></i>
                <h5 class="fw-bold">Sublimación Indeleble</h5>
                <p class="text-muted small mb-0">Colores vibrantes que penetran la fibra. No se pelan, no se agrietan ni se destiñen.</p>
            </div>
        </div>
        <div class="col-md-4">
            <div class="p-3 border rounded text-center h-100 bg-light shadow-sm">
                <i class="fa fa-users fa-2x text-primary mb-3"></i>
                <h5 class="fw-bold">Hormas y Tallas</h5>
                <p class="text-muted small mb-0">XS a 3XL en cortes masculino y femenino.</p>
            </div>
        </div>
    </div>
    <div class="mb-5">
        <h4 class="fw-bold text-center mb-4">Inspiración y Diseños Reales</h4>
        <p class="text-center text-muted mb-4"><a href="https://lifedeportes.com/galeria.html#{sport}" target="_blank" rel="noopener">Ver galería completa en lifedeportes.com</a></p>
        <div class="row g-3">
{gallery_html}
        </div>
    </div>
    <div class="alert alert-info border-0 rounded-3 p-4">
        <h5 class="fw-bold mb-2"><i class="fa fa-info-circle me-2"></i>Condiciones de Venta y Fabricación</h5>
        <ul class="mb-0 ps-3">
            {min_line}
            <li><strong>Tiempo de entrega:</strong> 10 días hábiles tras confirmar tallas/números y abono.</li>
            <li><strong>Abono inicial:</strong> 50% para iniciar producción, 50% restante antes del envío.</li>
            <li><strong>Cobertura:</strong> Envíos a toda Colombia y exportaciones a USA y Puerto Rico.</li>
            <li>Consulta nuestras <a href="/terms">condiciones de venta</a>.</li>
        </ul>
    </div>
</div>"""


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
    parser.add_argument("--product-ids", type=int, nargs="*", default=FOOTER_PRODUCT_IDS)
    args = parser.parse_args()

    for pid in args.product_ids:
        if pid not in FOOTER:
            print(f"Skip {pid}: no footer config")
            continue
        html = build_footer(FOOTER[pid])
        print(f"[{pid}] website_description footer={len(html)} chars")
        if not args.apply:
            continue
        models, uid, db, user, password = odoo_client()
        models.execute_kw(
            db, uid, password,
            "product.template", "write",
            [[pid], {"website_description": html}],
        )
        print("  ✓ footer updated (sale/ecommerce untouched)")

    if not args.apply:
        print("\nDry run. Re-run with --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
