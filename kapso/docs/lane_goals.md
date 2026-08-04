# Goals de carril — Kapso Life Deportes

Contrato de producto para prompts, KBs y topología. Actualizado 2026-07-16.

## Cómo entra esto a Kapso

Kapso **no lee** este archivo. Hay que proyectarlo a:

1. Prompts + KBs → `embed_agent_knowledge.js` → grafo JSON → `update-graph`
2. Edges / decides del workflow
3. Kapso Functions (`next_edge` + `vars`)

## Carril ventas (cliente WhatsApp)

**Goal:** Preseleccionar leads y **sembrar el paquete CRM** para staff. La IA hace la charla inicial (necesidad, cantidad, variantes, precio). Al interés claro llama `notificar_interes_ventas` (paquete listo para **oportunidad CRM**, no SO) y el bot **sigue en `waiting`**. El envío WhatsApp a Javier/Paola solo si `LIFE_SALES_NOTIFY_ENABLED=true` (en pruebas queda **off**). Un humano puede Compose en el hilo **sin** handoff.

| Fase | Quién | Qué hace |
|------|--------|----------|
| Apertura / cotización | IA | Hablar natural y corto; cotizar; filtrar spam |
| Interés claro (acepta precio, abono, “sí adelante”) | IA + notify | Guarda `quote.*` → `notificar_interes_ventas` (paquete CRM) + copy cierre + `enter_waiting` — **sin** handoff |
| Cliente pide persona / teléfono | Handoff | Único `handoff_to_human` + números 310/321 |
| Cierre / diseño / abono | Humano / staff | Compose en el hilo; staff abre oportunidad en carril staff con el estimado |

**Puente ventas → staff (CRM-first):** el notify debe traer cliente (teléfono + nombre solo si lo dijo), producto, cantidad, unitario/total y nota corta. Staff usa eso en el carril de ingreso para crear **oportunidad** (`opportunity_only`). El presupuesto SO llega después, con lista+refs + `HAZ PRESUPUESTO`.

**Handoff programático:** solo si el cliente lo pide explícitamente. No al aceptar cotización.

**Identidad:** el cliente ya sabe que escribe a Life. No te presentes como marca ni como IA en la apertura. Solo si preguntan: asistente virtual con IA.

**Continuidad:** en cada turno, `get_whatsapp_context` (incluye mensajes del humano). Tras `ended`/nueva ejecución, `classify-contact-odoo` rehidrata `quote` desde Kapso **y/o** `LIFE_DOSSIER_v1` en oportunidad CRM. `session.continuity.resume_hint` para retomar en una frase. No repreguntar lo ya dicho. Cotizaciones multi-semana viven en quote rico + CRM; SO solo cuando el humano confirma que van en serio.

## Carril staff (operarias / equipo Life)

**Goal:** Capturar pedidos en **CRM** y crear **presupuesto SO** solo cuando lista + referencias estén listas. Guiar cuando el formato no encaja (copiloto). Staff controla Kapso y WhatsApp **directo** — **sin** nodo `handoff` en este carril (no se hace handoff a sí mismo).

| Etapa | Cuándo | Comportamiento |
|-------|--------|----------------|
| **Oportunidad** | “Subir pedido” + cliente + estimado (o paquete de ventas) | `opportunity_only`; descripción CRM; WA corto + link |
| **Refino** | Excel/fotos/ajustes | Actualizar descripción CRM; sin narrar tools |
| **Presupuesto** | Lista+refs OK + `HAZ PRESUPUESTO` | SO draft ligado a oportunidad + Formulario |
| **Rutas predeterminadas** | Formatos conocidos | Tools determinísticas; respuestas **cortas** |
| **Agente general** | Formato raro / cómo interpretar | Copiloto; sin narrar cada tool |

Hard rules: solo SO **draft**; nunca `action_confirm`; WA sin pensamiento interno de tools. **Aprobación cliente** = fase 2 (ADR 0008). Tras crear SO, resume vuelve al agente salvo ack corto.
