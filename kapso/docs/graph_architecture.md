# Arquitectura del grafo — Life Deportes (Kapso)

**Workflow:** `lifedeportes_sales_inbound` (`8995b14c-d852-4fb3-bceb-8a51a6ccc2c6`)  
**Dueño del layout:** Diego (edición en UI Kapso). **No bulldozear** carriles ni reañadir decides de cliente.

---

## Principio 1: un mensaje WhatsApp = una ejecución desde Start

Cada mensaje entrante dispara el workflow desde **Start**. El agente responde y cierra el turno con **`enter_waiting`**. El siguiente mensaje **no continúa el mismo run**: vuelve a entrar por guards → classify → agente.

```
Start → policy-guard-input → staff-allowlist-check → route-user-entry
  → (cliente) classify-contact-odoo → route-customer-entry → agente
  → (staff) detect-staff-upload-command → route-staff-entry → agente / write
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

## Principio 3: carril staff (v10 — línea única, canal directo)

Grafo: `workflow_lifedeportes_sales_inbound_v10.json` · Doc: `kapso/docs/staff_graph_v10.md` · Prompt: `agent_staff_upload_v5.md`

**Entrada:** teléfono staff en allowlist (o test con `LIFE_FORCE_STAFF_LANE`). **No** requiere abrir inbox del cliente.

```
Start → policy → allowlist → route-user-entry [staff]
  → agente ingreso pedido (preprocesa con tools del agente)
  → validate-staff-write → route-staff-write
       ok → build-quote-payload → odoo-create-lead-and-so → send → handoff fin staff
       blocked → send → handoff fin staff
```

Sin `detect-staff-upload-command`, `route-staff-entry`, agente general, nómina ni `route-staff-registration`.

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
    [classify-contact-odoo]  [detect-staff-upload-command]
              |                  |
    [route-customer-entry]   [route-staff-entry]
         /         \              ...
   [vendedor]  [histórico]     [staff general / upload / write chain]
      (fin)       (fin)
   enter_waiting  enter_waiting
```

Sin flechas de vuelta desde vendedor/histórico a nodos Decision.

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

```bash
# SIEMPRE primero si editaste en UI
node ~/.agents/skills/automate-whatsapp/scripts/get-graph.js 8995b14c-d852-4fb3-bceb-8a51a6ccc2c6 \
  > kapso/workflow_lifedeportes_sales_inbound_v8_session.json

node kapso/scripts/embed_prompts_v8.js   # solo prompts

node ~/.agents/skills/automate-whatsapp/scripts/update-graph.js ...  # solo si publicas
```

**Regla:** topología = UI Kapso. `embed_prompts_v8.js` no toca edges.

---

## Tests

- Staff automatizado: `kapso/tests/staff_flow_matrix.md`
- Cliente manual/debug: `kapso/tests/customer_flow_matrix.md`
