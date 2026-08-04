# Actualizar empleados nómina — checklist

Fuente: `kapso/config/attlog_employee_map.json`  
**Credencial Odoo:** `hr.employee.barcode` (Badge ID) = PIN del reloj.

## Sync

```bash
cd lifedeportes
source .env

python scripts/sync_attlog_employees_odoo.py              # dry-run
python scripts/sync_attlog_employees_odoo.py --apply      # escribe barcode

node kapso/scripts/sync_nomina_employee_codes.js
node kapso/scripts/bundle_parse_nomina_attlog.js
```

## Verificar

1. Odoo → Empleados → **Badge ID** = número del reloj.
2. WA staff: `SUBIR NOMINA` + attlog → nombres con Odoo #.
3. `node kapso/tests/run_parse_nomina_attlog_tests.js`

## Mapa actual (prod 2026-07-21)

| PIN | Nombre | Odoo id |
|-----|--------|---------|
| 4 | Jesus | 12 |
| 5 | Laura Alejandra | 16 |
| 6 | Yesica | 6 |
| 8 | Laura Gomez | 15 |
| 9 | Natalia | 10 |
| 10 | Valentina | 13 |
| 11 | Lorena | 5 |
| 15 | Tatiana | 7 |
| 16 | Milvany | 4 |
