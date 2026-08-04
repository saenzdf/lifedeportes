# Lista de pedido: staff = fuente de verdad

Fecha: 2026-07-27

## Dónde vive la lista

| Lugar | Rol |
|-------|-----|
| `project.task.description` | **Fuente de verdad** — staff edita aquí; Kapso lee y coordina el pedido |
| `sale.order.note` | Espejo en presupuesto **si el SO existe** (PDF / borrador) |
| `crm.lead.description` | Solo brief comercial — **nunca** la lista organizada ni el teléfono |

Al crear la tarea (SA **1539**): si el SO tiene `note`, se copia **siempre** a la descripción de la tarea.

## Flujo Kapso cuando staff cambia la lista

1. Staff edita `project.task.description` (o pide por WA staff “corregir S0… según la descripción”).
2. Tool `sync_order_draft_from_odoo` / `corregir_pedido_odoo` lee **primero** la description de la tarea (`resolveListaHtmlFromBundle`).
3. Parsea filas (`parseDetailRowsFromNoteHtml`) y aplica cambios al pedido (note espejo + líneas si cambia el mix).
4. Vuelve a escribir lista en **tarea** (obligatorio) y **SO.note** (si hay presupuesto).

Contrato código: `kapso/functions/lib/odoo_order_correction.js` (`resolveListaHtmlFromBundle`), `sync_order_draft_from_odoo.js` (`lista_source`).

## Pipeline CRM (prod)

| Seq | Etapa | id | Uso |
|-----|-------|----|-----|
| 0 | **Asistente Kapso** | 6 | Seed Kapso / interés WA |
| 1 | **Canal Ventas** | 1 | Seguimiento humano |
| 2 | Proposition | 3 | Crea SO + webhook (SA 1549) |
| 3 | Pasa a diseño | 4 | Won / producción |
| 4 | Perdida | 5 | Lost |

## Retomar opp manual desde Kapso staff

Tool `buscar_oportunidad_odoo` → `vars.lead.id` → parse/adjuntos → `complete_task` (reusa CRM) → HAZ PRESUPUESTO. KB: `life_retomar_oportunidad_crm_v1.md`.
