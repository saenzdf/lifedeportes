# ENVIAR RETOMAR — template WhatsApp al cliente

Template Meta **APPROVED**: `retomar_pedido_v2` · idioma `es`  
Texto: *Hola, te escribimos para confirmar o retomar su pedido.*  
Function/tool: `enviar_retomar_pedido` · WABA id `1381646390243187`

## Cuándo usarlo

Fuera de la **ventana 24h** de WhatsApp (cliente no escribió hace >24h, o falló un document/texto libre). Dentro de ventana conviene mensaje normal o `ENVIAR EXCEL DETALLE`.

## Desde Kapso (staff)

1. WhatsApp staff → Kapso.
2. Si falta teléfono: `buscar_oportunidad_odoo` (nombre del cliente).
3. Escribir: **`ENVIAR RETOMAR`** o «manda retoma a Emmanuelle» / «ENVIAR RETOMAR 57300…».
4. Tool `enviar_retomar_pedido` con `customer_phone`.
5. Ack: “Template enviado a …”. Cuando el cliente responda, se reabre la ventana 24h.

## Manual (sin agente)

### A) Script del repo

```bash
cd projects/lifedeportes
set -a && source .env && set +a

# Payload — cambia "to"
cat > /tmp/retomar_payload.json <<'EOF'
{
  "messaging_product": "whatsapp",
  "to": "573001234567",
  "type": "template",
  "template": {
    "name": "retomar_pedido_v2",
    "language": { "code": "es" }
  }
}
EOF

node .agents/skills/integrate-whatsapp/scripts/send-template.mjs \
  --phone-number-id 1095603153637786 \
  --file /tmp/retomar_payload.json
```

### B) curl (Kapso Meta proxy)

```bash
curl -sS -X POST \
  "https://api.kapso.ai/meta/whatsapp/v24.0/1095603153637786/messages" \
  -H "X-API-Key: $KAPSO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "573001234567",
    "type": "template",
    "template": {
      "name": "retomar_pedido_v2",
      "language": { "code": "es" }
    }
  }'
```

### C) Meta Business Suite / WhatsApp Manager

1. [business.facebook.com](https://business.facebook.com) → WhatsApp Manager del WABA Life.
2. Mensajes / plantillas → `retomar_pedido_v2`.
3. Enviar a un contacto de prueba (o desde inbox si tu UI lo permite).

Número Life: **+57 322 2252942** · `phone_number_id` `1095603153637786`.

## Deploy

```bash
node kapso/scripts/deploy_enviar_retomar_pedido.js
node kapso/scripts/embed_agent_knowledge.js
# publish grafo: kapso/scripts/deploy_graph_kb_progressive.sh
```
