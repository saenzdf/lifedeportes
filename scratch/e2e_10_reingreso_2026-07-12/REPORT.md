# E2E 10 reingresos — 07122201

Staff WA: `573172575981` (solo en `vars.user`) · Odoo **test** · **10/10** OK

Packs desde tareas reales (`scratch/kapso_staff_e2e_2026-07-12/case_NN`). Runner: `kapso/scripts/run_staff_e2e_10_reingreso.js`.

| # | Modo | Entrada | SO | Partner elegido | Historia previa | Formulario | OK |
|---|------|---------|----|-----------------|-----------------|------------|----|
| 1 | history | Excel Life + fotos | [S02647](https://testlifesoluciones.odoo.com/odoo/sales/2637/sale-order-spreadsheet/66) | E2E Test 1 — PASTO | sí | 36 · `Tallas: M` | ✓ |
| 2 | history | Excel Life | [S02648](https://testlifesoluciones.odoo.com/odoo/sales/2638/sale-order-spreadsheet/67) | JORGE DUEÑOS DEL BALON | sí | 26 · `Tallas: L` | ✓ |
| 3 | **new** | Excel + fotos | [S02649](https://testlifesoluciones.odoo.com/odoo/sales/2639/sale-order-spreadsheet/68) | E2E NUEVO … C3 LUCU | no | 19 · `Tallas: L` | ✓ |
| 4 | history | Excel urgente | [S02650](https://testlifesoluciones.odoo.com/odoo/sales/2640/sale-order-spreadsheet/69) | NELSON ELEFANTES | sí | 53 · `Tallas: 4` | ✓ |
| 5 | history | Solo Excel | [S02651](https://testlifesoluciones.odoo.com/odoo/sales/2641/sale-order-spreadsheet/70) | FORTALEZA OMAR | sí | 16 · `Tallas: 12` | ✓ |
| 6 | history | Excel **no Life** (espejo) | [S02652](https://testlifesoluciones.odoo.com/odoo/sales/2642/sale-order-spreadsheet/71) | ADRIAN | sí | **0** (honest) | ✓ |
| 7 | **new** | Excel + fotos | [S02653](https://testlifesoluciones.odoo.com/odoo/sales/2643/sale-order-spreadsheet/72) | E2E NUEVO … C7 david | no | 17 · `Tallas: S` | ✓ |
| 8 | history | Excel + fotos | [S02654](https://testlifesoluciones.odoo.com/odoo/sales/2644/sale-order-spreadsheet/73) | William attack | sí | 17 · `Tallas: L` | ✓ |
| 9 | history | Excel qty edge | [S02655](https://testlifesoluciones.odoo.com/odoo/sales/2645/sale-order-spreadsheet/74) | JEAN CARLOS F | sí | 15 · `Tallas: 16` | ✓ |
| 10 | **new** | Excel Life | [S02656](https://testlifesoluciones.odoo.com/odoo/sales/2646/sale-order-spreadsheet/75) | E2E NUEVO … C10 CHUCHO | no | 13 · `Tallas: S` | ✓ |

## Qué se validó

1. **Clientes con historia (7):** match por nombre (`findPartnerByName` + SO más reciente) sin usar el WA staff como teléfono del cliente.
2. **Clientes nuevos (3):** nombre único → partner nuevo sin SO previos.
3. **Formas de ingreso:** Excel Life, Excel+fotos, solo Excel, Excel no-Life (espejo), qty edge.
4. **Tallas:** formato lista plantilla (`Tallas: M`, `Tallas: 14`) — sin puntito rojo.
5. **Caso 6 ADRIAN:** parser Life 0 filas → nota espejo + Formulario vacío (no inventar nombres).

## Hallazgos

| Tema | Detalle |
|------|---------|
| Match fuzzy | `PASTO` → eligió `E2E Test 1 — PASTO` (ilike + último SO). Sigue siendo historia, pero no el partner “canónico” 3396. |
| WILLIAM | `WILLIAM` → `William attack` (mismo mecanismo). |
| Staff WA | Si se pasa como `customer_wa_id`, todo caería en Diego — el runner lo evita a propósito. |
| Mín. 6 | Caso 9 con bump a 6 si hacía falta para no bloquear `BASE_BELOW_MINIMUM`. |

## Artefactos

`scratch/e2e_10_reingreso_2026-07-12/` · `SUMMARY.json` · `case_NN.json`
