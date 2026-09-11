# Cuaderno → Empacado / entrega + carriers

## Flujo

1. Extraer páginas del cuaderno → `docs/odoo/cuaderno_batches/YYYY-MM-DD/` (o `scratch/` local).
2. Crear métodos de envío si faltan: `scripts/setup_life_delivery_carriers.py --apply`
   - Interrapidísimo, Envía, Moto, Mensajero, Carro, Terminal (`delivery.carrier`, fixed_price=0).
3. Dry-run: `scripts/apply_cuaderno_batch.py`
4. Tras OK: `--apply` en prod (`lifedeportes.odoo.com` / db `lifedeportes`).

## Contratos

| Caso | Señal | Acción |
|------|-------|--------|
| Empacado | `# orden` (S0####) | `project.task` → etapa Empacado (38 Javier / 39 Paola / 60 Kapso) |
| Entrega | nombre + inter/Envia/Moto/Mensajero/Carro/Terminal | `carrier_id` en OUT + `button_validate` → Hecho (auto 29 / SA 1558) |

No mezclar: empaque ≠ validar albarán (lección 2026-09-03).
