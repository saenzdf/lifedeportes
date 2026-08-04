# Clientes Odoo — teléfonos duplicados

**Estado:** deduplicación aplicada **2026-07-06** — **0 grupos pendientes**.

## Qué se hizo

| Acción | Cantidad |
|--------|----------|
| Fusionados (wizard Odoo) | **71** grupos |
| Ya fusionado (prueba GUARUMO) | 1 |
| Teléfono quitado en duplicado (sin merge) | 1 — Admin / Sebastián (`+573172273627`) |

Log detallado: `scratch/deduplicate_partner_phones_log.json`

## Regenerar auditoría

```bash
cd lifedeportes && source .env
python scripts/export_odoo_duplicate_phones.py
```

## Si aparecen nuevos duplicados

```bash
# Preview
python scripts/deduplicate_odoo_partner_phones.py

# Fusionar (mantiene partner con más pedidos / SO más reciente)
python scripts/deduplicate_odoo_partner_phones.py --apply

# Caso especial: contactos con usuario Odoo vinculado (no se pueden fusionar)
python scripts/deduplicate_odoo_partner_phones.py --archive-fallback --apply --phone +57... --master-id ID_MAESTRO
```

El classify Kapso busca solo contactos **activos** (`active=true`).
