# Deploy steps - Kapso v3 (Agent orquestador)

Version: 2026-04-22

## 1) Prerrequisitos
- `kapso login` con el proyecto Life Deportes activo.
- Numero WhatsApp conectado (`1081649091701994` para `life_main`).
- Secretos de Kapso Functions configurados:
  - `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD` (lectura de precios en `odoo-search-product-price`).
- WhatsApp Flows creados (aunque sigan en draft hasta desbloquear #139000): ver [whatsapp_flows/kapso_flow_registry.json](whatsapp_flows/kapso_flow_registry.json).

## 2) Orden de deploy

### 2.1 Functions (crear/redeploy en este orden)
1. `policy-guard-input` -> `functions/policy_guard_input.js`
2. `staff-allowlist-check` -> `functions/staff_allowlist_check.js`
3. `get-service-status` -> `functions/get_service_status.js`
4. `odoo-search-product-price` -> `functions/odoo_search_product_price.js` (ya deployada; verificar env vars)
5. `build-quote-payload` (stub) -> `functions/build_quote_payload.js`
6. `odoo-create-lead-and-so` (stub) -> `functions/odoo_create_lead_and_so.js`
7. `media-intake-dispatcher` (stub) -> `functions/media_intake_dispatcher.js`
8. `route-intent-next` -> `functions/route_intent_next.js`

Comando tipo:
```
node scripts/create-function.js --name <fn-name> --code-file kapso/functions/<file>
node scripts/deploy-function.js --function-id <id>
```

### 2.2 Subworkflow placeholder
- `lifedeportes_media_intake_stub` con graph [workflow_media_intake_stub.json](workflow_media_intake_stub.json). Publicar para que el Agent pueda invocarlo (via tool) cuando decidamos migrar a `call_workflow` real.

### 2.3 Workflow principal
- `lifedeportes_sales_inbound` con graph [workflow_lifedeportes_sales_inbound.json](workflow_lifedeportes_sales_inbound.json).
- Trigger: `inbound_message` en phone_number_id del tenant `life_main`.

### 2.4 Verificacion
- `node scripts/validate-graph.js --definition-file kapso/workflow_lifedeportes_sales_inbound.json`
- Enviar mensajes de prueba cubriendo ramas del Decide post-agent:
  - `continue_chat` (conversacion normal).
  - `flow_order_details` (post-pago simulado; el Agent debe setear `vars.intent_next`).
  - `fallback_text` (el Agent no sabe cerrar).
- Validar que los guards escriben `vars.user`, `vars.security` (tenant fijo `life_main` en este inbound).
- Validar que las tools devuelven el shape esperado (`vars.service.last_call_*`).

## 3) Modelos del agente (primario + respaldo)

Kapso no tiene fallback automatico entre modelos en un mismo nodo Agent. Si el primario falla, cambiar manualmente en el nodo o en `workflow_lifedeportes_sales_inbound.json` y volver a publicar.

| Rol | Nombre Kapso | `provider_model_id` | Provider |
|-----|----------------|---------------------|----------|
| **Primario** | `google/gemini-3.5-flash` | `65909bac-fbee-41c7-be4c-bfd8a342e28e` | OpenRouter |
| **Respaldo** | `claude-haiku-4-5` | `8c6d57df-3f07-4290-b8a5-38047608c4df` | Anthropic |

Respaldo legacy (si hace falta): `gemini-2.5-flash` → `a3a3c61e-786f-42da-91c3-823c951fb8b4` (Google directo).

Parametros actuales del agente: `temperature` 0.35, `max_iterations` 10, `max_tokens` 1536.

### Test en Kapso sin respuesta

Si el simulador falla sin mensaje al cliente:

1. Abrir la ejecucion → pestana **Events** → buscar `execution_failed` o `step_failed`.
2. Si el error es **`Insufficient credits`**, el grafo esta bien: recargar en [billing del proyecto](https://app.kapso.ai/projects/b470d474-6a7a-4d84-a214-6cd4b198b4f3/billing). No es un bug del flujo.
3. Si `step_count` es 3 y falla en `agent_orquestador_*`, los guards (`policy`, `staff`) ya pasaron; el bloqueo es casi siempre creditos o el modelo LLM, no las funciones Odoo.
4. Errores de flujo (arista rota, funcion no deployada) suelen fallar antes del agente o en `FunctionAction`, no en `FlowAgentStep`.

Ultima prueba fallida registrada (API): `764100c2-28a8-4cfe-a6e6-58ff27eadcfb` — modelo `google/gemini-3.5-flash`, error `Insufficient credits`.

## 4) Reglas comerciales obligatorias (hard constraints del Agent)
- Nunca cerrar cifra sin `buscar_producto_odoo`.
- Si el cliente no define material y ya se va a cerrar, preguntar Dry Fit vs Falcao.
- Minimo de pedido 6 uniformes para diseno personalizado.
- Unico Flow de cara al cliente: `order_details`, solo post-pago.

## 5) Rollback
Si la v3 falla en produccion:
1. Desactivar trigger del `lifedeportes_sales_inbound` nuevo.
2. Restaurar el v2 previo (guardar copia en `archive/inbound_v2_pre_v3.json` antes de desplegar).
3. Reportar en `baseline_audit.md` qué ramas fallaron.

---

## 6) Trial v1 — catalogo en cache + Odoo solo en handoff

Version: 2026-05-21

### 6.1 Refresh catalogo (sin Odoo por mensaje)

```bash
cd lifedeportes
python scripts/export_sellable_catalog.py          # desde Odoo si hay credenciales
python scripts/export_sellable_catalog.py --from-csv # offline desde sellable_catalog_variants.csv
```

Genera: `kapso/catalog_cache.json`, `kapso/catalog_for_agent.md`, embebe cache en `build_quote_payload.js`.

### 6.2 Sync prompt trial

```bash
node kapso/scripts/sync-trial-agent-prompt.js
node kapso/scripts/patch-workflow-trial-v1.js   # idempotente; staff upload path
```

### 6.3 Functions (redeploy)

1. `staff-allowlist-check` → `staff_allowlist_check.js` (allowlist + env `LIFE_STAKEHOLDER_WHITELIST`)
2. `build-quote-payload` → `build_quote_payload.js` (cache lookup, status ready)
3. `detect-staff-upload-command` → `detect_staff_upload_command.js` (**crear si no existe**)
4. `route-staff-entry` → `route_staff_entry.js` (**crear si no existe**)
5. `route-intent-next` → `route_intent_next.js`

Odoo upload: solo nodo `fn_staff_upload_odoo` o invoke manual — **no** tool del agente.

### 6.4 Upload manual (operador)

```bash
node kapso/scripts/invoke-upload-order.js --execution-id <uuid>
```

Staff WhatsApp en allowlist: escribir `SUBIR PEDIDO` en el hilo.

### 6.5 Validacion

```bash
node ~/.agents/skills/automate-whatsapp/scripts/validate-graph.js \
  --definition-file kapso/workflow_lifedeportes_sales_inbound.json
```

Matriz: [E2E_TRIAL_V1_MATRIX.md](E2E_TRIAL_V1_MATRIX.md)

### 6.6 Reglas trial (agente)

- Precios solo del catalogo embebido — **no** `buscar_producto_odoo` en conversacion.
- Cierre: `construir_payload_pedido` + `handoff_human`.
- `formal_quote` redirige a handoff (no SO automatico).
- Parametros agente: `max_iterations` 5, `max_tokens` 1536.
