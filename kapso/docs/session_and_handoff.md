# Sesión WhatsApp, memoria y handoff (Kapso)

## Continuidad multi-semana (pedido vivo)

WhatsApp Business corta mensajes **libres salientes** a 24h desde el último inbound. El cliente **no** debe sentir un corte: al volver a escribir, el bot retoma como el vendedor humano.

| Capa | Qué guarda | Duración |
|------|------------|----------|
| `vars.quote` (rico: `lines`, `variants`, `notes`, `media_refs`, `revision`) | Cotización en construcción | Mientras ejecución `waiting` / hydrate tras `ended` |
| **LIFE_DOSSIER_v1** en descripción oportunidad CRM | Misma verdad a 15+ días | Hasta presupuesto / ganado-perdido |
| Odoo SO + Formulario | Solo cuando van a pagar / lista+refs + humano | Pedido formal |

**Hydrate:** `classify-contact-odoo` reinyecta el quote más rico entre (1) última ejecución Kapso del **mismo teléfono** (filtro client-side obligatorio; la API `phone`/`q` a veces devuelve hilos ajenos) y (2) dossier CRM abierto. `session.continuity.resume_hint` ayuda al agente a retomar en una frase. Si el cliente niega historial (“primera vez”), el prompt manda disculparse y no insistir.

**Prohibido:** `complete_task` en despedida (deja `ended` y corta la sesión viva). Siempre `enter_waiting`.

**No** usar wiki Sync/Obsidian por cliente (privacidad + doble fuente). Sync wiki solo documenta el contrato.

## Ventana de 24 horas (WhatsApp Business)

Meta limita mensajes **libres** (texto, media) a una ventana de **24 h** desde el último mensaje **del cliente**. Fuera de esa ventana solo entran **plantillas** aprobadas.

| Capa | Qué guarda | Duración |
|------|------------|----------|
| **Kapso execution** | `vars.*`, contexto del agente, `enter_waiting` | Mientras la ejecución está `running` / `waiting` |
| **Kapso handoff** | Hilo en inbox; automatización **pausada** | Hasta que un humano cierre o reanude |
| **Odoo** | Partner, pedidos, tarjetas proyecto, diseños | Histórico largo del negocio |

### Cómo lo maneja Kapso (estándar)

1. **Un mensaje entrante** en una conversación con ejecución `waiting` (agente con `enter_waiting`) **reanuda** la misma ejecución — no empieza de cero.
2. Si la ejecución está en **`handoff`**, los mensajes entrantes **no** pasan por el workflow; los atiende un humano en el inbox de Kapso.
3. Si no hay ejecución activa (o la anterior terminó / conversación WhatsApp `ended`), un mensaje nuevo **dispara** un trigger `inbound_message` → nueva ejecución desde `start` (a veces en un **conversation_id nuevo** del mismo teléfono).
4. **`classify-contact-odoo`** hace dos lecturas de memoria:
   - **Odoo:** partner, `orders.active[]`, tarjetas de proyecto.
   - **Kapso prior execution** (por teléfono): reinyecta `quote.*` / `funnel` de la última ejecución útil aunque el hilo WABA haya quedado `ended`. Resultado en `vars.session.continuity`.
5. El agente **cada turno** lee el hilo con `get_whatsapp_context` (inbound **y** outbound, incluidos mensajes del **humano** en Compose o durante handoff) y no repregunta lo ya dicho.

Referencias: [Workflow overview](https://docs.kapso.ai/docs/workflows/overview) (estados `waiting`, `handoff`, routing por conversación). Contrato de producto: `kapso/docs/lane_goals.md`.

### Pedidos activos múltiples

`vars.orders.active` lista SO en `draft|sent|sale` sin confundirlos con el quote en curso. El cliente puede **abrir un pedido nuevo** mientras otros siguen en producción; el agente pregunta el número `S0…` solo cuando el seguimiento es ambiguo.

## Patrón Life Deportes

```
Chat corto (Kapso)     →  cotización gradual, enter_waiting multi-turno
Histórico largo (Odoo) →  classify_contact, consultas scoped, SO, tarjetas
Interés claro          →  notificar_interes_ventas + waiting (sin handoff)
Pide humano            →  handoff_to_human (único handoff programático)
```

### Loops que SÍ (multi-turno dentro de la misma tarea)

| Loop | Motivo |
|------|--------|
| Staff ingreso `enter_waiting` → mismo agente | Consultas / copiloto en varios turnos (también post-SO salvo ack) |
| Cliente vendedor `enter_waiting` → mismo agente | Cotización multi-turno |
| Agente upload staff | `enter_waiting` hasta `complete_task` / corrección |

### Loops que NO

Tras **subida staff** (pedido) el resume no debe re-crear SO sin intención; pero **sí** debe volver al agente si el staff sigue preguntando (modo copiloto). Solo “gracias/ok/listo” → done.

### Cliente (vendedor)

**Multi-turno:** `agent_orquestador` cierra cada turno con `enter_waiting`; la ejecución queda **`waiting`** y el siguiente mensaje la reanuda.

**Aceptación de cotización / interés claro:** guarda `quote.*`, llama **`notificar_interes_ventas`** (WhatsApp a líneas comerciales / webhook), mensaje de cierre según horario, y **`enter_waiting`**. **Sin** handoff automático.

**Handoff programático:** solo `handoff_to_human` cuando el cliente solicita explícitamente persona/teléfono. Eso pausa la automatización.

**Intervención humana preferida:** Compose en el inbox **mientras** la ejecución está en `waiting` — el bot no se pausa; el siguiente mensaje del cliente reanuda el agente, que debe leer el hilo completo (incluido lo que escribió el humano).

**Tras handoff:** al reanudar (o nuevo inbound si `ended`), el agente lee `get_whatsapp_context` + `session.continuity` / `quote` rehidratado. No reiniciar la venta.

> Bug histórico: el edge duro `vendedor → handoff_general` dejaba Kevin/Soto en `handoff` tras el saludo; foto y “20 uniformes” no volvían a pasar por el workflow. Esas ejecuciones luego se pasaron a `ended`; Kapso considera `ended` terminal y no permite devolverlas a `waiting`.

## Flujo sencillo (producción) — 3 estados

Contrato mínimo para que el cliente **no se trabe** y pueda retomar con coherencia:

| Situación | Qué debe pasar | Señal |
|-----------|----------------|-------|
| Conversación **viva** (`waiting`) | Misma ejecución; bot lee el hilo (`get_whatsapp_context`) | Misma `execution_id` |
| Cliente pide humano | Solo entonces `handoff_to_human`; Compose humano; bot pausado | Estado `handoff` |
| Sesión **acabó** (`ended`) o hilo WABA nuevo | Nueva ejecución + **hydrate** `quote`/funnel por teléfono + Odoo | `vars.session.continuity.resumed` |
| Pedidos viejos en Odoo | `orders.active[]`; no mezclar quote nuevo con seguimiento viejo | Multi-pedido |

**Gaps vs Meta/prod:** fuera de la ventana de **24 h** solo plantillas; si vuelve un edge duro `vendedor → handoff_general`, el bot deja de ver mensajes (bug Kevin/Soto).

**Checklist revisión 2026-07-16:** vendedor sin edge saliente a `handoff_general` (grafo local); `enter_waiting` en prompt; secrets `KAPSO_*` + Odoo en `classify-contact-odoo` (sync test); doc wiki Life actualizada. Sin prueba WA cliente en esa sesión.

## Handoff vs ended vs waiting

| Estado | Automatización | Inbox humano | Nuevo mensaje cliente |
|--------|----------------|--------------|------------------------|
| `waiting` | Lista para reanudar | Compose OK (recomendado) | Reanuda misma ejecución → agente lee hilo |
| `handoff` | Detenida | Abierta | No dispara workflow; humano responde |
| `ended` | Terminada | Puede cerrarse | Nueva ejecución + hydrate por teléfono |

### Ingreso desde inbox (Jump)

Staff puede **Jump to node → Agent: Inbox ingreso pedido** (Workflow Chat, sin WhatsApp al cliente). Tras write + snapshot fidelidad (o blocked), el grafo va a **`wait_staff_lane`** — ya no existe `handoff_general` en el carril staff (2026-07-17). Detalle: `kapso/docs/inbox_ingreso_handoff.md`.

## Operación

- **Reanudar bot tras handoff:** en Kapso, pasar ejecución de `handoff` → `waiting`/`running`, o esperar nuevo inbound; el agente debe leer todo el hilo.
- **Test mode:** trigger público off; pruebas manuales en el editor (`kapso/docs/test_mode.md`).
- **Pruebas staff M1–M8:** diferidas (`kapso/tests/staff_flow_matrix.md`).
