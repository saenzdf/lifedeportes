import json
import os

def main():
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'spreadsheet_prod_11_snapshot.json'))
    if not os.path.exists(path):
        return

    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    sheets = data.get('sheets', [])
    for s in sheets:
        name = s.get('name')
        if any(w in name.lower() for w in ['formulario', 'aprobaci']):
            print(f"Sheet Name: {name}")
            print("\ndataValidationRules:")
            rules = s.get('dataValidationRules', [])
            for i, r in enumerate(rules):
                print(f"  Rule {i}: ranges={r.get('ranges')}, criterion={r.get('criterion')}")
            
            print("\ntables:")
            tables = s.get('tables', [])
            for i, t in enumerate(tables):
                print(f"  Table {i}: range={t.get('range')}")
            
            print("\nstyles:")
            styles = s.get('styles', {})
            for k, v in styles.items():
                print(f"  {k}: {v}")

if __name__ == '__main__':
    main()
