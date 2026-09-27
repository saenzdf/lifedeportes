# Arquitectura del grafo — Life Deportes (Kapso)

**Workflow:** `lifedeportes_sales_inbound` (`8995b14c-d852-4fb3-bceb-8a51a6ccc2c6`)  
**Dueño del layout:** Diego (edición en UI Kapso). **No bulldozear** carriles ni reañadir decides de cliente.

---

## Principio 1: un mensaje WhatsApp = una ejecución desde Start

Cada mensaje entrante dispara el workflow desde **Start**. El agente responde y cierra el turno con **`enter_waiting`**. El siguiente mensaje **no continúa el mismo run**: vuelve a entrar por guards → classify → agente.

```
Start → policy-guard-input → staff-allowlist-check → route-user-entry
  → (cliente) classify-contact-odoo → wait_customer_burst → decide burst
                  └ timeout → ensure-crm-from-quote → resolve-business-hours → agente vendedor
  → (staff)   wait_staff_burst (1s) → decide burst [timeout] → staff-hermes-forwarder → Hermes local
```

---

## Principio 2: carril cliente SIN decisiones post-agente (2026-06-17)

Diego eliminó los nodos **Decision** después de los agentes **vendedor** e **histórico**. Motivo: confundían el debug; el re-trigger ya enruta cada turno.

### Comportamiento acordado

| Fase | Qué pasa |
|------|----------|
| Chat normal | Agente responde → **`enter_waiting`** → fin de ejecución |
| Siguiente mensaje | Nuevo trigger → classify → **mismo carril** (vendedor o histórico según Odoo + vars) |
| Cierre venta | Agente guarda `quote.*` → **`handoff_to_human`** (inbox humano valida / staff sube pedido) |
| Tras SO + tarjeta en Odoo | `classify-contact-odoo` ve `existing_customer` → agente **histórico** |

**No reintroducir** en el carril cliente:

- `route-intent-next` post-vendedor / post-histórico
- Bucles `continue_chat` agente ↔ decide ↔ agente
- `complete_task` para seguir charlando

### Router que SÍ queda en cliente (solo entrada)

| Nodo | Rol |
|------|-----|
| `classify-contact-odoo` | Partner, segmento, pedidos/tarjetas activas |
| `route-customer-entry` | `new_customer` → **vendedor**; `existing_customer` → **histórico**; `returning_sale` (var persistida) → **vendedor** vía edge `new_customer` |

Lógica `returning_sale` en `route_customer_entry.js`: si histórico guardó `customer_line=returning_sale`, el **siguiente** mensaje va a vendedor sin decide intermedio.

### Handoff cliente

- Herramienta del agente: **`handoff_to_human`** (no depende de decide post-agente).
- Nodo grafo `handoff_general` solo si sigue cableado; si no, la tool abre inbox igual.

---

## Principio 3: carril staff = Hermes local (2026-09-16)

Grafo: `workflow_lifedeportes_sales_inbound_v10.json` · Doc: `kapso/docs/staff_hermes_bridge.md`

**Entrada:** teléfono staff en allowlist (o test con `LIFE_FORCE_STAFF_LANE`). **No** requiere abrir inbox del cliente.

```
Start → policy → allowlist → route-user-entry [staff]
  → wait_staff_burst (1s, debounce del hilo)
  → decide burst: user_input → re-wait | timeout → staff-hermes-forwarder (webhook Hermes `staff-assistant`)
  → wait_staff_lane (espera el próximo mensaje) → reengancha el burst
```

- Kapso **no decide nada** del staff: no crea CRM/SO, no parsea listas, no maneja nómina ni compras.
  Todo eso vive en el agente staff de Hermes local (MCP Odoo + repo).
- Sin camino legacy de subida en Kapso (se retiró para evitar doble SO).
- **Sin reintroducir** `agent_1780762885818`, `detect-staff-upload-command`, `route-staff-entry`,
  la cadena `validate-staff-write → build-quote-payload → odoo-create-lead-and-so`, nómina ni
  `route-staff-registration` (todas en `ARCHIVED_FUNCTION_NAMES`).
- El deploy unificado ya no embebe prompt/KB de staff (`embed_agent_knowledge.js --agent staff` = no-op).

---

## Layout visual (debug)

```
                    [Start]
                       |
              [policy-guard-input]
                       |
            [staff-allowlist-check]
                       |
              [route-user-entry]
                 /            \
           customer            staff
              |                  |
    [classify-contact-odoo]  [wait_staff_burst 1s]
              |                  |
    [wait_customer_burst]    [decide burst] --user_input--> (re-wait)
              |                  |
      [decide burst]        [staff-hermes-forwarder] → Hermes local (webhook)
        |        |               |
   timeout      end        [wait_staff_lane] --next--> (re-wait)
        |        |
 [ensure-crm-from-quote] [end-quiet-customer]
        |
 [resolve-business-hours]
        |
   [agente vendedor] (enter_waiting)
```

Sin flechas de vuelta desde el vendedor a nodos Decision.

---

## Ciclo de vida del cliente (para test)

1. **Nuevo** → vendedor → cotiza → `enter_waiting` en cada turno.
2. **Cierra interés** → `quote.*` + `handoff_to_human`.
3. **Staff** escribe al WA Life con datos del cliente (no inbox) → SO borrador en Odoo.
4. **Cliente escribe de nuevo** → `existing_customer` → **histórico** (tarjeta, estado, diseños).
5. **Quiere otro pedido** → histórico guarda `customer_line=returning_sale` + `enter_waiting` → siguiente mensaje → **vendedor**.

---

## Agente: tools en carril cliente

| Tool | Cuándo |
|------|--------|
| `enter_waiting` | Casi siempre al terminar el turno |
| `handoff_to_human` | Cierre de venta (tras frase de cierre), escalado, o fuera de alcance |
| `buscar_producto_odoo` | Vendedor, Fase 3 |
| `ask_about_file` | Archivo en el último mensaje (no audio) |
| Transcript audio | Kapso automático en mensaje; ver `kapso/docs/kapso_voice_media_standard.md` |
| `complete_task` | **Evitar** en cliente salvo que el grafo lo exija explícitamente |

---

## Sync repo ↔ Kapso

Camino único (pull → embed → tests → validate → push):

```bash
bash kapso/scripts/deploy_graph_kb_progressive.sh
# deja el workflow en active (si quedó draft: update-workflow-settings.js <WF_ID> --lock-version <n> --status active)
```

Edición puntual: `get-graph.js` → editar → `validate-graph-lifedeportes.js` → `update-graph.js --expected-lock-version`.

**Regla:** topología = UI Kapso. `embed_prompts_v8.js` está retirado (apuntaba a v8); no usarlo.

---

## Tests

- Staff automatizado: `kapso/tests/staff_flow_matrix.md`
- Cliente manual/debug: `kapso/tests/customer_flow_matrix.md`
