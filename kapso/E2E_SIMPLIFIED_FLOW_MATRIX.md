# E2E Matrix - Simplified Sales Flow

## Scope
- New customer, existing customer, stakeholder.
- Strict human validation before payment commitment.
- Payment docs and invoice policy only on explicit request.

## Test Cases

| ID | Scenario | Input | Expected agent behavior | Expected vars/tools | Human checkpoint |
|---|---|---|---|---|---|
| SF-01 | New customer intro | "Hola, quiero uniformes" from unknown phone | Explains sales flow briefly and requests minimum quote data | `vars.user.contact_segment=new_customer` from `classify_contact_odoo` | No |
| SF-02 | Existing customer no old reference | known phone + "cotizame otro pedido" | Goes directly to new quote flow | `vars.user.contact_segment=existing_customer` | No |
| SF-03 | Existing customer with old reference | known phone + "quiero como el pedido anterior" | Fetches status/history and references old order before quoting | `consultar_estado_pedido_odoo` and/or `consultar_timeline_pedido_odoo` | No |
| SF-04 | Stakeholder route | phone in whitelist | Uses internal assistant tone/path, avoids external sales script | `vars.user.contact_segment=stakeholder` | No |
| SF-05 | Simple quote path | product + qty + variant | Creates quote in Odoo and shares total | `buscar_producto_odoo`, `construir_payload_pedido`, `activar_cotizacion_odoo` | No |
| SF-06 | Total + projected date + pending validation | customer ready to proceed | Shares total, asks projected date, states pending internal validation | `vars.order.amount_total`, `vars.order.initial_payment_amount` | Yes (required before pay request) |
| SF-07 | Formal quote request | "enviame documento/cotizacion formal" | Sends native Odoo PDF link | `obtener_pdf_cotizacion_odoo`, `vars.quote.pdf_url` | No |
| SF-08 | Payment info request | "pasame cuentas/RUT/certificacion" | Sends payment assets only when asked | `obtener_documentos_pago(request_type=payment_info)` | No |
| SF-09 | No-invoice policy question | "y si no requiero factura?" | Sends policy response only when asked | `obtener_documentos_pago(request_type=invoice_policy)` | No |
| SF-10 | Payment proof received | image/pdf/audio of transfer | Acknowledges, does not approve payment, routes to human review | `prepare_payment_review`, `vars.intent_next=payment_human_review` | Yes |
| SF-11 | Handoff status mode | customer asks "como va mi pedido?" during handoff | Responds with Odoo order/task status only | `consultar_estado_pedido_odoo`, `consultar_timeline_pedido_odoo` | No |
| SF-12 | Missing design details | after human confirmation, no sizes/names yet | Starts capture flow (chat, flow, or excel/json) and stores references | `normalizar_detalles_pedido`, `invocar_media_intake` | No |

## Exit Criteria
- 12/12 scenarios pass in staging with no critical errors.
- No message requests payment commitment before human validation.
- Payment assets and invoice policy messages are only emitted on explicit request.
- Existing customer flow can reference old orders without blocking a new quote.
