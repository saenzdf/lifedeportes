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
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'spreadsheet_prod_11_snapshot.json'))
    if not os.path.exists(path):
        print(f"Error: No se encuentra el archivo {path}. Ejecuta primero diagnose_prod_spreadsheet.py.")
        return

    with open(path, 'r', encoding='utf-8') as f:
        snapshot = json.load(f)

    print("Actualizando snapshot de producción en memoria...")
    
    # 1. Buscar la hoja de Formulario
    sheets = snapshot.get('sheets', [])
    sheet = None
    for s in sheets:
        if any(w in s.get('name', '').lower() for w in ['formulario', 'aprobaci']):
            sheet = s
            break

    if not sheet:
        print("Error: No se encontró la hoja de Formulario en el snapshot.")
        return

    print(f"Hoja encontrada: '{sheet['name']}'")

    # 2. Configurar celdas de cabecera en fila 1 (C a L)
    cells = sheet.setdefault('cells', {})
    
    headers = {
        'C1': "Nombre en camiseta",
        'D1': "Numero en camiseta",
        'E1': "Talla uniforme",
        'F1': "Cuello",
        'G1': "Largo Manga",
        'H1': "Género",
        'I1': "Deportes",
        'J1': "Otros atributos",
        'K1': "Comentario",
        'L1': "Color medias"
    }

    for addr, val in headers.items():
        cells[addr] = val  # Guardar como string plano para no romper Owl de Odoo

    # Eliminar posibles headers sobrantes de M1 en adelante si existían
    for col in ['M', 'N', 'O', 'P', 'Q']:
        addr = f"{col}1"
        if addr in cells:
            del cells[addr]

    # 3. Limpiar celdas de datos (fila >= 2) de la columna C a la L (y más allá de la M por seguridad)
    import re
    cleaned_count = 0
    for addr in list(cells.keys()):
        m = re.match(r'^([C-Z])(\d+)$', addr)
        if m:
            col, row = m.groups()
            if int(row) >= 2:
                del cells[addr]
                cleaned_count += 1
    print(f"Celdas de datos limpiadas: {cleaned_count}")

    # 4. Estilos de cabecera (E1:L1 = Style 4, eliminar E1:F1 si existe)
    styles = sheet.setdefault('styles', {})
    styles['C1'] = 4
    styles['D1'] = 5
    styles['E1:L1'] = 4
    if 'E1:F1' in styles:
        del styles['E1:F1']
    print("Estilos de cabecera actualizados (E1:L1 = Style 4).")

    # 5. Bordes (B1:L1)
    borders = sheet.setdefault('borders', {})
    if 'B1:F1' in borders:
        borders['B1:L1'] = borders['B1:F1']
        del borders['B1:F1']
    else:
        borders['B1:L1'] = 1
    print("Bordes de cabecera actualizados a B1:L1.")

    # 6. Ancho de columnas (F a L)
    cols = sheet.setdefault('cols', {})
    col_widths = {
        '5': 120, # F
        '6': 120, # G
        '7': 120, # H
        '8': 120, # I
        '9': 150, # J
        '10': 180, # K
        '11': 128  # L
    }
    for col_idx, width in col_widths.items():
        cols[col_idx] = {'size': width}
    print("Anchos de columnas adicionales configurados.")

    # 7. Rango de tabla (A1:L200)
    tables = sheet.setdefault('tables', [])
    if tables:
        tables[0]['range'] = 'A1:L200'
        print(f"Rango de la tabla Table 0 actualizado a: {tables[0]['range']}")

    # 8. Reglas de validación de datos
    validation_rules = sheet.setdefault('dataValidationRules', [])
    for rule in validation_rules:
        ranges = rule.get('ranges', [])
        joined = "|".join(ranges)
        # Talla
        if 'E' in joined:
            rule['ranges'] = ['E2:E']
            rule['criterion']['values'] = ['Pedido!G2:G']
        # Color
        if 'F' in joined or 'L' in joined:
            rule['ranges'] = ['L2:L']
            rule['criterion']['values'] = ['Pedido!H2:H']
    print("Reglas de validación de datos actualizadas (Talla -> E2:E, Color -> L2:L).")

    # Guardar snapshot actualizado localmente
    output_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'spreadsheet_prod_11_updated_snapshot.json'))
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)
    print(f"\nSnapshot actualizado guardado localmente en {output_path}")

    # 9. Codificar y subir a Odoo Producción
    print("\n--- Subiendo cambios a Odoo Producción ---")
    try:
        updated_json_str = json.dumps(snapshot)
        updated_b64 = base64.b64encode(updated_json_str.encode('utf-8')).decode('utf-8')
        
        client = get_prod_client()
        print("Estableciendo conexión XML-RPC...")
        
        success = client.execute_method(
            'sale.order.spreadsheet',
            'write',
            [11],
            {'spreadsheet_snapshot': updated_b64}
        )
        if success:
            print("🚀 ¡Spreadsheet plantilla 11 actualizado exitosamente en producción!")
        else:
            print("❌ La actualización falló en Odoo (retornó False).")
    except Exception as e:
        print(f"❌ Error al subir cambios a Odoo producción: {e}")

if __name__ == '__main__':
    main()
