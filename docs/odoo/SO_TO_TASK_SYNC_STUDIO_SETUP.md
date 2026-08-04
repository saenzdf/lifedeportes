# Copiar nota y adjuntos de SO a tarea — Odoo 19 Studio

Al **crear** una tarea de proyecto vinculada a un pedido de venta (línea **Diseño** / servicio), copia la nota interna del SO a la descripción de la tarea y **reubica** los adjuntos del SO en la tarea (sin duplicar archivos).

## Trigger de negocio

1. Se confirma una SO con producto servicio **Diseño** → Odoo crea automáticamente una `project.task`.
2. La operaria confirma / valida la tarea en el proyecto (Javier o Paola).
3. **Al crear la tarea**, la automatización:
   - Copia `sale.order.note` → `project.task.description` (solo si la tarea aún no tiene descripción).
   - Mueve `ir.attachment` con `res_model='sale.order'` al registro de la tarea (`res_model='project.task'`, `res_id=task.id`).

Los adjuntos **no se duplican**: se cambia el vínculo para que aparezcan en la pestaña Adjuntos de la tarea y dejen de listarse en el SO.

## Configuración

| Campo | Valor |
|-------|-------|
| **Nombre** | `Copiar nota y adjuntos SO a tarea` |
| **Modelo** | `project.task` |
| **Trigger** | `on_create` (*On Creation*) |
| **Apply on** | `[('sale_order_id', '!=', False)]` |
| **Acción** | Execute Code |

Mismo patrón de dominio que la regla existente **Fechas de producción** (`base.automation` id 15).

## Configuración manual en Studio

1. **Studio** → app **Proyecto** → abrir una **Task** con SO vinculado → **Studio**
2. **Automations** → **New**
3. Nombre: `Copiar nota y adjuntos SO a tarea`
4. **Trigger:** On Creation (`on_create`)
5. **Apply on domain:** `[('sale_order_id', '!=', False)]`
6. **Actions to do** → **Execute Code**

### Código Python (safe_eval)

Sin `import`, sin lambdas en `filtered()`.

```python
for task in records:
    order = task.sale_order_id
    if not order and task.sale_line_id:
        order = task.sale_line_id.order_id
    if not order:
        continue

    note = order.note or ''
    if note and not (task.description or '').strip():
        task.write({'description': note})

    attachments = env['ir.attachment'].search([
        ('res_model', '=', 'sale.order'),
        ('res_id', '=', order.id),
    ])
    if attachments:
        attachments.write({
            'res_model': 'project.task',
            'res_id': task.id,
        })
        log(
            'SO→tarea: %s adjuntos de %s → tarea %s'
            % (len(attachments), order.name, task.id)
        )
```

### Campos usados

| Modelo | Campo | Uso |
|--------|-------|-----|
| `sale.order` | `note` | Nota interna / lista HTML del pedido |
| `project.task` | `description` | Descripción de la tarea |
| `project.task` | `sale_order_id` | Vínculo SO ↔ tarea |
| `ir.attachment` | `res_model`, `res_id` | Reubicación de adjuntos |

## Reglas activas

### Producción (`life-soluciones.odoo.com`)

| Campo | Valor |
|-------|-------|
| **Automatización** | `Copiar nota y adjuntos SO a tarea` (`base.automation` id **25**) |
| **Acción servidor** | `Copiar nota y adjuntos SO a tarea` (`ir.actions.server` id **1539**) |
| **Modelo** | `project.task` |
| **Trigger** | `on_create` |
| **Apply on** | `[('sale_order_id', '!=', False)]` |
| **Acción** | Execute Code |

### Test

Pendiente cuando la instancia test esté activa (`python scripts/setup_so_to_task_sync.py test`).

## Pruebas

1. Crear SO borrador con línea **Diseño** y nota HTML en **Términos y condiciones / Nota**.
2. Subir 1–2 adjuntos al SO (Excel, imagen).
3. Confirmar la SO → se crea la tarea en el proyecto.
4. Verificar:
   - Descripción de la tarea = nota del SO.
   - Adjuntos visibles en la tarea.
   - Adjuntos ya no aparecen en el SO (o la lista quedó vacía).
5. Confirmar que otras reglas `on_create` siguen OK (**Fechas de producción**, **Default diseñador Paola**).

## Notas

- Solo mueve adjuntos con `res_model='sale.order'`. Archivos pegados en el **chatter** del SO pueden estar en `mail.message`; si hace falta incluirlos, ampliar la búsqueda en una segunda iteración.
- Si la tarea ya tiene descripción al crearse, **no se sobrescribe** (idempotente con Kapso u otras fuentes).
- Script de despliegue: `scripts/setup_so_to_task_sync.py`

## Relación con otras automatizaciones

| Regla | Trigger | Dominio |
|-------|---------|---------|
| Renombrar Tarea proveniente de Servicio | `on_create_or_write` | — |
| Fechas de producción | `on_create` | `sale_order_id != False` |
| Default diseñador Paola | `on_create` | proyecto Paola |
| **Copiar nota y adjuntos SO a tarea** | `on_create` | `sale_order_id != False` |
