# Adjuntos — pedido (`sale.order`) → tarea (`project.task`)

## Comportamiento actual (Odoo Life)

| Momento | Qué pasa |
|---------|----------|
| SO en **borrador** | Aún **no** existe tarjeta en proyecto (la tarea se crea al **confirmar** el presupuesto, vía ventas + proyecto). |
| Fotos en el chatter del SO | Quedan en `ir.attachment` con `res_model=sale.order`. **No** se replican solas a la tarea. |
| Módulo Print QC | Si en la tarea falta Excel o PDF, puede **leer** el `.xlsx` o PDF del SO vinculado como fallback — **no** copia JPEG de referencia. |

Ejemplo real (S02526): `lista.jpeg` y `referencia_diseno.jpeg` están en el SO **y** en la tarea porque se copiaron manualmente o con script; no es automático por defecto.

---

## ¿Se puede pasar el adjunto sin volver a subir?

**Sí**, con una automatización Studio (recomendado) o un script puntual.

### Opción A — Automatización al subir archivo al pedido (recomendada)

**Modelo:** `ir.attachment`  
**Trigger:** On create  
**Apply on:** `[('res_model', '=', 'sale.order')]`  
**Acción:** Execute Code

```python
Attachment = env['ir.attachment'].sudo()
Task = env['project.task'].sudo()

for att in records:
    if att.res_model != 'sale.order' or not att.res_id:
        continue
    order_id = att.res_id
    tasks = Task.search([('sale_order_id', '=', order_id)], limit=1)
    if not tasks:
        continue
    task = tasks[0]
    # Evitar duplicar si ya existe mismo nombre en la tarea
    existing = Attachment.search([
        ('res_model', '=', 'project.task'),
        ('res_id', '=', task.id),
        ('name', '=', att.name),
    ], limit=1)
    if existing:
        continue
    att.copy({
        'res_model': 'project.task',
        'res_id': task.id,
    })
    log('Adjunto %s copiado SO %s -> task %s' % (att.name, order_id, task.id))
```

Así, si subes la foto al pedido **después** de confirmarlo (y ya existe la tarea), el archivo aparece en la tarjeta sin resubir.

### Opción B — Al confirmar el SO (una sola vez)

**Modelo:** `sale.order`  
**Trigger:** On update (estado → `sale`)  
**Acción:** copiar todos los adjuntos del SO a la tarea recién creada.

Útil para lo que ya estaba en el pedido antes de confirmar; la opción A cubre también subidas posteriores.

### Opción C — Agente / script MCP

Al ingresar pedido: adjuntar al SO en borrador; tras confirmación manual, ejecutar copia a tarea (como en `scratch/complete_valentina_silva_s02526.py`). Menos cómodo que A.

---

## Agente Cursor (ingreso MCP)

- Subir referencias al **chatter del SO** (`ir.attachment` → `sale.order`).
- **No** confirmar el SO.
- Avisar: *"Cuando confirmes el presupuesto en Odoo, la tarea se creará; con la automatización A los adjuntos del pedido pasan solos a la tarjeta."*
- Si no hay automatización: indicar copiar manualmente o pedir implementar la regla Studio en test/prod.
