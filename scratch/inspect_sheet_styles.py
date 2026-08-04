import json
import os

def main():
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'spreadsheet_75_snapshot.json'))
    if not os.path.exists(path):
        return

    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    styles = data.get('styles', {})
    sheets = data.get('sheets', [])
    for s in sheets:
        name = s.get('name')
        if any(w in name.lower() for w in ['formulario', 'aprobaci']):
            print(f"Sheet Name: {name}")
            print("Styles mapping in sheet:")
            sheet_styles = s.get('styles', {})
            for rng, style_id in sheet_styles.items():
                style_val = styles.get(str(style_id), {})
                print(f"  Range '{rng}': Style ID {style_id} -> {style_val}")
            
            print("\nBorders mapping in sheet:")
            sheet_borders = s.get('borders', {})
            for rng, border_val in sheet_borders.items():
                print(f"  Range '{rng}': {border_val}")
            
            print("\nCols configuration:")
            sheet_cols = s.get('cols', {})
            for col_idx, col_val in sheet_cols.items():
                print(f"  Col {col_idx}: {col_val}")

            print("\nRows configuration:")
            sheet_rows = s.get('rows', {})
            for row_idx, row_val in sheet_rows.items():
                print(f"  Row {row_idx}: {row_val}")

if __name__ == '__main__':
    main()
