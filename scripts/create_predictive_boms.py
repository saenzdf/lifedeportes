import csv, os, sys, xmlrpc.client, re

ODOO_URL = os.environ.get("ODOO_LIFEDEPORTES_URL")
ODOO_DB = os.environ.get("ODOO_LIFEDEPORTES_DB")
ODOO_USER = os.environ.get("ODOO_LIFEDEPORTES_USERNAME")
ODOO_PWD = os.environ.get("ODOO_LIFEDEPORTES_PASSWORD")

def auth():
    common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
    uid = common.authenticate(ODOO_DB, ODOO_USER, ODOO_PWD, {})
    return uid, xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")

def get_product_ids_by_exact_tmpl_name(models, uid, name):
    res = models.execute_kw(ODOO_DB, uid, ODOO_PWD, "product.product", "search_read", 
                            [[["name", "=", name], ["active", "=", True]]], 
                            {"fields": ["id", "name"], "limit": 1})
    return res[0]["id"] if res else None

def get_component_id(models, uid, name_ilike):
    res = models.execute_kw(ODOO_DB, uid, ODOO_PWD, "product.product", "search_read", 
                            [[["name", "ilike", name_ilike], ["active", "=", True]]], 
                            {"fields": ["id", "name"], "limit": 1})
    return res[0]["id"] if res else None

def main(csv_file):
    uid, models = auth()
    
    # Preload generic raw materials
    papel_impr_id = get_component_id(models, uid, "Papel Impres") or 503
    papel_prot_id = get_component_id(models, uid, "Papel protector Sublimaci") or 8287
    tela_id = get_component_id(models, uid, "Tela Falcao") or 9771
    confeccion_id = get_component_id(models, uid, "Confecci") or 183
    
    # Get all products from CSV to map names to template ids and check existing boms
    products = []
    with open(csv_file, 'r', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            n = row.get("Name", "").strip()
            if n: products.append({"name": n, "note": row.get("", "").strip()})
    
    tmpl_cache = {}
    
    for p in products:
        name = p["name"]
        res = models.execute_kw(ODOO_DB, uid, ODOO_PWD, "product.template", "search_read",
                                [[["name", "=", name], ["active", "=", True]]],
                                {"fields": ["id", "name"], "limit": 1})
        if not res: continue
        tmpl_id = res[0]["id"]
        tmpl_cache[name.lower()] = tmpl_id
        
        # Check if BOM exists
        bom_exists = models.execute_kw(ODOO_DB, uid, ODOO_PWD, "mrp.bom", "search", 
                                       [[["product_tmpl_id", "=", tmpl_id], ["active", "=", True]]])
        if bom_exists:
            print(f"BOM ya existe para: {name}")
            continue
            
        lower = f"{name} {p['note']}".lower()
        
        bom_vals = {
            "product_tmpl_id": tmpl_id,
            "product_qty": 1.0,
            "ready_to_produce": "all_available"
        }
        
        lines = []
        
        # Heuristica
        if re.search(r"incremento|extra |diseño especial|bordado adicional", lower):
            print(f"Saltando servicio: {name}")
            continue
            
        elif "uniforme" in lower or "conjunto" in lower:
            # Kit Phantom
            bom_vals["type"] = "phantom"
            
            # Subcomponentes: intentamos buscar la camiseta y pantaloneta
            cam_id = get_product_ids_by_exact_tmpl_name(models, uid, "Camiseta deportiva manga corta dry fit")
            pan_id = get_product_ids_by_exact_tmpl_name(models, uid, "Pantalonetas")
            
            if cam_id: lines.append((0, 0, {"product_id": cam_id, "product_qty": 1.0}))
            if pan_id: lines.append((0, 0, {"product_id": pan_id, "product_qty": 1.0}))
            
        elif "gorra" in lower:
             bom_vals["type"] = "phantom"
             # No standard structure yet
             pass
        else:
            # Manufactura (MP sublimación / Prendas sueltas)
            bom_vals["type"] = "normal"
            if tela_id: lines.append((0, 0, {"product_id": tela_id, "product_qty": 1.0}))
            if papel_impr_id: lines.append((0, 0, {"product_id": papel_impr_id, "product_qty": 1.0}))
            if papel_prot_id: lines.append((0, 0, {"product_id": papel_prot_id, "product_qty": 1.0}))
            if confeccion_id: lines.append((0, 0, {"product_id": confeccion_id, "product_qty": 1.0}))
            
        if lines:
            bom_vals["bom_line_ids"] = lines
            bom_id = models.execute_kw(ODOO_DB, uid, ODOO_PWD, "mrp.bom", "create", [bom_vals])
            print(f"CREADA LdM ({bom_vals['type']}) para {name} (ID {bom_id}) con {len(lines)} componentes.")
        else:
            print(f"No hay lineas predictivas para: {name}")

if __name__ == "__main__":
    main(sys.argv[1])
