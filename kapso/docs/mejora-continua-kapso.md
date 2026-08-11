# Mejora continua Kapso — Life Deportes

**Estado:** vivo · **Grafo:** `lifedeportes_sales_inbound` (`8995b14c-…`) · **Lock:** ~1586

Pipeline reproducible para mejorar prompts, KBs y functions del agente Kapso
sin romper el grafo en producción. Cada mejora sigue el mismo ciclo: editar
fuente → embeber → validar → publicar → confirmar.

---

## 1. Arquitectura del grafo (mapa rápido)

```
Start → guard_policy → guard_staff → decide_route_user_entry
  │                          │
  │  cliente                 │  staff
  ▼                          ▼
  wait_customer_burst    agent_1780762885818 (Staff unificado: pedido/nómina/compra)
  │                          │
  ▼                          ├── compile_staff_order → validate_staff_write → staff_upload_odoo
  fn_ensure_crm_from_quote   ├── confirmar_nomina
  │                          └── ...
  ▼
  agent_orquestador_1745500003000 (Vendedor + Soporte)
    │
    ├── get_whatsapp_context, get_variable, save_variable (quote.*)
    ├── buscar_producto_odoo (precio bajo demanda)
    ├── notificar_interes_ventas (semilla CRM)
    ├── consultar_tarjeta_pedido / consultar_referencias_diseno
    ├── enviar_formulario_excel / enviar_retomar_pedido
    └── enter_waiting / handoff_to_human
```

### Dos agentes, dos prompts

| Agente | Nodo | Prompt fuente | Rol |
|--------|------|---------------|-----|
| **Vendedor** | `agent_orquestador_1745500003000` | `prompts/agent_vendedor_v10_unified.md` | Cliente final: venta gradual, cotización, seguimiento |
| **Staff** | `agent_1780762885818` | Inline en grafo (system_prompt del nodo) | Empleados: SUBIR PEDIDO/NÓMINA/COMPRA, corrección, presupuesto |

### KBs embebidas (catálogo en `embed_agent_knowledge.js`)

| KB | Archivo | Cuándo |
|----|---------|--------|
| `life_horarios_ventas` | `knowledge/life_horarios_ventas_v1.md` | Horario, copy cierre, handoff vs notify |
| `life_reglas_comerciales` | `knowledge/life_reglas_comerciales_v1.md` | FAQ políticas: descuento, abono, envíos, logos, etc. |
| `life_catalogo_precios` | `knowledge/life_catalogo_precios_v1.md` | Precios COP, variantes, extras |
| `life_lenguaje_cliente_productos` | `knowledge/life_lenguaje_cliente_productos_v1.md` | Traducir términos cliente → producto |
| `life_tienda_fotos` | `knowledge/life_tienda_fotos_v1.md` | Fotos/links tienda Odoo |
| `life_flujo_audio_foto` | `knowledge/life_flujo_audio_foto_v1.md` | Audio + foto, siempre texto |
| `kapso_whatsapp_patterns` | `knowledge/kapso_whatsapp_patterns_v1.md` | Media, archivos, WhatsApp |
| `life_lista_pedido_staff` | `knowledge/life_lista_pedido_staff_v1.md` | Lista Excel/Word/imagen (staff) |
| `life_correccion_pedido_staff` | `knowledge/life_correccion_pedido_staff_v1.md` | Retoma/corrige SO (staff) |
| `life_catalog_staff_match` | `knowledge/life_catalog_staff_match_v1.md` | Lenguaje operaria → producto Odoo |
| `life_variantes_odoo` | `knowledge/life_variantes_odoo_v1.md` | IDs variantes Odoo |
| `life_reglas_staff` | `knowledge/life_reglas_staff_v1.md` | Extract staff: draft, mín. 6, deportes |
| `life_nomina_attlog` | `knowledge/life_nomina_attlog_v1.md` | Nómina ZKTeco |
| `life_retomar_oportunidad_crm` | `knowledge/life_retomar_oportunidad_crm_v1.md` | Opp manual en Canal Ventas |

### Functions de sincronización Odoo (carril cliente)

| Function | Archivo | Rol |
|----------|---------|-----|
| `ensure-crm-from-quote` | `functions/ensure_crm_from_quote.js` | Siembra/actualiza `crm.lead` desde `vars.quote` antes del agente vendedor |
| `notify-sales-interest` | `functions/notify_sales_interest.js` | Dossier + notificación líneas comerciales desde el agente |
| `crear-presupuesto-odoo` | `functions/crear_presupuesto_odoo.js` | Crea SO draft desde staff (HAZ PRESUPUESTO) |
| `on-odoo-presupuesto` | `functions/on_odoo_presupuesto.js` | Webhook Odoo: enriquece SO, organiza lista Excel/PDF en note |
| `sync-order-draft-from-odoo` | `functions/sync_order_draft_from_odoo.js` | Sincroniza borrador desde SO existente (staff) |
| `corregir-pedido-odoo` | `functions/corregir_pedido_odoo.js` | Corrige líneas/nota de SO existente |
| `buscar-pedido-odoo` | `functions/buscar_pedido_odoo.js` | Busca SO por número S0 o nombre |
| `buscar-oportunidad-odoo` | `functions/buscar_oportunidad_odoo.js` | Busca/retoma oportunidad CRM por nombre/teléfono/id |

---

## 2. Pipeline de deploy (reproducible)

### Prerrequisitos

```bash
cd /Users/diego/Documents/Sync/projects/lifedeportes
set -a; source .env; set +a   # KAPSO_API_BASE_URL, KAPSO_API_KEY, ODOO_*
```

### Camino A — Deploy unificado (recomendado)

```bash
bash kapso/scripts/deploy_graph_kb_progressive.sh
```

Hace todo en secuencia:

1. **Pull** grafo vivo → `workflow_lifedeportes_sales_inbound_v10.json` (preserva topología remota + lock_version)
2. **Embed** prompts + KBs en el JSON local (`embed_agent_knowledge.js`)
3. **Tests** KB + horarios
4. **Validate** (graph-guard: huérfanos, edges duplicados, functions archivadas)
5. **Push** con `lock_version` correcto (`update-graph.js`)
6. **Confirm** con `get-graph` (imprime lock + updated_at)

### Camino B — Deploy manual (control fino)

```bash
# 1. Pull grafo vivo (preserva topología de Diego)
node ~/.agents/skills/automate-whatsapp/scripts/get-graph.js 8995b14c-d852-4fb3-bceb-8a51a6ccc2c6 > /tmp/kapso_pull.json

# 2. Extraer definition + lock_version
python3 -c "
import json
with open('/tmp/kapso_pull.json') as f:
    data = json.load(f)
w = data.get('data',{}).get('workflow', data.get('data',{}))
defn = w.get('definition',{})
lock = w.get('lock_version')
json.dump(defn, open('kapso/workflow_lifedeportes_sales_inbound_v10.json','w'), indent=2, ensure_ascii=False)
open('/tmp/kapso_lock.txt','w').write(str(lock))
print(f'lock={lock} nodes={len(defn.get(\"nodes\",[]))} edges={len(defn.get(\"edges\",[]))}')
"

# 3. Embeber prompts + KBs
node kapso/scripts/embed_agent_knowledge.js --agent vendedor
node kapso/scripts/embed_agent_knowledge.js --agent staff

# 4. Validar (graph-guard)
node kapso/scripts/validate-graph-lifedeportes.js kapso/workflow_lifedeportes_sales_inbound_v10.json

# 5. Push con lock
LOCK=$(cat /tmp/kapso_lock.txt)
node ~/.agents/skills/automate-whatsapp/scripts/update-graph.js 8995b14c-d852-4fb3-bceb-8a51a6ccc2c6 \
  --expected-lock-version "$LOCK" \
  --definition-file kapso/workflow_lifedeportes_sales_inbound_v10.json

# 6. Confirmar
node ~/.agents/skills/automate-whatsapp/scripts/get-graph.js 8995b14c-d852-4fb3-bceb-8a51a6ccc2c6 | python3 -c "
import sys, json
d = json.load(sys.stdin)
w = d.get('data',{}).get('workflow', d.get('data',{}))
print(f'deployed lock={w.get(\"lock_version\")} updated_at={w.get(\"updated_at\")}')
"
```

### Camino C — Solo prompts (sin tocar topología)

```bash
node kapso/scripts/publish_prompts_to_kapso.js
```

Descarga grafo vivo → embebe solo `system_prompt` de agentes → valida → publica.

### Camino D — Solo una function (sin tocar grafo)

```bash
# Upsert function individual
node kapso/scripts/upsert_kapso_function.js --name <fn-name> --code-file kapso/functions/<file>.js [--function-id <id>]

# Deploy unificado staff (nómina + tools + grafo)
bash kapso/scripts/deploy_unified_staff.sh
```

### Lock conflict

Si `update-graph` falla con error de lock: alguien (probablemente Diego en la
UI) editó el grafo desde que hiciste pull. **Siempre** re-pull y reintentar:
el script `deploy_graph_kb_progressive.sh` ya lo hace automáticamente.

---

## 3. Tipos de mejora y dónde tocar

### 3a. Cambiar texto del prompt del vendedor

**Archivo:** `kapso/prompts/agent_vendedor_v10_unified.md`

```bash
# Editar el .md → deploy
node kapso/scripts/embed_agent_knowledge.js --agent vendedor
node kapso/scripts/validate-graph-lifedeportes.js kapso/workflow_lifedeportes_sales_inbound_v10.json
bash kapso/scripts/deploy_graph_kb_progressive.sh
```

### 3b. Cambiar texto del prompt de staff

**Archivo:** inline en el nodo `agent_1780762885818` del JSON del grafo.
Para editarlo de forma reproducible, modificar el system_prompt en
`workflow_lifedeportes_sales_inbound_v10.json` y hacer push.

### 3c. Cambiar una KB (conocimiento del agente)

**Archivo:** `kapso/knowledge/<kb_name>_v1.md`

```bash
# Editar el .md → deploy (embed la reescribe en el nodo agente)
bash kapso/scripts/deploy_graph_kb_progressive.sh
```

El catálogo de KBs y sus descripciones vive en `embed_agent_knowledge.js`
(constante `KB_CATALOG`). Para añadir una KB nueva: crear el `.md`, añadir
entrada en `KB_CATALOG`, y hacer deploy.

### 3d. Cambiar una function (lógica de integración)

**Archivo:** `kapso/functions/<name>.js` (+ inline en `lib/seed_crm_opportunity_inline.js` si es CRM)

```bash
# Editar el .js → upsert function → deploy grafo si cambió tools/nodos
node kapso/scripts/upsert_kapso_function.js --name <fn-name> --code-file kapso/functions/<file>.js
bash kapso/scripts/deploy_graph_kb_progressive.sh
```

### 3e. Cambiar topología (nodos/edges)

**Archivo:** `kapso/workflow_lifedeportes_sales_inbound_v10.json`

⚠️ **Riesgo alto.** Seguir obligatoriamente el skill `kapso-graph-guard`:
no nodos huérfanos, no edges duplicados, no functions archivadas, lock_version
antes de PATCH. Validar antes de subir.

---

## 4. Reglas de seguridad (kapso-graph-guard)

1. **Un mensaje = re-trigger desde Start** (cliente). Staff write = línea única documentada.
2. **No dejar nodos sin edge entrante** salvo whitelist cliente.
3. **No duplicar** `source + label` en edges.
4. **No cablear functions archivadas:** `detect-staff-upload-command`, `route-staff-entry`, `route-staff-post`, `route-staff-registration`.
5. **Cliente:** no tocar prompts/topología vendedor salvo pedido explícito.
6. **Staff:** un Agent Staff (`agent_1780762885818`) para pedido/nómina/compra. Jump → mismo agente.
7. **UI Kapso manda en topología** — siempre `get-graph` → validar → `update-graph` con `lock_version`.

---

## 5. Verificación post-deploy

| Verificación | Cómo |
|---------------|------|
| Grafo activo | `get-graph` → `status: active`, `lock_version` incrementó |
| Prompt embebido | Buscar fragmento único en `system_prompt` del nodo agente |
| KB embebida | `tests/run_agent_knowledge_tests.js` pasa |
| Horarios | `tests/run_business_hours_tests.js` pasa |
| Ejecución real | Enviar mensaje de prueba al WA y revisar execution en Kapso Inbox |
| CRM sync | Revisar `vars.crm` en la ejecución → `lead_id`, `seeded_by` |

---

## 6. Debugging

### Ver ejecuciones recientes

```bash
set -a; source .env; set +a
curl -sS "${KAPSO_API_BASE_URL}/platform/v1/workflows/8995b14c-d852-4fb3-bceb-8a51a6ccc2c6/executions?limit=10" \
  -H "X-API-Key: ${KAPSO_API_KEY}" | python3 -m json.tool
```

### Ver vars de una ejecución (quote, crm, lead)

```bash
curl -sS "${KAPSO_API_BASE_URL}/platform/v1/workflow_executions/<exec-id>" \
  -H "X-API-Key: ${KAPSO_API_KEY}" | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
ec = d['execution_context']['vars']
print('quote:', json.dumps(ec.get('quote',{}), indent=2, ensure_ascii=False))
print('crm:', json.dumps(ec.get('crm',{}), indent=2, ensure_ascii=False))
"
```

### Ver conversación de un teléfono

```bash
curl -sS "${KAPSO_API_BASE_URL}/platform/v1/whatsapp/conversations?phone_number=3000000034&limit=5" \
  -H "X-API-Key: ${KAPSO_API_KEY}" | python3 -m json.tool
```

### Ver oportunidad CRM en Odoo (MCP)

```
mcp__odoo_life_prod__execute_method(
  model="crm.lead",
  method="search_read",
  args=[[["id","=",3679]], ["id","name","phone","description","expected_revenue","stage_id","date_deadline"]]
)
```

---

## 7. Pendientes activos (backlog de mejora)

> **Estado 2026-08-11:** los 3 frentes de abajo están **implementados y publicados en prod**
> (lock 1596). Se mantienen aquí como referencia de qué se hizo y dónde tocar si
> necesitan ajustes.

### 7.1. Sync pedido Kapso → Odoo (actualizar oportunidad existente) — ✅ HECHO

**Problema original:** `ensure-crm-from-quote` siembra el `crm.lead` la primera vez, pero
en ejecuciones siguientes, si `vars.crm.opportunity_id > 0`, **salta** (early
return `already_has_lead`). El `quote` puede cambiar (qty, producto, precio)
y el CRM no se entera.

**Caso real:** 3000000034 — la conversación actualizó el pedido de
1 × Conjunto de arquero ($70.000) a 11 × Uniforme de Fútbol ($550.000).
Odoo CRM 3679 sigue con los datos viejos.

**Implementado (function desplegada):**
- En `ensure_crm_from_quote.js`, cuando `alreadyId > 0` ya **no** hace early
  return ciego: compara `quote.revision` con `crm.last_synced_revision`.
  - Si `quoteRevision > 0 && quoteRevision <= lastSyncedRevision` → skip.
  - Si cambió (o no hay `last_synced_revision`) → llama `seedCrmOpportunityFromQuote()`
    con el `leadId` existente (que hace `write`, ya soportado en
    `seed_crm_opportunity_inline.js`).
- Añadido `parseIfString` para manejar `quote` como string o objeto.

**Archivos:** `functions/ensure_crm_from_quote.js` + `functions/lib/seed_crm_opportunity_inline.js`

### 7.2. Lógica de horario (fin de semana / después de 5 PM) — ✅ HECHO

**Problema original:** El agente no sabe si está en horario comercial o fuera. La KB
`life_horarios_ventas` le dice al agente que infiera, pero no hay function
determinística que inyecte `vars.service.business_mode`.

**Lo que ya existía (no cableado):**
- `kapso/functions/lib/business_hours.js` — cálculo `in_hours` / `off_hours`
  (Bogotá: lun-vie 8-17, sáb 8-14, dom/festivos off)
- `kapso/knowledge/life_horarios_ventas_v1.md` — KB con copy de cierre
  (`in_hours`: "hoy mismo" vs `off_hours`: "mañana en la mañana")

**Lo que pide Diego:**
- Que el agente diga cuando es **fin de semana** y **después de las 5 PM** que
  el pedido será confirmado en **horario laboral** pero que lo tienen en cuenta.

**Implementado y desplegado (lock 1596):**
1. Function `resolve-business-hours` (`functions/resolve_business_hours.js`,
   id `979e5610-…`) deployada — usa `business_hours.js`, escribe
   `vars.service.business_hours`, `business_mode`, `business_hours_label`.
2. Nodo `fn_resolve_business_hours_1745500002595` cableado en el carril cliente:
   `ensure_crm_from_quote → resolve_business_hours → agent vendedor`.
3. Prompt `agent_vendedor_v10_unified.md` §0.12: lee `service.business_mode`
   cada turno → `in_hours` promete "hoy mismo" (§4.1 KB), `off_hours` dice que
   quedó anotado y lo revisa el equipo el siguiente día hábil en la mañana (§4.2).
4. KB `life_horarios_ventas_v1.md` instruye leer `vars.service.business_mode` si el grafo la inyecta.

**Archivos:** `functions/resolve_business_hours.js` (creado) + `workflow_v10.json` (nodo + edge) + `prompts/agent_vendedor_v10_unified.md` + `knowledge/life_horarios_ventas_v1.md`

### 7.3. Medios de pago en el prompt — ✅ HECHO

**Problema original:** El prompt decía: *"Abono del 50% para iniciar y el resto
contra entrega. La cuenta o medio exacto se lo indica el asesor al confirmar
el pedido."* — evita dar el medio de pago. Diego quiere que el agente pueda
responder con los medios disponibles: **Nequi, Bancolombia, Daviplata**.

**Implementado y desplegado:**
1. Fila "Medios de pago" en la tabla de políticas claras del prompt:
   *"…Puede pagar por Nequi, Bancolombia o Daviplata (transacción por breve);
   el medio exacto se lo indica el asesor al confirmar el pedido."*
2. Respuesta fija en KB `life_reglas_comerciales_v1.md` — mismos tres medios,
   "No inventes número de cuenta ni datos bancarios específicos".

**Archivos:** `prompts/agent_vendedor_v10_unified.md` + `knowledge/life_reglas_comerciales_v1.md`

---

## 8. Convenciones de versionado

| Tipo | Convención | Ejemplo |
|------|-----------|---------|
| Prompt vendedor | `agent_vendedor_v<N>_unified.md` | `agent_vendedor_v10_unified.md` |
| Prompt staff | Inline en grafo (no archivo .md separado) | — |
| KB | `<name>_v<N>.md` | `life_horarios_ventas_v1.md` |
| Function | `<name>.js` (+ `_deploy.js` bundle si aplica) | `ensure_crm_from_quote.js` |
| Grafo | `workflow_lifedeportes_sales_inbound_v<N>.json` | `v10` = activo |

Al crear una nueva versión de prompt o KB, bumpar el número en el archivo y
actualizar la referencia en `embed_agent_knowledge.js`.
