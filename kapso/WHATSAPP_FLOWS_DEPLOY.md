# Deploy WhatsApp Flows (Life Deportes)

## Artefactos locales

| Archivo | Uso |
|---------|-----|
| [whatsapp_flows/quote_intake_v1.json](whatsapp_flows/quote_intake_v1.json) | Cotización inicial |
| [whatsapp_flows/payment_ack_v1.json](whatsapp_flows/payment_ack_v1.json) | Confirmación de pago |
| [whatsapp_flows/order_details_v1.json](whatsapp_flows/order_details_v1.json) | Detalle post-abono |
| [whatsapp_flows/kapso_flow_registry.json](whatsapp_flows/kapso_flow_registry.json) | IDs Kapso/Meta tras creación |

## Estado actual (2026-04-21)

Los tres flows están en `draft` con `published_at: null`. Lo que ya se hizo:

- JSON v7.3 **sin errores de validación** (labels ≤ 20 chars, helper-text para detalle extra, screen ids alineados con `flow_action_payload.screen` del workflow v2).
- `flows_encryption_configured: true` (setup-encryption ejecutado sobre el phone number).
- Intento de publicar sigue devolviendo `422 Integrity requirements not met` (Meta #139000).

La causa es un bloqueo a nivel Meta WABA/Business Manager que no se resuelve por API. Pasos para desbloquear están en **[META_FLOWS_PUBLISH_BLOCKED.md](META_FLOWS_PUBLISH_BLOCKED.md)**.

## Comandos (skill integrate-whatsapp)

Desde `/Users/diego/.agents/skills/integrate-whatsapp` (con `npm install` y variables `KAPSO_API_BASE_URL` + `KAPSO_API_KEY`):

```bash
node scripts/create-flow.js \
  --phone-number-id 1081649091701994 \
  --name "LD Cotizacion Inicial v1" \
  --flow-json-file "/ruta/a/lifedeportes/kapso/whatsapp_flows/quote_intake_v1.json"
```

Publicar (cuando Meta lo permita):

```bash
node scripts/publish-flow.js --flow-id <kapso_flow_id>
```

Probar envío:

```bash
node scripts/send-test-flow.js --phone-number-id 1081649091701994 --flow-id <kapso_flow_id> --to <E164>
```

## Preview

Cada flow en Kapso expone `preview_url` en la respuesta de creación; también visible en WhatsApp Manager.

## Variables de entorno sugeridas (app / agente)

Ver [.env.example](.env.example) — prefijos `KAPSO_FLOW_*_ID` para enlazar mensajes del agente a flows publicados.
