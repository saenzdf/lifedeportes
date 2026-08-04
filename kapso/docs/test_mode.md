# Kapso test mode — public WhatsApp inbound off

## Estado (2026-06-17)

| Recurso | ID | Estado |
|---------|-----|--------|
| Workflow `lifedeportes_sales_inbound` | `8995b14c-d852-4fb3-bceb-8a51a6ccc2c6` | **active** (sin cambios) |
| Trigger `inbound_message` — WhatsApp: Life Deportes Asistente | `581c292e-7abd-4bfe-97a7-159cb3a33f95` | **active: true** (pruebas staff; carril cliente en pausa) |

## Qué implica

- **Mensajes entrantes reales** al 3000000066 (`phone_number_id` `1095603153637786`) **sí** arrancan el workflow con el trigger activo. Con **modo solo staff**, clientes reciben mensaje de mantenimiento; allowlist staff usa el agente de ingreso.
- **Pruebas en Kapso** (ejecución manual / test run desde el editor del workflow en la plataforma) **siguen funcionando**: el graph y las functions permanecen publicados; solo se corta el enlace webhook → trigger automático.
- **Modo solo staff** (2026-06-29): con `node kapso/scripts/staff_only_mode.js enable`, el carril cliente responde mensaje de mantenimiento; solo allowlist staff usa agentes internos. Ver `kapso/docs/staff_only_mode.md`.

## Re-activar tráfico público

```bash
export KAPSO_API_BASE_URL=https://api.kapso.ai
node ~/.agents/skills/automate-whatsapp/scripts/update-trigger.js \
  --trigger-id 581c292e-7abd-4bfe-97a7-159cb3a33f95 \
  --active true
```

Actualizar `kapso/service_registry.json`: `trigger_active: true` y quitar o actualizar `trigger_disabled_note`.

## Verificación

```bash
export KAPSO_API_BASE_URL=https://api.kapso.ai
node ~/.agents/skills/automate-whatsapp/scripts/list-triggers.js 8995b14c-d852-4fb3-bceb-8a51a6ccc2c6
node ~/.agents/skills/automate-whatsapp/scripts/get-workflow.js 8995b14c-d852-4fb3-bceb-8a51a6ccc2c6
```

