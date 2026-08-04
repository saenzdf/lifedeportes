import argparse
import csv
import os
import xmlrpc.client

ODOO_URL = os.environ.get("ODOO_URL", "https://life-soluciones.odoo.com")
ODOO_DB = os.environ.get("ODOO_DB", "life-soluciones")
ODOO_USER = os.environ.get("ODOO_USERNAME", "info@lifedeportes.com")
ODOO_PWD = os.environ.get("ODOO_PASSWORD")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Importa catalogo 2026: actualiza templates, limpia variantes y archiva obsoletos."
    )
    parser.add_argument("csv_file", help="Ruta del CSV exportado de product.template")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simula cambios sin escribir en Odoo.",
    )
    parser.add_argument(
        "--archive-missing",
        action="store_true",
        help="Archiva productos de la categoria objetivo que no esten en el CSV.",
    )
    parser.add_argument(
        "--category-id",
        type=int,
        default=1,
        help="Categoria de producto a usar para nuevos templates y archivado.",
    )
    return parser.parse_args()


def parse_price(raw):
    if raw is None:
        return 0.0
    cleaned = str(raw).strip().replace(" ", "").replace(".", "").replace(",", ".")
    if not cleaned:
        return 0.0
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def parse_bool(raw):
    value = str(raw or "").strip().lower()
    return value in {"true", "1", "si", "yes", "x"}


def canonical_name(name):
    return " ".join((name or "").strip().lower().split())


def read_catalog(csv_file):
    products = []
    with open(csv_file, mode="r", encoding="utf-8-sig", newline="") as file_obj:
        reader = csv.DictReader(file_obj)
        for row in reader:
            name = (row.get("Name") or "").strip()
            if not name:
                continue
            products.append(
                {
                    "name": name,
                    "name_key": canonical_name(name),
                    "list_price": parse_price(row.get("List_price")),
                    "description_sale": (row.get("") or "").strip(),
                    "external_id": (row.get("id") or "").strip(),
                    "is_favorite": parse_bool(row.get("is_favorite")),
                }
            )
    return products


def auth():
    if not ODOO_PWD:
        raise RuntimeError("Falta ODOO_PASSWORD en variables de entorno.")

    common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
    uid = common.authenticate(ODOO_DB, ODOO_USER, ODOO_PWD, {})
    if not uid:
        raise RuntimeError("Fallo en autenticacion de Odoo.")
    models = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")
    return uid, models


def get_template_by_external_id(models, uid, ext_id_full):
    if not ext_id_full or "." not in ext_id_full:
        return None
    module, name = ext_id_full.split(".", 1)
    domain = [["module", "=", module], ["name", "=", name], ["model", "=", "product.template"]]
    result = models.execute_kw(
        ODOO_DB, uid, ODOO_PWD, "ir.model.data", "search_read", [domain], {"fields": ["res_id"], "limit": 1}
    )
    return result[0]["res_id"] if result else None


def get_existing_templates(models, uid, category_id):
    templates = models.execute_kw(
        ODOO_DB,
        uid,
        ODOO_PWD,
        "product.template",
        "search_read",
        [[["categ_id", "=", category_id], ["active", "in", [True, False]]]],
        {"fields": ["id", "name", "active"], "limit": 0},
    )
    by_name = {}
    for item in templates:
        by_name[canonical_name(item["name"])] = item
    return templates, by_name


def clear_variant_attributes(models, uid, template_id, dry_run):
    if dry_run:
        return
    models.execute_kw(
        ODOO_DB,
        uid,
        ODOO_PWD,
        "product.template",
        "write",
        [[template_id], {"attribute_line_ids": [(5, 0, 0)]}],
    )


def upsert_template(models, uid, category_id, product_row, by_name, dry_run):
    template_id = get_template_by_external_id(models, uid, product_row["external_id"])
    if not template_id:
        existing = by_name.get(product_row["name_key"])
        template_id = existing["id"] if existing else None

    vals = {
        "name": product_row["name"],
        "list_price": product_row["list_price"],
        "description_sale": product_row["description_sale"],
        "sale_ok": True,
        "purchase_ok": False,
        "is_favorite": product_row["is_favorite"],
        "active": True,
    }

    if template_id:
        if not dry_run:
            models.execute_kw(ODOO_DB, uid, ODOO_PWD, "product.template", "write", [[template_id], vals])
            clear_variant_attributes(models, uid, template_id, dry_run=False)
        return template_id, "updated"

    create_vals = dict(vals)
    create_vals.update(
        {
            "type": "consu",
            "tracking": "none",
            "categ_id": category_id,
        }
    )
    if not dry_run:
        template_id = models.execute_kw(ODOO_DB, uid, ODOO_PWD, "product.template", "create", [create_vals])
        clear_variant_attributes(models, uid, template_id, dry_run=False)
    else:
        template_id = -1
    return template_id, "created"


def archive_missing_templates(models, uid, category_id, imported_template_ids, dry_run):
    domain = [
        ["categ_id", "=", category_id],
        ["active", "=", True],
        ["id", "not in", list(imported_template_ids) or [0]],
    ]
    to_archive = models.execute_kw(ODOO_DB, uid, ODOO_PWD, "product.template", "search", [domain])
    if to_archive and not dry_run:
        models.execute_kw(ODOO_DB, uid, ODOO_PWD, "product.template", "write", [to_archive, {"active": False}])
    return to_archive


def main():
    args = parse_args()
    catalog = read_catalog(args.csv_file)
    if not catalog:
        print("No se encontraron productos validos en el CSV.")
        return

    uid, models = auth()
    _, by_name = get_existing_templates(models, uid, args.category_id)

    created = 0
    updated = 0
    imported_ids = set()

    for product in catalog:
        template_id, action = upsert_template(
            models=models,
            uid=uid,
            category_id=args.category_id,
            product_row=product,
            by_name=by_name,
            dry_run=args.dry_run,
        )
        if action == "created":
            created += 1
        else:
            updated += 1
        if template_id > 0:
            imported_ids.add(template_id)
        print(f"{action.upper()}: {product['name']} (${int(product['list_price'])})")

    archived_ids = []
    if args.archive_missing:
        archived_ids = archive_missing_templates(
            models=models,
            uid=uid,
            category_id=args.category_id,
            imported_template_ids=imported_ids,
            dry_run=args.dry_run,
        )

    print("\nResumen")
    print(f"- Productos en CSV: {len(catalog)}")
    print(f"- Creados: {created}")
    print(f"- Actualizados: {updated}")
    print(f"- Archivados: {len(archived_ids)}")
    print(f"- Modo: {'SIMULACION' if args.dry_run else 'EJECUCION'}")


if __name__ == "__main__":
    main()
