# Retomar oportunidad CRM manual (Canal Ventas) — staff

Staff crea a mano opps en **Canal Ventas**. Kapso **no** debe crear otra: retoma la misma y completa lista/fotos → presupuesto.

## Flujo

1. Staff: «retomar CHINO» / «completar oportunidad ACEROS» / «opp 3574» + Excel/fotos.
2. `buscar_oportunidad_odoo` → deja `vars.lead.id` + `vars.crm.opportunity_id`.
3. Parse lista / `registrar_adjuntos_pedido` / fusionar (igual que pedido nuevo).
4. `complete_task` con `write_mode=opportunity_only` → actualiza **esa** opp (brief + adjuntos). No duplica.
5. Cuando listo: **HAZ PRESUPUESTO** / «crear presupuesto de {nombre}» → tool **`crear_presupuesto_odoo`** (preferido) o `write_mode=sale_order` + `complete_task`. Mueve a Proposition, SO draft + adjuntos + lista.

## Hard rules

- **Oportunidad por nombre:** Si piden buscar o retomar una oportunidad CRM, buscar **únicamente por el NOMBRE DEL PEDIDO / EQUIPO / CLIENTE**. **NUNCA usar números de oportunidad (Lead ID)** para evitar confusiones con el número de pedido SO.
- Si hay opp abierta en Canal Ventas / Asistente Kapso con ese nombre o teléfono → **reutilizar**.
- `buscar_oportunidad_odoo` setea `quote.customer_display_name` desde el nombre de la opp (`Oportunidad de X` → `X`). **No** repreguntar nombre ni pedir CONFIRMO por nombre.
- Nombres Odoo suelen ser `Oportunidad de X`; la tool matchea `X` y `Oportunidad de X`.
- **No renombrar** la opp ni el pedido (studio / tarea) salvo que staff diga explícitamente el nombre nuevo. El nombre staff manda sobre diseño, Excel o equipo en foto.
- Lista → tarea + note SO; **no** pisar description CRM con HTML de lista.
- Sin `S0…` todavía → este carril (CRM). Con `S0…` → `buscar_pedido_odoo` / corrección.

## Tools

| Tool | Uso |
|------|-----|
| `buscar_oportunidad_odoo` | Nombre del cliente/equipo o teléfono (NUNCA número Lead ID) |
| `crear_presupuesto_odoo` | Presupuesto SO draft desde opp (nombre / id). Paridad Proposition + lista |
| Parse / registrar / fusionar | Igual que lista staff |
| Writer (`odoo-create-lead-and-so`) | Respeta `vars.lead.id` (alternativa a crear_presupuesto) |
| `buscar_pedido_odoo` | Solo si ya hay presupuesto S0… |
