import xmlrpc.client
import os

ODOO_URL = os.environ.get('ODOO_URL', 'https://life-soluciones-test-saas19-0401.odoo.com')
ODOO_DB = os.environ.get('ODOO_DB', 'life-soluciones-test-saas19-0401')
ODOO_USER = os.environ.get('ODOO_USERNAME', 'info@lifedeportes.com')
ODOO_PWD = os.environ.get('ODOO_PASSWORD', '69107ef026d59dbf78c323a9bd47404a72fe2592')

def get_designer_from_task(models, db, uid, pwd, origin):
    # Search for project task related to this origin (Sale Order)
    tasks = models.execute_kw(db, uid, pwd, 'project.task', 'search_read', [[['sale_order_id.name', '=', origin]]], {'fields': ['id', 'message_follower_ids']})
    
    for task in tasks:
        follower_ids = task.get('message_follower_ids', [])
        if not follower_ids: continue
        
        followers = models.execute_kw(db, uid, pwd, 'mail.followers', 'search_read', [[['id', 'in', follower_ids]]], {'fields': ['partner_id']})
        
        for fol in followers:
            partner = fol.get('partner_id')
            if partner:
                pid, pname = partner[0], partner[1]
                # Filter out system/admin/company users. We want the real designer.
                # Assuming "Diseñador" in name or not the company.
                if "Admin" not in pname and "S.A.S" not in pname:
                    return pid, pname
    return None, None

def main():
    common = xmlrpc.client.ServerProxy('{}/xmlrpc/2/common'.format(ODOO_URL))
    uid = common.authenticate(ODOO_DB, ODOO_USER, ODOO_PWD, {})
    if not uid:
        print("Fallo en autenticacion")
        return
    
    models = xmlrpc.client.ServerProxy('{}/xmlrpc/2/object'.format(ODOO_URL))
    
    # 1. Search POs assigned to Jose Diseñador (81) in the last 7 days approx
    # Actually, we can just search all draft POs assigned to Jose Diseñador (81)
    domain = [
        ['partner_id', '=', 81],
        ['state', 'in', ['draft', 'sent']],
        ['origin', '!=', False]
    ]
    
    pos = models.execute_kw(ODOO_DB, uid, ODOO_PWD, 'purchase.order', 'search_read', [domain], {'fields': ['id', 'name', 'origin', 'partner_id']})
    
    print(f"Se encontraron {len(pos)} Compras asignadas a Jose Diseñador con un documento de origen.")
    updated_count = 0
    for po in pos:
        po_id = po['id']
        origin = po['origin']
        print(f"Revisando {po['name']} (Origen: {origin})...")
        
        # 2. Get the actual designer from the Task
        actual_pid, actual_pname = get_designer_from_task(models, ODOO_DB, uid, ODOO_PWD, origin)
        
        if actual_pid and actual_pid != 81:
            print(f" -> Se encontro al diseñador real: {actual_pname} (ID: {actual_pid})")
            
            # 3. Update the PO 
            models.execute_kw(ODOO_DB, uid, ODOO_PWD, 'purchase.order', 'write', [[po_id], {'partner_id': actual_pid}])
            print(f" -> ¡Actualizada PO {po['name']} a {actual_pname}!")
            updated_count += 1
        else:
            if not actual_pid:
                print(f" -> No se encontró un diseñador válido en la tarea asociada.")
            else:
                print(f" -> El diseñador ya es Jose Diseñador o no se pudo reemplazar.")

    print(f"Proceso finalizado. Total actualizadas: {updated_count}")

if __name__ == '__main__':
    main()
