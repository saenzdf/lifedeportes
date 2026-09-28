# Grafo staff — RETIRADO de Kapso (2026-09-16)

El carril staff **ya no vive en Kapso**. Kapso solo detecta el mensaje del staff (allowlist),
agrupa el hilo 1s y lo despacha a **Hermes local** con la function `staff-hermes-forwarder`.

**Doc viva:** [`staff_hermes_bridge.md`](staff_hermes_bridge.md) — topología, envelope, reglas y pendientes.

## Qué había antes (referencia histórica)

Un solo agente, tres dominios (pedido / nómina / compra) en el nodo `agent_1780762885818`,
con la cadena de write `compile-staff-order-draft → validate-staff-write → route-staff-write →
build-quote-payload → odoo-create-lead-and-so` y el decide `route-staff-lane-resume`
(“CONFIRMO SUBIR”). Prompt: `kapso/prompts/agent_staff_upload_v9_slim.md` (se conserva como referencia,
ya no se embebe). Deploy: `kapso/scripts/deploy_unified_staff.sh` (**retirado, no correr**).

## Qué quedó

| Pieza | Estado |
|-------|--------|
| Nodo `agent_1780762885818` + su toolset (20 tools) | Retirado del grafo y borrado de Kapso (código en `functions/_archive/`) |
| Cadena de subida legacy + decide lane-resume | Retirada (la subida de pedidos es 100% de Hermes) |
| Nómina (`parse-nomina-attlog`, `confirmar-nomina`) y compra (`crear-compra-odoo`) | Retirados de Kapso |
| Ruteo viejo (`detect-staff-lane`, `route-staff-entry/lane/registration`) | Borrado de Kapso |
| KBs staff (`life_lista_pedido_staff`, `life_reglas_staff`, …) | Se conservan en `kapso/knowledge/` como fuente para el agente de Hermes |
| Prompt staff legacy | `kapso/prompts/agent_staff_upload_v9_slim.md` (referencia; `--agent staff` es no-op) |

## Sin reintroducir

- El agente staff embebido ni agentes por dominio en Kapso.
- La cadena de write de pedidos en Kapso (doble escritura con Hermes).
- Ninguna function listada en `ARCHIVED_FUNCTION_NAMES` (`scripts/validate-graph-lifedeportes.js`).
