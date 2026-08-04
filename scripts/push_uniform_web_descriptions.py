#!/usr/bin/env python3
"""Push rich website_description HTML for Life Deportes uniform products (Odoo 19).

DEPRECATED for copy sync — use sync_product_shop_copy.py.
Never duplicate HTML in description_ecommerce and website_description."""

from __future__ import annotations

import argparse
import base64
import os
import sys
import xmlrpc.client
from pathlib import Path

BASE = "https://lifedeportes.com/img/gallery"
LIFESTYLE_DIR = Path(__file__).resolve().parents[1] / "assets" / "product_photos" / "lifestyle"

GALLERY: dict[str, list[tuple[str, str]]] = {
    "baloncesto": [
        ("uniformes-baloncesto.webp", "Uniformes de baloncesto personalizados Life Deportes"),
        ("uniformes-basketball.webp", "Diseño de uniformes de basketball personalizados Colombia"),
        ("diseñar-uniformes-de-baloncesto.webp", "Diseñar uniformes de baloncesto personalizados"),
        ("uniformes-para-baloncesto-femenino.webp", "Uniformes de baloncesto femenino personalizados"),
        ("venta-de-uniformes-de-baloncesto-en-bogota.webp", "Uniformes de baloncesto personalizados Bogotá"),
        ("uniforme-de-basketball.webp", "Uniforme de basketball personalizado sublimación"),
        ("uniformes-de-baloncesto-femenino.webp", "Uniformes de baloncesto femenino sublimación premium"),
        ("uniformes-de-baloncesto-colombia.webp", "Uniformes de baloncesto fabricados en Colombia"),
    ],
    "voleibol": [
        ("uniforme-de-voleibol-completo.webp", "Uniforme de voleibol personalizado completo"),
        ("uniforme-de-voleibol.webp", "Diseño de uniforme de voleibol personalizado"),
        ("uniforme-voleibol-femenino.webp", "Uniforme de voleibol femenino personalizado"),
        ("uniformes-de-voleibol-bogota.webp", "Uniformes de voleibol personalizados Bogotá"),
        ("uniformes-de-voleibol-colombia.webp", "Uniformes de voleibol personalizados Colombia"),
        ("uniformes-de-voleibol-femenino.webp", "Uniformes de voleibol femenino sublimación"),
        ("uniformes-de-voleibol-masculino.webp", "Uniformes de voleibol masculino personalizados"),
        ("venta-de-uniformes-de-voleibol.webp", "Uniformes de voleibol con sublimación premium"),
    ],
    "atletismo": [
        ("uniforme-voleibol-femenino.webp", "Uniforme de atletismo manga sisa — inspiración femenina"),
        ("uniformes-de-voleibol-femenino.webp", "Diseño de uniforme de pista personalizado"),
        ("uniformes-para-voleibol-femenino.webp", "Uniforme ligero para atletismo y pista"),
        ("uniforme-de-voleibol-completo.webp", "Conjunto deportivo personalizado atletismo"),
        ("uniformes-de-voleibol-masculino.webp", "Uniforme de atletismo masculino personalizado"),
        ("uniformes-voleibol-masculino.webp", "Diseño de uniforme de pista y campo"),
        ("uniformes-de-voleibol-colombia.webp", "Uniformes de atletismo fabricados en Colombia"),
        ("diseñar-uniformes-de-voleibol-online.webp", "Diseñar uniformes de atletismo personalizados"),
    ],
}

PRODUCTS: dict[int, dict] = {
    23: {
        "sport": "baloncesto",
        "intro_title": "Confección Premium y Diseño 100% Personalizado",
        "intro_lead": (
            "En Life Deportes diseñamos y fabricamos uniformes de baloncesto de alto rendimiento "
            "para escuelas, clubes, ligas escolares y equipos competitivos. Corte holgado y tela "
            "transpirable para saltos, pivotes y juego indoor. Escudos, logos, patrocinadores, números "
            "y nombres sin límite de color gracias a nuestra sublimación digital premium — "
            "personalización 100% libre sin costo adicional."
        ),
        "includes": [
            ("Camiseta deportiva", "sublimada a tu gusto con cuello en V o redondo"),
            ("Pantaloneta", "corte basket holgado con cordón ajustable"),
        ],
        "dry_fit": (
            "Microfibra de poliéster de secado rápido que expulsa el sudor en canchas indoor "
            "y mantiene al jugador fresco durante cuartos intensos."
        ),
        "lifestyle": "lifestyle-uniforme-baloncesto-23",
    },
    31: {
        "sport": "voleibol",
        "intro_title": "Confección Premium y Diseño 100% Personalizado",
        "intro_lead": (
            "En Life Deportes confeccionamos uniformes de voleibol a medida para categorías "
            "femenino y masculino, infantiles y adultos. Tela técnica de alto rendimiento para "
            "saltos, bloqueos y movimientos explosivos en cancha. Escudos, logos, patrocinadores, "
            "números y nombres con sublimación digital premium — personalización 100% libre "
            "sin costo adicional."
        ),
        "includes": [
            ("Camiseta deportiva", "sublimada a tu gusto — manga corta, sisa o china"),
            ("Pantaloneta o licra", "según variante seleccionada"),
        ],
        "dry_fit": (
            "Control de sudoración y secado rápido para las exigencias del voleibol indoor: "
            "libertad de movimiento, frescura y comodidad en todo el set."
        ),
        "lifestyle": "lifestyle-uniforme-voleibol-31",
    },
    35: {
        "sport": "atletismo",
        "intro_title": "Confección Premium y Diseño 100% Personalizado",
        "intro_lead": (
            "En Life Deportes fabricamos uniformes de atletismo ultraligeros para pista, campo "
            "y competencias escolares. Camiseta manga sisa con cuello en V y short técnico diseñados "
            "para máximo confort en carrera, salto y lanzamiento. Escudos, logos, nombres, números "
            "y patrocinadores con sublimación digital premium — personalización 100% libre "
            "sin costo adicional."
        ),
        "includes": [
            ("Camiseta manga sisa", "cuello en V sublimada a tu gusto"),
            ("Pantaloneta o licra", "según variante seleccionada"),
        ],
        "dry_fit": (
            "Tela Dry-Fit liviana que reduce peso y acelera el secado en competencia al aire libre "
            "y en pista cubierta."
        ),
        "lifestyle": "lifestyle-uniforme-atletismo-35",
    },
}


def gallery_grid(sport: str) -> str:
    items = GALLERY[sport]
    cols = []
    for filename, alt in items:
        src = f"{BASE}/{filename}"
        cols.append(
            f"""            <div class="col-6 col-md-4 col-lg-3">
                <div class="card h-100 border-0 shadow-sm">
                    <img src="{src}" alt="{alt}" class="card-img-top rounded img-fluid" loading="lazy" />
                </div>
            </div>"""
        )
    return "\n".join(cols)


def build_html(cfg: dict) -> str:
    includes_li = "\n".join(
        f'                <li class="mb-2"><i class="fa fa-check-circle text-success me-2"></i>'
        f"<strong>{title}</strong> {detail}</li>"
        for title, detail in cfg["includes"]
    )
    sport = cfg["sport"]
    return f"""<div class="container ld-product-desc py-4">
    <div class="row align-items-center mb-5">
        <div class="col-lg-7">
            <h3 class="fw-bold text-primary mb-3">{cfg["intro_title"]}</h3>
            <p class="lead text-muted">{cfg["intro_lead"]}</p>
        </div>
        <div class="col-lg-5 bg-light p-4 rounded-3 border border-start-accent">
            <h5 class="fw-bold mb-3"><i class="fa fa-shopping-cart text-primary me-2"></i>¿Qué incluye el uniforme?</h5>
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
                <p class="text-muted small mb-0">Colores vibrantes y detalles nítidos que penetran la fibra de la tela. No se pelan, no se agrietan ni se destiñen con el lavado.</p>
            </div>
        </div>
        <div class="col-md-4">
            <div class="p-3 border rounded text-center h-100 bg-light shadow-sm">
                <i class="fa fa-users fa-2x text-primary mb-3"></i>
                <h5 class="fw-bold">Hormas y Tallas</h5>
                <p class="text-muted small mb-0">Patronaje disponible desde XS hasta 3XL en cortes masculino y femenino, adaptados a la comodidad del deportista.</p>
            </div>
        </div>
    </div>

    <div class="mb-5">
        <h4 class="fw-bold text-center mb-4">Inspiración y Diseños Reales</h4>
        <p class="text-center text-muted mb-4">Algunos de los miles de diseños que hemos creado para equipos en toda Colombia. <a href="https://lifedeportes.com/galeria.html#{sport}" target="_blank" rel="noopener">Ver galería completa</a>.</p>
        <div class="row g-3">
{gallery_grid(sport)}
        </div>
    </div>

    <div class="alert alert-info border-0 rounded-3 p-4">
        <h5 class="fw-bold mb-2"><i class="fa fa-info-circle me-2"></i>Condiciones de Venta y Fabricación</h5>
        <ul class="mb-0 ps-3">
            <li><strong>Pedido mínimo:</strong> 6 uniformes completos por diseño.</li>
            <li><strong>Tiempo de entrega:</strong> 10 días hábiles tras confirmar tallas/números y abono.</li>
            <li><strong>Abono inicial:</strong> 50% para iniciar producción, 50% restante antes del envío.</li>
            <li><strong>Cobertura:</strong> Envíos nacionales a toda Colombia y exportaciones a USA y Puerto Rico.</li>
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
        raise RuntimeError("Odoo authentication failed")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
    return models, uid, db, user, password


def resolve_lifestyle(stem: str) -> Path | None:
    for ext in (".png", ".webp", ".jpg"):
        path = LIFESTYLE_DIR / f"{stem}{ext}"
        if path.exists():
            return path
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--product-ids", type=int, nargs="+", default=[23, 31, 35])
    parser.add_argument("--promote-lifestyle", action="store_true", help="Set lifestyle PNG as template cover")
    parser.add_argument("--remove-duplicate-extras", action="store_true", help="Unlink product.image identical to cover")
    args = parser.parse_args()

    for pid in args.product_ids:
        if pid not in PRODUCTS:
            print(f"Skip unknown product {pid}")
            continue
        html = build_html(PRODUCTS[pid])
        print(f"\n[{pid}] website_description: {len(html)} chars")
        if not args.apply:
            continue

        models, uid, db, user, password = odoo_client()
        models.execute_kw(
            db, uid, password,
            "product.template", "write",
            [[pid], {"website_description": html, "description_ecommerce": html}],
        )
        print(f"  ✓ description updated")

        if args.remove_duplicate_extras:
            tpl = models.execute_kw(
                db, uid, password,
                "product.template", "read", [[pid]],
                {"fields": ["image_1920", "product_template_image_ids"]},
            )[0]
            main_b64 = tpl.get("image_1920") or ""
            extra_ids = tpl.get("product_template_image_ids") or []
            if extra_ids:
                extras = models.execute_kw(
                    db, uid, password,
                    "product.image", "read",
                    [extra_ids], {"fields": ["id", "name", "image_1920"]},
                )
                for extra in extras:
                    if (extra.get("image_1920") or "") == main_b64:
                        models.execute_kw(db, uid, password, "product.image", "unlink", [[extra["id"]]])
                        print(f"  ✓ removed duplicate product.image/{extra['id']} ({extra['name']})")

        if args.promote_lifestyle:
            stem = PRODUCTS[pid]["lifestyle"]
            path = resolve_lifestyle(stem)
            if path:
                b64 = base64.b64encode(path.read_bytes()).decode("ascii")
                models.execute_kw(
                    db, uid, password,
                    "product.template", "write",
                    [[pid], {"image_1920": b64}],
                )
                print(f"  ✓ cover <= {path.name}")

    if not args.apply:
        print("\nDry run. Re-run with --apply [--promote-lifestyle] [--remove-duplicate-extras]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
