# Cuaderno batch 2026-09-09

Pipeline: extract notebook pages → Empacado (SO #) / delivery validate (name + carrier).

## Layout

| Path | Role |
|------|------|
| `manifest.json` | Page list |
| `extractions/*.json` | Per-page rows |
| `extracted.json` | Reconciled packing + delivery + review |
| `report.md` | Human summary |
| `build_extracted.py` | Rebuild from transcriptions (or future OCR) |
| `pages/` | Drop RECTIFY JPGs here when available |

## Scripts (repo root)

```bash
# 1) Create delivery methods (Interrapidísimo, Envía, Moto, Mensajero, Carro, Terminal)
python scripts/setup_life_delivery_carriers.py          # dry-run
python scripts/setup_life_delivery_carriers.py --apply

# 2) Match + apply Empacado / validate pickings
python scripts/apply_cuaderno_batch.py                  # dry-run
python scripts/apply_cuaderno_batch.py --apply
```

Requires `.env` with `ODOO_LIFEDEPORTES_PROD_*` (URL `https://lifedeportes.odoo.com`, DB `lifedeportes`).

## Cases

- **Packing** (`packing_rows`): clear `# orden` → move `project.task` to Empacado (38/39/60).
- **Delivery** (`delivery_rows`): name + carrier → set `carrier_id` + `button_validate` OUT → Hecho (SA 1558).
- **Review**: ambiguous / no carrier / duplicate SO — do not auto-apply.
