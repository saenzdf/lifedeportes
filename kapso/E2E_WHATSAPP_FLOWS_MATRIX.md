# Matriz E2E — WhatsApp Flows y Posventa Life Deportes

**Precondición:** `order_details_v1` publicado en Kapso/Meta. Si sigue en `draft`, ejecutar los casos de fallback por texto.

| # | Escenario | Pasos cliente | Resultado esperado | Verificación |
|---|-----------|---------------|--------------------|--------------|
| 1 | Preventa conversacional | Cliente pide precio por chat | Agent pregunta solo faltantes o cotiza con Odoo | `vars.quote.*`, sin enviar `quote_intake` |
| 2 | Cierre Paola | Cliente dice "hagámoslo" | Agent resume pedido, abono 50%, detalles después de validación | Mensaje natural + `vars.quote.draft_payload` |
| 3 | Comprobante recibido | Cliente manda captura/PDF o "ya aboné" | `prepare-payment-review` arma paquete y pasa a humano | `vars.payment.verification_status=pending_human_review` |
| 4 | Posventa Flow | Humano aprueba pago → Agent envía Flow order details | Flow recoge `disciplina`, `color_media`, `lines_detail`, `design_references` | `vars.order_details.completeness` |
| 5 | Fallback texto | Flow bloqueado/draft | Agent pide lista por texto y enruta `parse_text_order` | `normalize-order-details` completa o pide faltantes |
| 6 | Excel | Cliente manda archivo/lista extraída | Filas normalizadas al esquema `life_designer_order_v1` | `vars.order_details.lines[]` |
| 7 | Corrección diseño | Cliente dice "sin la bandera" | Se registra corrección y se escala a diseño | `vars.design.approval_status=corrections_requested` |
| 8 | Aprobación diseño | Cliente escribe `APROBADO` | Se habilita producción | `vars.production_order.ready_for_production=true` |
| 9 | Respuesta ambigua | Cliente responde "ok" o emoji | Agent pide confirmación explícita | `vars.design.approval_status=needs_human_review` |
| 10 | Integridad Meta | Publicar Flow | Publicación OK o error documentado | WhatsApp Manager / API |

## Comandos de soporte

- Listar flows: `node scripts/list-flows.js --phone-number-id <id>` (skill integrate-whatsapp)
- Listar ejecuciones: `node scripts/list-executions.js <workflow_id>` (skill automate-whatsapp)

## Notas

- Fallo conocido al publicar masivo: **Integrity requirements not met** — resolver en Meta Business antes de E2E completo.
- `quote_intake_v1` y `payment_ack_v1` no son parte del flujo principal v4; se conservan como assets historicos.
