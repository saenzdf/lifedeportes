# ADR 0008 — Staff: oportunidad CRM antes de presupuesto SO

Fecha: 2026-07-16  
Estado: aceptado; implementación fase 1 en Kapso (Odoo test)

## Contexto

El carril staff creaba `crm.lead` + `sale.order` draft juntos tras `CONFIRMO SUBIR`, y el agente narraba cada tool en WhatsApp. El proceso real es: capturar interés en CRM con estimado, refinar lista/adjuntos en la oportunidad, y solo entonces armar presupuesto.

## Decisión

Etapas:

1. **Oportunidad** — Al “subir pedido” con cliente + estimado comercial. `write_mode=opportunity_only`. Sin pedir confirmación extra de interés. Sin exigir lista de jugadores.
2. **Refino** — Actualizar `crm.lead.description` con Excel/lista/lo disponible. WhatsApp sin narración de tools.
3. **Presupuesto** — `write_mode=sale_order` solo con lista completa + referencias/adjuntos + intent `HAZ PRESUPUESTO` (o `CONFIRMO PRESUPUESTO`). SO draft ligado a `opportunity_id` + Formulario Life.
4. **Aprobación del cliente** — **Fase 2 (no implementada).** Idea: al pasar a presupuesto, pedir/registrar aprobación del cliente para **bloquear cambios esperados**; corrección interna sigue posible pero no se anticipa. Documentar en wiki hasta implementar flujo WA/UI.

WhatsApp: solo ack corto + resumen comercial + link CRM/SO. Detalle de lista → descripción CRM / nota SO.

## Consecuencias

- `odoo-create-lead-and-so` soporta `opportunity_only` vs `sale_order`.
- `validate-staff-write` / `route-staff-lane-resume` distinguen gates.
- Prompt staff v10 CRM→presupuesto; embed vía `embed_agent_knowledge.js --agent staff`.
- Runners E2E que esperan SO inmediato tras CONFIRMO SUBIR deben actualizarse a oportunidad → HAZ PRESUPUESTO.

## Pendiente fase 2

- Flujo de aprobación cliente (WhatsApp o portal) al crear/enviar presupuesto.
- Señal en Odoo (etapa/campo) “aprobado por cliente / cambios no esperados”.
