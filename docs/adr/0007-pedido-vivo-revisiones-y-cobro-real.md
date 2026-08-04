# ADR 0007 — Pedido vivo, revisiones y cobro real

Fecha: 2026-07-16  
Estado: aceptado; fase 1 desplegada en Kapso con Odoo test

## Decisión

El pedido Life no es un documento único que se sobrescribe. Se separa en:

1. **Cantidad comercial**: producto y unidades solicitadas/cotizadas.
2. **Detalle operativo**: personas, nombres, números, tallas, variantes y archivos.
3. **Revisiones**: cambios posteriores con snapshot antes/después.
4. **Cumplimiento real**: producido bueno, rechazado, entregado aceptado e invoiced.

Kapso puede crear un `sale.order` borrador con producto y cantidad aunque la lista no exista. El borrador queda `draft_partial` y marcado **NO CONFIRMAR** hasta cerrar `missing_fields`. Kapso nunca ejecuta `action_confirm`.

## Contrato fase 1

- Schema: `life_order_lifecycle_v1`.
- Estados activos: `draft_partial`, `draft_ready_for_review`, `draft_revisioned`, `confirmed_revisioned`.
- La cantidad comercial explícita no se reemplaza automáticamente por filas del Excel.
- Un descuadre lista↔cantidad es visible y no impide guardar el borrador.
- `confirmation_gate.allowed=true` solo cuando no faltan variables iniciales.
- Cada corrección aceptada crea `life-order-revision-vNNNN.json` como adjunto inmutable del SO.
- El JSON guarda actor, motivo, modo, snapshot antes/después, líneas y fechas; chatter conserva el resumen humano.

## Cobro final

Regla recomendada y aceptada para el diseño:

`cantidad final facturable = entregada y aceptada − previamente facturada`

Producido defectuoso, reproceso o unidades no entregadas no se cobran automáticamente.

## Implementación

- `kapso/functions/lib/staff_order_contract.js`: lifecycle y confrontación de lista pendiente.
- `kapso/functions/compile_staff_order_draft.js`: compila lifecycle.
- `kapso/functions/odoo_create_lead_and_so.js`: marca parcial y bloquea confirmación operativa.
- `kapso/functions/lib/odoo_order_correction.js`: revisión estructurada append-only.
- `kapso/prompts/agent_staff_upload_v9_slim.md`: conversación parcial y revisiones.
- `kapso/vars_contract.md`: contrato persistente.

Deploy Kapso: workflow `lifedeportes_sales_inbound`, lock `1193`; functions sincronizadas con credenciales de Odoo test.

## Pendiente fase 2

- Campos/modelo Studio para cantidades liberadas, producidas buenas, rechazadas, entregadas aceptadas e invoiced.
- Compuertas con IDs estables de etapa y estado MRP/stock, no regex de nombre.
- Panel visual de staff en Kapso Inbox Page.
- Ajuste final de factura idempotente contra entregado aceptado.
- Canary completo sobre un SO test antes de cualquier cambio en producción.
