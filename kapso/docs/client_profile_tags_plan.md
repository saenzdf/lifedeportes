# Plan: perfil de cliente, memoria consultable y tags internos

> **Estado:** TTL 14d implementado en `classify-contact-odoo` (2026-08-28). Tags completos: fase 1 parcial.

## Objetivo

Que el bot **contextualice** cuando el cliente habla de un pedido previo o de algo que ya dijo, consultando memoria por **cliente** (no por `conversation_id`), y que un **tag de playbook interno** le diga cómo reaccionar sin mostrarlo al cliente.

---

## Principios de diseño

| Principio | Implicación |
|-----------|-------------|
| **Un cliente = una identidad** | Teléfono (prioridad) + BSUID en el mismo `res.partner`. |
| **Memoria ≠ conversación** | `conversation_id` es sesión Kapso; la memoria vive en partner + Odoo + índice Kapso. |
| **Tags = política, no CRM stage** | Etiquetas cortas para el agente; no confundir con etapa CRM ni funnel. |
| **Consulta bajo demanda** | Start/classify cargan un **índice** ligero; el agente/tool trae detalle si el cliente menciona un pedido. |
| **Spam gana siempre** | Si `spam_blocked`, no LLM comercial — silencio + `ended`/`ignore` (refuerzo del triage actual). |
| **Cliente no ve tags** | Solo en `vars.client_profile.*`; prohibido en copy WhatsApp. |
| **Prospecto ≠ cliente** | Quien **nunca convirtió** puede **olvidarse** (TTL) para no cargar memoria Kapso/CRM en cada inbound. |
| **Cliente real = memoria larga** | SO confirmado, opp `interes_confirmado` reciente, o pedido activo → sin olvido automático. |

---

## Tiers de relación (quién merece memoria)

No todo contacto en Odoo es un “cliente”. El sistema distingue:

| Tier | Criterio (cualquiera basta para subir) | Memoria bot |
|------|----------------------------------------|-------------|
| **`customer`** | ≥1 SO `sale`/`done` **o** tarjeta proyecto **o** opp `interes_confirmado` &lt; 90 días | **Larga** — orders, conversaciones, dossier |
| **`warm_prospect`** | Partner + quote/opp `cotizando` con actividad &lt; TTL | **Corta** — hydrate quote, sin índice pesado |
| **`cold_prospect`** | Partner sin conversión y **fuera de TTL** | **Mínima** — solo identidad + spam/advisor; tratar como nuevo |
| **`anonymous`** | Sin partner / solo BSUID sin historial | **Ninguna** en classify |

**“Cliente nuevo que nunca deja de serlo”** = `cold_prospect` tras expirar: el partner puede existir en Odoo (tel/BSUID), pero el bot **no rehidrata** cotizaciones viejas ni lista conversaciones Kapso salvo que el cliente vuelva a mostrar interés en el mismo hilo de días.

---

## Olvido de prospectos (memory TTL)

Objetivo: menos llamadas Kapso, menos vars, menos confusión (“me preguntaste lo mismo hace 3 meses y no compré”).

### Cuándo **expira** la memoria comercial (pasa a `cold_prospect`)

Todas deben cumplirse:

1. **Sin** SO en `draft|sent|sale` ni tarjeta proyecto abierta.
2. **Sin** opp con `interes_confirmado` en los últimos **N días** (propuesta: **30**).
3. Última actividad útil (quote en Kapso u opp CRM `cotizando`) hace más de **N días** (propuesta: **14** sin inbound, o **7** tras `ended` sin confirmación).

Excepciones — **nunca olvidar** automáticamente:

- Cualquier SO histórico `sale`/`done` → tier `customer` de por vida.
- `spam_strikes` / `blocked_until` (seguridad).
- `Asignado a` en partner (asesor sticky) — se mantiene aunque la memoria comercial expire.
- Staff marca manual `keep_memory` en partner (casos VIP en negociación larga).

### Qué se **deja de cargar** al expirar

| Capa | Comportamiento tras TTL |
|------|-------------------------|
| Hydrate Kapso (`quote`) | **Skip** — `session.continuity.resumed = false`, `memory_scope = none` |
| Índice conversaciones Kapso | **No consultar** en classify; tool solo si staff fuerza |
| CRM opp `cotizando` vieja | Bot **ignora** dossier; opp puede quedar en Odoo para Paola/Javier |
| `memory_index` | Solo `{ partner_id, identity, advisor }` |
| Tag playbook | `new_prospect` o `cold_prospect` (mismo flujo: saludo estándar) |

### Qué **no** se borra (solo deja de usarse en bot)

- Partner Odoo, teléfono, BSUID en comment.
- Opp/leads archivados (historial comercial humano).
- Ejecuciones Kapso en plataforma (no las borramos; solo no las leemos).

### Re-activación

Si un `cold_prospect` vuelve a escribir:

- Tratar como **prospecto fresco** (presentación, diseño, cantidad).
- Si en el **mismo día** retoma con frase de continuidad (“sigo con los 20 uniformes”), el agente puede usar **solo el mensaje actual** + `get_whatsapp_context` del hilo — sin hydrate cross-conversation.
- Si confirma interés de nuevo → `warm_prospect` / notify → tier sube.

Meta en partner comment:

```html
<!-- kapso:memory tier=cold_prospect expired_at=2026-08-20 last_hydrate_skip=classify -->
```

---

## Dos capas

```
┌─────────────────────────────────────────────────────────────┐
│  CAPA 1 — Identidad durable (partner / tel / BSUID)         │
│  • res.partner (Odoo)                                       │
│  • Asignado a: Paola|Javier (comment)                       │
│  • Índice memoria: últimos SO, opps activas, conv Kapso    │
│  • Flags persistentes: spam_strike_count, vip, blocked_until│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ classify / client-resolve
┌─────────────────────────────────────────────────────────────┐
│  CAPA 2 — Tag de playbook (por inbound, no visible)         │
│  • primary_tag + secondary_tags[]                           │
│  • playbook_id → bloque prompt / tools permitidas           │
│  • memory_scope: none | quote_only | orders | full          │
└─────────────────────────────────────────────────────────────┘
```

---

## Taxonomía de tags (v1)

Prioridad **descendente** — gana el primero que aplique:

| Prioridad | `primary_tag` | Cuándo | Política agente |
|-----------|---------------|--------|-----------------|
| 1 | `spam_blocked` | `spam_profile.is_spam` **o** partner `blocked_until` **o** ≥N strikes | **No responder.** `enter_waiting` / `ended`. Sin CRM seed. |
| 2 | `large_order_fast_advisor` | qty ≥ umbral (ej. 50+) **o** total_cop ≥ X **o** producto institucional | Cotización mínima → **`notificar_interes_ventas`** pronto → asesor. Copy corto. |
| 3 | `active_order_support` | `orders.active_count ≥ 1` **o** tarjeta proyecto abierta | Modo seguimiento: **consultar memoria** (SO/tarjeta). No reiniciar venta salvo que pida pedido nuevo. |
| 4 | `hot_recurring` | ≥2 SO `sale/done` en 12 meses **o** ≥2 opps confirmadas **o** partner flag `recurring` | Trato VIP-lite: retomar nombre/pedido, menos preguntas base, prioridad notify. |
| 5 | `returning_with_memory` | tier `customer` **o** `warm_prospect` + hydrate/dossier útil | Usar `session.continuity` / CRM; no repreguntar lo ya en quote. |
| 6 | `new_prospect` | `anonymous` o `cold_prospect` (memoria expirada) | Flujo ventas estándar; **sin** asumir historial previo. |
| 6b | `warm_prospect` | tier `warm_prospect` dentro de TTL | Cotización en curso; hydrate quote; memoria corta. |

**Tags secundarios** (combinables, no cambian routing principal):

- `memory_expired` — era prospecto; memoria comercial TTL cumplido; playbook = nuevo.
- `ads_prefill_pending` — solo prefill Meta; esperar mensaje real (`spam_profile.ads_prefill_only`).
- `multi_active_orders` — `active_count > 1` → pedir S0… si ambiguo.
- `bsuid_only` — sin E.164; sin wa.me; inbox Kapso staff.
- `advisor_assigned` — Javier/Paola en partner (`sales_notify.sticky_from_contact`).

---

## Memoria consultable

### Qué indexar en classify (ligero, siempre)

Escrito en `vars.client_profile.memory_index`:

```javascript
{
  partner_id: 4134,
  identity: { phone_e164: "+573…", bsuid: "CO.xxx" | null },
  orders: {
    active: [{ id, name, state, task_stage }],      // ya existe en vars.orders
    recent_closed: [{ id, name, date, total }],       // últimos 3 sale/done
  },
  opportunities: {
    open: [{ id, name, stage, product_summary }],   // CRM activas
  },
  conversations: {
    last_kapso_conv_id: "uuid",
    prior_conv_count: 2,                              // mismo tel, Kapso list filtrado
    last_quote_summary: "6× uniforme fútbol $318k",   // hydrate / dossier
  },
  advisor: { name: "Javier", phone_display: "310…" }
}
```

### Qué consultar bajo demanda (tool / function)

| Tool propuesta | Fuente | Cuándo la usa el agente |
|----------------|--------|-------------------------|
| `consultar_pedidos_cliente` | Odoo `sale.order` by partner | "¿cómo va mi pedido?", "el S01234" |
| `consultar_tarjeta_pedido` | Odoo `project.task` | Producción / diseño (ya en agente histórico) |
| `consultar_memoria_conversacion` | Kapso executions by phone | "ya les había mandado el logo", "lo del martes" |
| `consultar_oportunidad_abierta` | CRM dossier | Retoma cotización sin nuevo interés |

**Conversaciones pasadas:** no volcar transcript completo en vars (tokens + privacidad). Devolver:

- resumen quote por ejecución (producto, qty, total, fecha),
- últimos 5 mensajes cliente si hace falta desambiguar,
- `resume_hint` ya existente.

Implementación: extender `kapso_session_hydrate.js` → `listCustomerExecutionSummaries(env, phone, { limit: 5 })`.

---

## Namespace propuesto: `vars.client_profile`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `primary_tag` | string | Uno de la tabla prioridad |
| `secondary_tags` | string[] | Combinables |
| `playbook_id` | string | `sales_default` \| `order_support` \| `spam_silent` \| `large_order_escalate` |
| `memory_scope` | string | `none` \| `quote` \| `orders` \| `full` |
| `relationship_tier` | string | `anonymous` \| `cold_prospect` \| `warm_prospect` \| `customer` |
| `memory_expired` | boolean | `true` si prospecto pasó TTL — tratar como nuevo |
| `memory_ttl_days` | number | Días restantes de memoria warm (0 = cold) |
| `memory_index` | object | Índice ligero (arriba) |
| `policy` | object | Reglas machine-readable para prompt |
| `computed_at` | ISO | Último classify |
| `identity_key` | string | `phone:573…` o `bsuid:CO.xxx` |

Ejemplo `policy` para `active_order_support`:

```json
{
  "greet_as_returning": true,
  "allow_new_quote": true,
  "must_offer_order_picker_if_ambiguous": true,
  "forbid_restart_from_zero": true,
  "preferred_tools": ["consultar_tarjeta_pedido", "consultar_pedidos_cliente"]
}
```

Registrar en `kapso/vars_contract.md` cuando se implemente.

---

## Pipeline (dónde vive)

```
Start → classify-contact-odoo (extendido)
          ├─ resolver partner (tel / BSUID)          [hoy]
          ├─ hydrate quote + orders.active           [hoy]
          ├─ leer advisor partner                    [hoy]
          ├─ NEW: compute client_profile tags
          ├─ NEW: build memory_index
          └─ merge spam_profile (burst route previo)
       → route-customer-entry
          ├─ spam_blocked → ignore / end
          ├─ active_order_support → agente histórico (existente) o vendedor con vars enriquecidas
          └─ default → agente vendedor
```

**Alternativa fase 2:** function dedicada `resolve-client-profile` entre classify y route — más testeable.

---

## Persistencia de flags duraderos (partner)

En `res.partner.comment` (HTML + meta), convención paralela a `kapso:advisor`:

```html
<!-- kapso:profile tags=hot_recurring,spam_strikes=2 blocked_until=2026-09-01 bsuid=CO.xxx wa=3208255852 -->
```

| Flag | Quién escribe | Uso |
|------|---------------|-----|
| `spam_strikes` | `route-customer-burst-resume` / manual staff | Auto `spam_blocked` si ≥3 |
| `blocked_until` | staff Odoo / script | Blacklist temporal |
| `hot_recurring` | classify si reglas Odoo pasan | Tag secundario sticky |
| `vip_large_buyer` | staff manual | Refuerzo large_order |

Opp archivada **no** almacena identidad — solo historial comercial.

---

## Integración con prompt vendedor

Bloque inyectado (interno, no citar al cliente):

```markdown
## Perfil interno (no decir al cliente)
- Tag: {{client_profile.primary_tag}}
- Memoria: {{client_profile.memory_scope}}
- Pedidos activos: {{orders.active_count}} — {{orders.focus_order_name}}
- Hint: {{session.continuity.resume_hint}}

Reglas:
- spam_blocked → no mensaje
- active_order_support → prioriza consulta pedido; no repreguntes qty/producto ya en quote
- large_order_fast_advisor → cotiza breve y notify pronto
- hot_recurring → trato recurrente, nombre equipo si lo tienes
```

---

## Umbrales sugeridos (calibrar con Diego)

| Señal | Umbral inicial |
|-------|----------------|
| `large_order_fast_advisor` | qty ≥ 40 **o** total ≥ $8M COP **o** keywords institucional |
| `hot_recurring` | ≥2 SO confirmados en 365 días |
| `spam_blocked` (persistente) | 3 strikes en 30 días |
| `memory_scope=full` | tier `customer` + (`active_count ≥ 0` o `hot_recurring`) |
| **Prospecto → cold** | 14 días sin inbound **y** sin `interes_confirmado` **y** sin SO |
| **Opp confirmada “viva”** | `interes_confirmado` cuenta 30 días hacia `warm_prospect` |
| **Hydrate Kapso** | Solo si tier ≠ `cold_prospect` y última exec útil &lt; 14 días |

---

## Lógica `computeRelationshipTier()` (pseudocódigo)

```javascript
function computeRelationshipTier(partner, odoo, kapsoMeta) {
  if (odoo.hasActiveOrderOrProject) return "customer";
  if (odoo.hasSaleDoneEver) return "customer";
  if (odoo.hasRecentConfirmedOpp(withinDays: 30)) return "warm_prospect";
  if (!partner) return "anonymous";

  const lastUseful = max(kapsoMeta.lastQuoteAt, odoo.lastCotizandoOppAt);
  const daysSince = daysBetween(lastUseful, now);
  const daysSinceInbound = daysBetween(kapsoMeta.lastInboundAt, now);

  if (daysSince > 14 && daysSinceInbound > 14 && !odoo.hasRecentConfirmedOpp(30)) {
    return "cold_prospect"; // olvidar memoria comercial
  }
  if (lastUseful && daysSince <= 14) return "warm_prospect";
  return "cold_prospect";
}
```

En classify: si `cold_prospect` → **no llamar** `hydrateCustomerSessionFromKapso` (o pasar `{ skip: true }`).

## Fases de implementación

### Fase 0 — Contrato (1–2 días)
- [ ] Aprobar taxonomía tags + prioridades
- [ ] Añadir `vars.client_profile` a `vars_contract.md`
- [ ] Wiki + este doc como fuente de verdad

### Fase 1 — Tags sin conversaciones históricas (3–5 días)
- [ ] Función `computeClientProfile()` en classify
- [x] **`computeRelationshipTier()` + TTL prospecto** (skip hydrate si `cold_prospect`) — `93d89e4c` 2026-08-28
- [x] **`active_order_support` + `playbook_id: order_support`** — classify + prompt v11 2026-08-28
- [x] Mapear Odoo → `memory_index.orders` + etapa proyecto
- [x] Prompt vendedor: router 0b + `client_profile.memory_expired` + rama 4a seguimiento
- [ ] Tests unitarios tags + prioridad

### Fase 2 — Consulta pedidos (3–4 días)
- [x] `consultar_tarjeta_pedido` con `lookup_phone` / `lookup_name` (pedido a nombre de tercero)
- [x] Enrutar `active_order_support` → vendedor con playbook order_support
- [ ] Multi-pedido: picker S0…

### Fase 3 — Índice conversaciones Kapso (5–7 días)
- [ ] `listCustomerExecutionSummaries` por tel/BSUID
- [ ] Tool `consultar_memoria_conversacion` (resúmenes, no dump)
- [ ] Límite rate Kapso API

### Fase 4 — Persistencia spam / VIP (2–3 días)
- [ ] Partner flags `spam_strikes`, `blocked_until`
- [ ] Staff puede marcar `vip_large_buyer` en Odoo (Studio o comment)

### Fase 5 — Métricas (continuo)
- [ ] Log `client_profile.primary_tag` en `service` / webhook analítica
- [ ] Revisar falsos positivos spam / large_order

---

## Qué ya existe vs qué falta

| Capacidad | Hoy | Falta |
|-----------|-----|-------|
| Identidad tel/BSUID → partner | classify + claimAssignee | BSUID enriquecimiento sistemático |
| Pedidos activos Odoo | `vars.orders.active` | recent_closed, tool consulta |
| Quote memoria | hydrate + CRM dossier | índice multi-conversación |
| Spam sesión | `spam_profile` + burst route | spam **persistente** por partner |
| Segmento new/existing | `contact_segment` | tags playbook granulares |
| Agente histórico | prompt + grafo (parcial) | unificar con tags + tools |
| Tag large_order | reglas comerciales dispersas | tag central + notify rápido |
| Conversaciones pasadas | hydrate 1 ejecución | lista resúmenes N ejecuciones **solo tier customer/warm** |
| Olvido prospecto | — | TTL 14d + tier `cold_prospect` |

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| API Kapso mezcla hilos | Filtro client-side por tel (ya en hydrate) |
| LLM ignora tag spam | Edge duro `ignore` antes del agente |
| Tag large_order demasiado agresivo | Umbral alto + qty confirmada en quote |
| Vars demasiado grandes | Solo índice en classify; detalle en tools |
| BSUID sin historial | Tag `bsuid_only`; memoria crece al compartir contacto |

---

## Decisión abierta

1. **¿Un solo agente vendedor con playbook por tag, o agentes separados (vendedor / histórico)?**  
   Recomendación: **un vendedor** + `playbook_id` en prompt; histórico como sub-modo `active_order_support` para no duplicar grafos.

2. **¿Dónde persiste spam a largo plazo?**  
   Recomendación: `res.partner.comment` meta + optional Odoo Studio boolean `x_wa_spam_block`.

3. **¿Consultar conversaciones en cada Start o solo on-demand?**  
   Recomendación: **on-demand** (tool) + en Start solo contador + último resumen **si tier ≠ cold**.

4. **¿TTL prospecto 7, 14 o 30 días?**  
   Recomendación: **14 días** sin actividad para pasar a `cold_prospect`; opp `interes_confirmado` extiende a 30 días (staff aún debe cerrar).

---

## Referencias

- `kapso/docs/session_and_handoff.md` — identidad tel + BSUID
- `kapso/vars_contract.md` — `session.continuity`, `orders`, `spam_profile`
- `kapso/functions/classify_contact_odoo.js` — classify actual
- `kapso/prompts/agent_customer_history_v3.md` — agente histórico
- `kapso/functions/lib/kapso_session_hydrate.js` — hydrate quote
