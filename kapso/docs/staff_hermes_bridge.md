# Carril staff — Kapso → Hermes local (forwarder)

> **Estado: PRODUCCIÓN (2026-09-16).** El agente staff embebido de Kapso se retiró.
> Antes: `agent_1780762885818` (3 dominios: pedido/nómina/compra) dentro de Kapso.
> Ahora: Kapso **solo despierta** al staff agent de Hermes local.

## Topología viva (lock 2143)

```
Start → policy-guard-input → staff-allowlist-check → route-user-entry
   ├─ [customer] classify-contact-odoo → wait_customer_burst → …  (carril ventas, intacto)
   └─ [staff]    wait_staff_burst (1s, debounce del hilo)
                    ├─ user_input → wait_staff_burst        (reinicia debounce)
                    └─ timeout    → fn_staff_hermes_forwarder
                                        └─ next → wait_staff_lane (sin timeout; espera el próximo mensaje)
                                                     └─ next → wait_staff_burst
```

- Function del puente: **`staff-hermes-forwarder`** (`4e9625ad-e42b-4c22-abe9-69eae639c5af`).
- Destino: webhook del gateway Hermes, ruta **`staff-assistant`** (`POST /webhooks/staff-assistant?chat_id=<wa_id>`),
  firmado con `X-Hub-Signature-256` (HMAC-SHA256 del body con `HERMES_WEBHOOK_SECRET`).
- Envelope: `kapso_hermes_envelope_v1` (source/lane/user/conversation_id/message_id/text/media).
- El forwarder guarda el resultado en `vars.hermes_forward` (`status: accepted | http_XXX | error: …`).
- Hermes responde al staff por su propio egress (no vuelve por el grafo de Kapso).

## Reglas del carril

1. **El grafo no decide nada del staff**: ni nómina, ni compra, ni pedido. Solo enruta y despacha.
2. **Un mensaje = un despacho.** El debounce de 1s agrupa el hilo; el burst `timeout` dispara el forward una sola vez por mensaje.
3. **Sin camino legacy de subida.** `validate-staff-write` / `build-quote-payload` / `odoo-create-lead-and-so`
   y el decide `route-staff-lane-resume` (CONFIRMO SUBIR) se retiraron: la subida de pedidos es 100% de Hermes
   (si no, se podía duplicar el SO).
4. **Sin reintroducir** `agent_1780762885818`, los agentes por dominio (`agent_staff_nomina_*`,
   `agent_inbox_ingreso_*`) ni el decide multi-agente. Las functions retiradas están en
   `kapso/functions/_archive/` con cabecera `ARCHIVED` — restaurarlas exige quitarlas de
   `ARCHIVED_FUNCTION_NAMES` en `scripts/validate-graph-lifedeportes.js`.
5. `kapso/scripts/deploy_graph_kb_progressive.sh` ya **no** embebe prompt/KB de staff
   (`embed_agent_knowledge.js --agent staff` es no-op: ver `RETIRED_AGENTS`).

## Scripts

| Script | Uso |
|--------|-----|
| `kapso/scripts/cleanup_staff_lane_hermes.js` | Aplica el retiro al definition (idempotente, con guardas de edges colgados) |
| `kapso/scripts/retire_staff_legacy_functions.py` | Archiva en `_archive/` y borra en Kapso las functions retiradas (`--dry-run` / `--apply`) |
| `kapso/scripts/validate-graph-lifedeportes.js` | graph-guard: exige `fn_staff_hermes_forwarder` y bloquea las functions archivadas |

## Pendientes conocidos

- El destino del forwarder es una **quick tunnel de Cloudflare** efímera: si cambia, el carril staff queda mudo
  y nadie se entera (el forwarder no avisa al staff). Conviene URL/secreto como secrets de Kapso + aviso de fallo.
- `staff-hermes-forwarder` **no está versionada en el repo** (vive solo en Kapso).
- `morning-flush-staff-notifies`, `request-contact-info` y `expire-stale-waiting` siguen desplegadas sin cablear
  en el grafo (features con caller externo / sin caller identificado); se dejaron a propósito.
