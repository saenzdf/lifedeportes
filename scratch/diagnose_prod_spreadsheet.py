import os
import sys
import json
import base64

# Agregar el directorio raíz al path para poder importar odoo_connector
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from odoo_connector import OdooClient

def get_prod_client():
    url = os.getenv("ODOO_LIFEDEPORTES_PROD_URL")
    db = os.getenv("ODOO_LIFEDEPORTES_PROD_DB")
    username = os.getenv("ODOO_LIFEDEPORTES_PROD_USERNAME")
    password = os.getenv("ODOO_LIFEDEPORTES_PROD_PASSWORD")
    
    if not all([url, db, username, password]):
        raise ValueError("Faltan variables de entorno ODOO_LIFEDEPORTES_PROD_* en .env")
        
    return OdooClient(url, db, username, password)

def main():
    print("Iniciando conexión a producción...")
    try:
        client = get_prod_client()
    except Exception as e:
        print(f"Error al inicializar cliente Odoo de Producción: {e}")
        return

    try:
        print("Consultando spreadsheet 11 de producción...")
        records = client.execute_method(
            'sale.order.spreadsheet', 
            'search_read', 
            [['id', '=', 11]], 
            ['id', 'name', 'spreadsheet_snapshot', 'order_id']
        )
    except Exception as e:
        print(f"Error en execute_method de Odoo Prod: {e}")
        return

    if not records:
        print("No se encontró el spreadsheet con ID 11 en producción.")
        return

    record = records[0]
    print(f"Spreadsheet ID: {record['id']}")
    print(f"Name: {record['name']}")
    print(f"Order ID: {record['order_id']}")

    snapshot_b64 = record.get('spreadsheet_snapshot')
    if not snapshot_b64:
        print("El spreadsheet_snapshot está vacío.")
        return

    # Decodificar snapshot
    try:
        raw_json = base64.b64decode(snapshot_b64).decode('utf-8')
        snapshot = json.loads(raw_json)
        print("Snapshot decodificado exitosamente.")
    except Exception as e:
        print(f"Error al decodificar el snapshot: {e}")
        return

    # Escribir el snapshot a un archivo para inspección detallada
    output_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'spreadsheet_prod_11_snapshot.json'))
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)
    print(f"Snapshot guardado en {output_path}")

    # Mostrar hojas y celdas
    sheets = snapshot.get('sheets', [])
    print(f"Hojas en el spreadsheet de producción ({len(sheets)}):")
    for s in sheets:
        name = s.get('name')
        cells = s.get('cells', {})
        print(f"  - {name} ({len(cells)} celdas)")
        
        if any(w in name.lower() for w in ['formulario', 'aprobaci']):
            print("    Headers y primeras filas:")
            headers = {}
            for col in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']:
                cell_key = f"{col}1"
                if cell_key in cells:
                    val = cells[cell_key]
                    content = val.get('content') if isinstance(val, dict) else val
                    headers[col] = content
            print(f"    Headers (Fila 1): {headers}")

            for r in range(2, 5):
                row_data = {}
                for col in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']:
                    cell_key = f"{col}{r}"
                    if cell_key in cells:
                        val = cells[cell_key]
                        content = val.get('content') if isinstance(val, dict) else val
                        row_data[col] = content
                if row_data:
                    print(f"      Fila {r}: {row_data}")

if __name__ == "__main__":
    main()
