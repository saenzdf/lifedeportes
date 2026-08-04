import json
import os

def main():
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'spreadsheet_75_snapshot.json'))
    if not os.path.exists(path):
        return

    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    sheets = data.get('sheets', [])
    for s in sheets:
        name = s.get('name')
        if any(w in name.lower() for w in ['formulario', 'aprobaci']):
            print(f"Sheet Name: {name}")
            # Mostramos claves principales de la hoja
            for k in s.keys():
                if k != 'cells':
                    val = s[k]
                    # Si es muy grande, resumir
                    if isinstance(val, list):
                        print(f"  {k} (list with {len(val)} items)")
                    elif isinstance(val, dict):
                        print(f"  {k} (dict with {len(val)} keys): {list(val.keys())[:10]}")
                    else:
                        print(f"  {k}: {val}")

if __name__ == '__main__':
    main()
