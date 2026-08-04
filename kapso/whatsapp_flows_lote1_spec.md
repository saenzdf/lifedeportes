# WhatsApp Flows — Lote 1 (Life Deportes)

Flujos priorizados: **quote_intake**, **payment_ack**, **order_details**.

Principios:

- No mostrar números de pedidos históricos al cliente en estos formularios.
- Cotización “desde” en chat; **Flow** recoge datos estructurados para Odoo/workflow.
- Validación mínima en pantalla; reglas de negocio finas en workflow/backend.

---

## 1. `quote_intake` — Cotización inicial estructurada

**Objetivo:** capturar deporte, tipo de producto, cantidad aproximada y notas sin sustituir la conversación comercial.

| Campo | Tipo sugerido | Obligatorio | Validación |
|-------|----------------|-------------|------------|
| `sport` | TextInput o Dropdown corto | Sí | Mín. 2 caracteres |
| `product_family` | Dropdown: Camiseta / Uniforme completo / Conjunto / Otro | Sí | Enum fijo |
| `quantity_estimate` | Number | Sí | Entero 1–500 |
| `notes` | TextArea | No | Máx. 500 chars |

**Pantallas:** 1 pantalla terminal (`terminal: true`) o 2 si se separa bienvenida + datos.

**Payload hacia Kapso/Odoo:** `vars.flow.quote_intake = { sport, product_family, quantity_estimate, notes }`.

---

## 2. `payment_ack` — Confirmación de pago

**Objetivo:** registrar intención de pago (abono) con referencia y monto, sin exponer SO antigua.

| Campo | Tipo sugerido | Obligatorio | Validación |
|-------|----------------|-------------|------------|
| `amount_cop` | Number | Sí | > 0, entero |
| `payment_reference` | TextInput | Sí | Alfanum., ej. últimos dígitos / ref banco |
| `payment_method` | Dropdown: Transferencia / Nequi / Otro | Sí | Enum |
| `notes` | TextArea | No | Opcional |

**Payload:** `vars.flow.payment_ack = { amount_cop, payment_reference, payment_method, notes }`.

---

## 3. `order_details` — Detalle post-abono (tallas / nombres / números)

**Objetivo:** lista estructurada **después** del abono; puede ser una sola pantalla con texto largo o repetición por cantidad (según límites Meta).

**Opción A (simple):** un campo de texto largo con formato guiado:

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `lines_detail` | TextArea | Sí |

Placeholder sugerido: `Ej: Juan-M-10, Pedro-L-5, ...`

**Opción B (estructurada, más pantallas):** repetir bloque nombre + talla + número para N líneas (N acotado, ej. 1–15).

**Payload:** `vars.flow.order_details = { lines: [...] }` o texto crudo para parseo en función.

---

## Reglas transversas

- **Seguridad:** no incluir API keys ni tokens en el JSON del Flow.
- **Post-proceso:** workflow Kapso recibe `flow_events` / respuesta de Flow y llama Odoo MCP con firewall.
- **Alineación agente:** el chat sugiere abrir el Flow cuando el cliente está en el momento adecuado (ver `prompts/sales_agent_v2.md` y variables `KAPSO_FLOW_*`).
