import os
import sys
import json
import base64

# Agregar el directorio raíz al path para poder importar odoo_connector
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from odoo_connector import get_client

def main():
    print("Iniciando diagnóstico del spreadsheet 75 (bypass firewall)...")
    try:
        client = get_client()
    except Exception as e:
        print(f"Error al inicializar cliente Odoo: {e}")
        return

    try:
        # Consultamos el registro por XML-RPC directo
        print("Consultando registro 75 de 'sale.order.spreadsheet'...")
        records = client.execute_method(
            'sale.order.spreadsheet', 
            'search_read', 
            [['id', '=', 75]], 
            ['id', 'name', 'spreadsheet_snapshot', 'order_id']
        )
    except Exception as e:
        print(f"Error en execute_method de Odoo: {e}")
        return

    if not records:
        print("No se encontró el spreadsheet con ID 75.")
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
    output_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'spreadsheet_75_snapshot.json'))
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)
    print(f"Snapshot guardado en {output_path}")

    # Mostrar hojas y celdas
    sheets = snapshot.get('sheets', [])
    print(f"Hojas en el spreadsheet ({len(sheets)}):")
    for s in sheets:
        name = s.get('name')
        cells = s.get('cells', {})
        print(f"  - {name} ({len(cells)} celdas)")
        
        # Si es la hoja de formulario o aprobación, mostrar los headers y primeras filas
        if any(w in name.lower() for w in ['formulario', 'aprobaci']):
            print("    Detalles de celdas de Formulario/Aprobación:")
            # Mostrar la primera fila (headers)
            headers = {}
            for col in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']:
                cell_key = f"{col}1"
                if cell_key in cells:
                    val = cells[cell_key]
                    content = val.get('content') if isinstance(val, dict) else val
                    headers[col] = content
            print(f"    Headers (Fila 1): {headers}")

            # Mostrar algunas filas de datos
            print("    Primeras 5 filas de datos:")
            for r in range(2, 8):
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
