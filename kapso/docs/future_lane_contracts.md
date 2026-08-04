# Contratos de carriles posteriores

Ventas y pedidos staff comparten entrada y observabilidad, pero cada dominio mantiene schema, tools, permisos y retención propios.

## Cotización formal PDF

Estado: siguiente fase.

Entrada:

- `sale_order_id` de un SO borrador ya validado;
- revisión humana completa (`needs_review=false` o aprobación explícita);
- partner y líneas comerciales presentes.

Tool permitida: `get_quote_pdf(sale_order_id)`.

La Function obtiene `sale.report_saleorder` de Odoo. El agente no compone precios, no edita líneas para generar el PDF y no confirma el SO. Si el borrador requiere revisión, devuelve `blocked: draft_needs_review`.

## Compras

Estado: **activo en Agent Staff** vía tool `crear_compra_odoo` (PO draft).

Contrato `purchase_draft_v1`:

- tools en el mismo Agent Staff (no agente aparte);
- aprobación humana `CONFIRMO COMPRA` antes de escritura;
- sin reutilizar `OrderDraft` ni matcher comercial de ventas;
- idempotencia por `origin` en `purchase.order`.

Prohibido: confirmar PO, recibir inventario, crear factura o pago.

## Nómina

Estado: **activo en Agent Staff** (attlog → cola `NOM-…`). PIN = `hr.employee.barcode`.

Requisitos antes de evolucionar a HR:

- schema `payroll_intake_v1` / attendance write;
- aprobación humana (ya: CONFIRMO NOMINA);
- datos laborales fuera del corpus comercial.

## Matriz de aislamiento

| Carril | Schema | Escritura permitida | Aprobación | Memoria/KB |
|---|---|---|---|---|
| Ventas/pedido | `life_order_people_v1` | `sale.order` draft / CRM | staff | comercial |
| PDF | referencia a SO | ninguna | SO revisado | ninguna nueva |
| Compras | `purchase_draft_v1` | PO draft | CONFIRMO COMPRA | compras |
| Nómina | attlog draft | cola `NOM-…` | CONFIRMO NOMINA | nómina |

No se transfieren variables, adjuntos ni tools entre carriles salvo un identificador explícito y no sensible.
