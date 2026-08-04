# Functions Kapso — prune completado (2026-06-29)

Se comparó el grafo vivo `lifedeportes_sales_inbound` (lock 709) contra `/platform/v1/functions`.

**Antes:** 31 deploys · **Después:** 17 (solo los referenciados en el grafo).

Script reproducible: `kapso/scripts/prune_orphan_functions.js` (`--apply` para borrar).

## Eliminadas en plataforma (14)

| function_id | kapso_function_name | Motivo |
|-------------|---------------------|--------|
| `e38655eb-e592-4fe5-9a79-a4197c7ac938` | resolve-tenant-context | Multi-tenant obsoleto |
| `f2ac594d-4d23-4daa-a1a4-6cd7c00f20d5` | media-intake-dispatcher | Reemplazado ask_about_file |
| `e6a3755b-a139-4f60-baef-791618150836` | normalize-order-details | Flow order_details deprecado |
| `97e97446-1981-4c45-b609-d6d8a294469e` | design-approval-gate | Funnel diseño viejo |
| `55b0fdf4-44d2-4226-a57d-dc916c8a145f` | prepare-payment-review | Funnel pago viejo |
| `d9cb765a-8801-45da-a21e-62406fc9b2b8` | get-customer-orders-scoped-odoo | Consolidado en get-customer-card-scoped-odoo |
| `03009eb7-9fce-492d-b798-047baf612f28` | get-order-status-odoo | Consolidado en get-customer-card-scoped-odoo |
| `c54be92f-112c-40a5-943c-ab5f280f7802` | get-order-timeline-odoo | Consolidado en get-customer-card-scoped-odoo |
| `abf33408-af21-406b-80d9-baa4009b9db6` | compose-price-cop | Agente redacta precios |
| `38174c2c-a92a-4921-b9dc-03204dc807c1` | normalize-input | Reemplazado por agente + classify |
| `0bd3ece8-a5aa-4d04-aa3f-226dd69cf0cf` | detect-quote-activation | Grafo orquestador v3 |
| `216122cd-98a3-414d-b265-66c81d7d7d05` | emit-quote-signal | Nunca cableado |
| `0ba79a76-3fed-4f7e-bf6c-fd6de0cf05c0` | route-intent-next | Removido carril cliente (re-trigger) |
| `364a6de9-df3d-4c57-a214-77c1ce0a9441` | route-staff-post | Sin nodo en grafo vivo v8 |

Código local archivado en `kapso/functions/_archive/`.

## Conservar / no estaban deployadas

- `2fb9ca35-…` y `d889689a-…` — **activas** en grafo (card + design-references).
- `print-qc-webhook-odoo` — no aparecía en el listado Kapso; si se vuelve a desplegar para Odoo Studio, no forma parte del inbound WhatsApp.
- `get-payment-assets`, `odoo-get-quote-pdf` — nunca tuvieron deploy con ID en este proyecto.

```bash
export KAPSO_API_BASE_URL=https://api.kapso.ai
node kapso/scripts/prune_orphan_functions.js          # dry-run
node kapso/scripts/prune_orphan_functions.js --apply  # borrar huérfanas
```
