#!/usr/bin/env python3
"""
Lee el CSV 2026 y, para filas con external_id, consulta Odoo (solo lectura):
- mrp.bom del product.template
- lineas: producto componente y tipo de LdM (phantom/normal)

Sirve para validar el patron "materia prima directa" vs "kit de subproductos".

Uso:
  export ODOO_PASSWORD=...
  python3 scripts/analyze_ldm_catalog_2026.py "life 2026 - Producto (product.template).csv"
"""

import argparse
import csv
import os
import re
import xmlrpc.client

ODOO_URL = os.environ.get("ODOO_URL", "https://life-soluciones.odoo.com")
ODOO_DB = os.environ.get("ODOO_DB", "life-soluciones")
ODOO_USER = os.environ.get("ODOO_USERNAME", "info@lifedeportes.com")
ODOO_PWD = os.environ.get("ODOO_PASSWORD")


def auth():
    if not ODOO_PWD:
        raise SystemExit("Defina ODOO_PASSWORD en el entorno.")
    common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
    uid = common.authenticate(ODOO_DB, ODOO_USER, ODOO_PWD, {})
    if not uid:
        raise SystemExit("Autenticacion fallida.")
    return uid, xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")


def tmpl_id_from_xml_id(models, uid, xml_id):
    if not xml_id or "." not in xml_id:
        return None
    module, name = xml_id.split(".", 1)
    dom = [["module", "=", module], ["name", "=", name], ["model", "=", "product.template"]]
    rows = models.execute_kw(ODOO_DB, uid, ODOO_PWD, "ir.model.data", "search_read", [dom], {"fields": ["res_id"], "limit": 1})
    return rows[0]["res_id"] if rows else None


def classify_line_component(name):
    n = (name or "").lower()
    if any(k in n for k in ("papel", "tela", "protector", "sublim")):
        return "mp_sublimacion"
    if any(k in n for k in ("camiseta", "pantaloneta", "media", "chaqueta", "buzo", "pantalon")):
        return "prenda_hija"
    return "otro"


def fetch_boms_for_template(models, uid, tmpl_id):
    bom_ids = models.execute_kw(
        ODOO_DB, uid, ODOO_PWD, "mrp.bom", "search", [[["product_tmpl_id", "=", tmpl_id], ["active", "=", True]]]
    )
    if not bom_ids:
        return []
    return models.execute_kw(
        ODOO_DB,
        uid,
        ODOO_PWD,
        "mrp.bom",
        "read",
        [bom_ids],
        {"fields": ["id", "type", "product_tmpl_id", "bom_line_ids"]},
    )


def fetch_bom_lines(models, uid, line_ids):
    if not line_ids:
        return []
    lines = models.execute_kw(
        ODOO_DB,
        uid,
        ODOO_PWD,
        "mrp.bom.line",
        "read",
        [line_ids],
        {"fields": ["product_id", "product_qty"]},
    )
    prod_ids = list({l["product_id"][0] for l in lines if l.get("product_id")})
    if not prod_ids:
        return lines
    prods = models.execute_kw(
        ODOO_DB, uid, ODOO_PWD, "product.product", "read", [prod_ids], {"fields": ["id", "name", "product_tmpl_id"]}
    )
    id_to_name = {p["id"]: p["name"] for p in prods}
    for line in lines:
        pid = line["product_id"][0] if line.get("product_id") else None
        line["_component_name"] = id_to_name.get(pid, "?")
    return lines


def predict_ldm_for_row(name, note):
    """
    Heuristica offline para filas SIN external_id (productos nuevos en Odoo).
    No sustituye validacion en Odoo; alinea con la logica operativa Life.
    """
    lower = f"{name} {note}".lower()
    if re.search(r"incremento|extra |diseño especial|bordado adicional", lower):
        return "servicio_o_cargo", "Sin LdM de fabricacion o solo cargo comercial."
    if "gorras" in lower:
        return "compra_o_taller", "Suele ser compra/bordado; LdM distinta a sublimacion de prendas (validar en Odoo)."
    if "uniforme" in lower or "conjunto" in lower or "doble faz" in lower:
        return "kit_phantom", "Probable LdM fantasma: subproductos (camiseta/pantaloneta/medias) o equivalentes."
    if "sudadera" in lower or re.search(r"\bbuso", lower) or "chaqueton" in lower:
        return "kit_o_mp", "Conjunto chaqueta+pantalon: suele ser kit o MP segun como registren lotto/orion."
    if any(
        x in lower
        for x in (
            "camiseta",
            "chaqueta",
            "pantaloneta",
            "pantalón",
            "pantalon",
            "buzo",
            "peto",
            "banderas",
            "tulas",
            "medias",
        )
    ):
        return "mp_sublimacion", "Prenda suelta: LdM con tela + papel impresion + papel protector (y similares)."
    return "revisar", "Clasificar manualmente segun muestra en planta."


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_file")
    ap.add_argument("--predict-only", action="store_true", help="Solo heuristicas offline, sin Odoo.")
    args = ap.parse_args()

    rows = []
    with open(args.csv_file, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            name = (row.get("Name") or "").strip()
            if not name:
                continue
            rows.append(
                {
                    "name": name,
                    "note": (row.get("") or "").strip(),
                    "xml_id": (row.get("id") or "").strip(),
                }
            )

    if args.predict_only:
        print("Prediccion offline (sin Odoo)\n")
        for r in rows:
            kind, expl = predict_ldm_for_row(r["name"], r["note"])
            print(f"[{kind}] {r['name']}")
            print(f"    {expl}\n")
        return

    uid, models = auth()

    print("Productos con XML ID en Odoo (muestra real de LdM)\n")
    for r in rows:
        if not r["xml_id"]:
            continue
        tid = tmpl_id_from_xml_id(models, uid, r["xml_id"])
        if not tid:
            print(f"(no encontrado) {r['name']}  [{r['xml_id']}]")
            continue
        boms = fetch_boms_for_template(models, uid, tid)
        if not boms:
            print(f"[sin LdM] {r['name']} (template {tid})")
            continue
        for bom in boms:
            lines = fetch_bom_lines(models, uid, bom["bom_line_ids"])
            tags = [classify_line_component(l.get("_component_name", "")) for l in lines]
            if bom["type"] == "phantom":
                modo = "KIT_PHANTOM"
            elif "prenda_hija" in tags:
                modo = "KIT_DE_PRENDAS"
            elif "mp_sublimacion" in tags:
                modo = "MP_SUBLIMACION"
            else:
                modo = "OTRO"

            comps = ", ".join(f"{l.get('_component_name', '?')} x{l.get('product_qty', 0)}" for l in lines[:8])
            if len(lines) > 8:
                comps += f" ... (+{len(lines) - 8} lineas)"
            print(f"[{modo}] bom_type={bom['type']} | {r['name']}")
            print(f"    {comps}\n")

    print("\n--- Productos NUEVOS (sin XML ID): prediccion heuristica ---\n")
    for r in rows:
        if r["xml_id"]:
            continue
        kind, expl = predict_ldm_for_row(r["name"], r["note"])
        print(f"[{kind}] {r['name']}")
        print(f"    {expl}\n")


if __name__ == "__main__":
    main()
