# Escenarios de prueba — primera conexión upload staff

Workflow: `lifedeportes_sales_inbound` (`8995b14c-d852-4fb3-bceb-8a51a6ccc2c6`)
Graph v2: `workflow_lifedeportes_sales_inbound_v2_upload.json` (lock 505+)

## Checks automatizados (invoke-function)

| ID | Caso | Resultado esperado |
|----|------|-------------------|
| T-route | staff + `SUBIR PEDIDO` → detect-staff-upload-command | `staff_route: staff_upload_odoo` |
| T-build | vars.quote + staff role + context.phone cliente | `draft_payload.customer_wa_id` = teléfono cliente |
| T-build-manual | staff + quote.customer_wa_id explícito | `customer_wa_id` del campo quote |

## Manual — Entrada A (WhatsApp staff directo)

1. Desde teléfono allowlist (Diego `573172575981` u otro staff).
2. Enviar: `SUBIR PEDIDO`
3. Agente staff pregunta teléfono cliente, nombre, producto, cantidad (≥6 uniformes).
4. Responder datos + `confirmo subida`
5. Verificar mensaje con `Pedido SO...` y SO en Odoo.

**Debug:** `get-context-value.js <exec-id> --variable-path vars.order.name`

## Manual — Entrada B (Kapso Inbox)

1. Cliente escribe al bot (no staff): pedir cotización 10 uniformes fútbol.
2. Orquestador responde y acumula contexto.
3. Staff abre Kapso Inbox → mismo hilo → envía `SUBIR PEDIDO`.
4. Agente staff resume datos del hilo, pide solo faltantes, confirmar.
5. SO en Odoo con partner = teléfono del **cliente** (no staff).

## Error comercial

- Staff intenta 4 uniformes → build u odoo rechaza (min 6).

## Comandos debug

```bash
export KAPSO_API_BASE_URL=https://api.kapso.ai
cd ~/.agents/skills/automate-whatsapp
node scripts/list-executions.js 8995b14c-d852-4fb3-bceb-8a51a6ccc2c6
node scripts/get-execution.js <id>
node scripts/get-context-value.js <id> --variable-path vars.staff_route
node scripts/get-context-value.js <id> --variable-path vars.quote.draft_payload
node scripts/get-context-value.js <id> --variable-path vars.order.name
```
