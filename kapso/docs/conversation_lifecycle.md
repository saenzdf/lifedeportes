# Ciclo de conversación — WhatsApp 24h + Kapso + Odoo

## Ventana de 24 horas (WhatsApp Business)

Meta solo permite mensajes **libres** (sin plantilla) dentro de las **24 horas** desde el último mensaje del usuario. Después hay que reabrir con **plantilla aprobada** (`send_template`).

En Kapso esto se refleja así:

| Capa | Alcance | Qué guarda |
|------|---------|------------|
| **Kapso agent + `enter_waiting`** | Misma ejecución, ~24h de actividad | Contexto del agente (turnos recientes, vars del workflow) |
| **Odoo** | Largo plazo | Partner, pedidos, SO, tarjetas proyecto, diseños |
| **Nueva ejecución inbound** | Cada mensaje tras `handoff` o `ended` | Re-clasifica contacto (`classify-contact-odoo`) y rehidrata vars desde Odoo |

## Patrón Kapso recomendado (multi-turn)

1. **`enter_waiting`** — pausa el workflow en el mismo nodo agente; el usuario responde y el agente **retoma con contexto** (no reinicia el grafo desde Start).
2. **`complete_task`** — solo cuando el agente **termina su tarea** y el grafo debe avanzar (router, write, handoff).
3. **No usar `complete_task` + loop** para charla cotidiana; eso re-ejecuta edges y puede confundir el estado.

Referencias: [Agent node — enter_waiting](https://docs.kapso.ai/docs/flows/step-types/agent-node), [Handoff node](https://docs.kapso.ai/docs/flows/step-types/handoff-node).

## Life Deportes — decisión v8

### Cliente (vendedor + histórico)

- Consultas y venta gradual: **`enter_waiting`** entre turnos.
- Al cerrar interés / escalar: `save_variable intent_next` → `complete_task` → **Handoff cliente** (inbox abierto para humano).
- Historial largo: **Odoo** (`classify-contact-odoo`, tools scoped). Kapso no duplica años de pedidos en vars.

### Staff

- Consultas (`staff general`): **`enter_waiting`**; `route-staff-post` solo si pide subida (`staff_upload_*`).
- Tras subida OK / blocked / nómina: `send_text` → **Handoff staff** (inbox abierto). **No** vuelve al agente general (evita loop que “reinicia” la sesión staff).
- Nueva subida: nuevo mensaje `SUBIR PEDIDO` → nueva ejecución desde Start (comando explícito).

### Por qué handoff y no “cerrar” (por ahora)

Handoff deja la conversación en inbox con estado `handoff` para que un humano continúe sin que el bot envíe más mensajes. Cerrar (`ended`) cortaría ese hilo operativo. Ambas líneas usan handoff al terminar tareas de escritura o escalamiento.

Futuro opcional: staff `ended` tras subida exitosa; cliente sigue en `handoff`.

## Eventos útiles (debug)

- `whatsapp.conversation.inactive` — sin mensajes X minutos
- `whatsapp.conversation.ended` — cierre (manual, agente o 24h inactividad)

## Variables de continuidad en Odoo

| Variable Kapso | Origen Odoo |
|----------------|-------------|
| `vars.user.partner_id` | `classify-contact-odoo` |
| `vars.user.contact_segment` | ventas / tarjetas activas |
| `vars.order.*` | último pedido / estado |
| `vars.quote.*` | sesión actual (corto); persistir en SO al write |
