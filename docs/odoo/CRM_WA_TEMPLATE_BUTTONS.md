# Botones CRM → WhatsApp templates (Kapso)

Fecha: 2026-07-29  
Instancia: **prod** `lifedeportes.odoo.com`  
Modelo: `crm.lead` (oportunidad)  
Trigger: **manual** (Server Action + binding formulario/lista)

## Qué hace

| Acción en Odoo (menú Acción) | SA id (prod) | Template Meta | Estado |
|------------------------------|--------------|---------------|--------|
| **WA: Enviar retoma (template)** | **1553** | `retomar_pedido_v2` | **OK** — reabre ventana 24h / retomar pedido |
| **WA: Enviar abono 50% (cuentas)** | **1554** | `abono_50_cuentas` | **OK** — datos de pago 50% |
| **WA: Nueva información de pedido** | **1590** | `nueva_info_pedido` | **OK** en Kapso function `8044ad1b…` (UTILITY). El SA Odoo aún resuelve solo `lead.phone` / `partner.phone` — **no** BSUID |

Teléfono: `lead.phone` → si falta, `partner.phone` (Odoo 19 Life: sin `partner.mobile`). Normaliza a `57…`.  
Kapso `odoo-send-wa-template` (deploy) también acepta **BSUID** / `conversation_id` en el payload, pero los botones Odoo **1553/1554/1590** hoy solo mandan E.164: sin teléfono en la opp el botón falla.  
Tras OK: nota en chatter de la oportunidad.

**Uso staff (retoma desde CRM):** Acción → **WA: Enviar retoma** en la oportunidad → el cliente recibe el template → al responder, ventana 24h abierta para seguir el pedido.

## Flujo técnico

```
crm.lead (botón)
  → ir.actions.server Execute Code (requests.post)
  → Kapso odoo-send-wa-template (public invoke + X-Life-Webhook-Secret)
  → Meta WhatsApp Cloud API (template)
```

Params Odoo:

- `life.kapso.wa_template_webhook_url`
- `life.kapso.wa_template_webhook_secret`

Function Kapso: `odoo-send-wa-template` (`public_endpoint=true`).

## Cómo usar (staff)

1. Abrir la **oportunidad** (con teléfono en opp o partner).
2. Menú **Acción** (engranaje) → **WA: Enviar retoma (template)** o **WA: Enviar abono 50% (cuentas)**.
3. Revisar chatter: “WhatsApp template … enviado a …”.

Si falla por ventana: los templates Meta son justo para fuera de 24h; si Meta rechaza, revisar número / calidad WABA.

## Deploy / setup

```bash
cd projects/lifedeportes
# 1) Kapso function
node kapso/scripts/deploy_odoo_send_wa_template.js

# 2) Botones + ICP en Odoo prod
python scripts/setup_crm_wa_template_buttons.py prod

# o explícito:
python scripts/setup_crm_wa_template_buttons.py prod \
  --webhook-url "$(cat scratch/odoo_send_wa_template_invoke.txt)" \
  --secret "$(cat scratch/wa_template_webhook_secret.txt)"
```

## safe_eval (Odoo 19)

Código Studio: `env`, `records`, `UserError`, `log`, `requests` (SaaS).  
Sin `import` / `re`. Misma convención que `CRM Proposition → SO + webhook Kapso`.

## Relacionado

- Staff WA: `ENVIAR RETOMAR` / `enviar_retomar_pedido` (`kapso/docs/enviar_retomar_pedido.md`)
- Excel lista: `enviar_formulario_excel`
- Proposition webhook: `docs/odoo/PRESUPUESTO_CRM_SO_WEBHOOK.md`
