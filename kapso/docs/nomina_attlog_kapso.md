# Nómina desde attlog.dat (ZKTeco) — Kapso

**Quién sube:** staff allowlist vía WhatsApp Life / Jump al Agent Staff  
**Salida:** `vars.nomina` en cola (`NOM-…`); sin escritura HR aún  
**Credencial Odoo:** PIN del archivo = `hr.employee.barcode` (Badge ID)

## Flujo (Agent Staff unificado)

```
SUBIR NOMINA + attlog.dat
  → parse_nomina_attlog
  → resumen WhatsApp (nombres + Odoo #)
  → CONFIRMO NOMINA
  → confirmar_nomina → NOM-XXXX queued
  → enter_waiting
( fase 2 ) hr.attendance / payslip
```

## Catálogo

`kapso/config/attlog_employee_map.json` — regenerar códigos:

```bash
node kapso/scripts/sync_nomina_employee_codes.js
python scripts/sync_attlog_employees_odoo.py          # dry-run barcode
```

## Deploy

```bash
bash kapso/scripts/deploy_unified_staff.sh
```

## Próximos pasos

- [ ] Fase 2: `hr.attendance` al confirmar
- [ ] Alertas jornada (mínimo horas, almuerzo)
