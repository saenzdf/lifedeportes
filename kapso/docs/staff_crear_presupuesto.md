# Staff WhatsApp → presupuesto SO (crear_presupuesto_odoo)

Fecha: 2026-07-29  
Estado: **activo** · function `crear-presupuesto-odoo` · grafo lock ≥ **1415**

## Qué puede decir Javier (staff)

Desde su número allowlist:

| Frase | Efecto |
|-------|--------|
| `HAZ PRESUPUESTO de Emmanuelle` | Busca CRM + crea SO draft |
| `crear presupuesto Daniel Tovar` | Igual |
| `pasar a presupuesto opp 3607` | Por id CRM |
| `presupuesto de CHINO` | Por nombre |

## Qué hace la tool

1. Resuelve `crm.lead` (Asistente Kapso / Canal Ventas).
2. Crea o reusa `sale.order` **draft** (Plantilla venta + Diseño $0).
3. Copia adjuntos CRM → SO.
4. Si hay `order_draft.commercial.resolved_lines` (lista parseada en el hilo) → líneas producto.
5. Si no hay líneas pero sí `quote.quantity` + producto → línea fallback (cotización).
6. Mueve opp a **Proposition** (id 3) si estaba en Kapso/Ventas.
7. Invoca webhook `on-odoo-presupuesto` para organizar Excel/Word/PDF FORMATO LIFE → `sale.order.note`.

**Nunca** confirma el SO (`action_confirm`).

## Relación con el flujo Daniel Tovar

| Paso | Daniel Tovar (S02792) | Tool nueva |
|------|----------------------|------------|
| CRM + lista/adjuntos | Opp **3578** + PDF | Misma opp/adjuntos |
| Presupuesto | Kapso writer / Proposition | `crear_presupuesto_odoo` o Proposition en Odoo |
| Lista en note | webhook `formato_life_pdf_v1` | Mismo webhook |
| Productos | líneas Kapso / API | `resolved_lines` o quote fallback |

Si el hilo trae Excel/fotos **nuevos**, el agente primero parsea + `registrar_adjuntos` y luego llama la tool (o `complete_task` sale_order).

## Deploy

```bash
node kapso/scripts/deploy_crear_presupuesto_odoo.js
node kapso/scripts/embed_agent_knowledge.js --agent staff
# + update-graph (lock actual)
```

Function id: `7dbccd1b-e754-4e71-8d9c-6bc9df3c3dd5`

## Prueba 2026-07-29

Invoke `lead_id=3607` Emmanuelle → **S02821** draft, stage Proposition, 7× producto fallback + Diseño.
