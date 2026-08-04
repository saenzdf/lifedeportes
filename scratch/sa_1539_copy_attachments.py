for task in records:
    order = task.sale_order_id
    if not order and task.sale_line_id:
        order = task.sale_line_id.order_id
    if not order:
        continue

    # Lista: la tarea es la fuente de verdad operativa. Si el SO tiene note (lista),
    # copiarla SIEMPRE a la tarea (staff puede editar después en la tarea).
    note = order.note or ''
    if note and note.strip():
        task.write({'description': note})

    # Mover (no copiar) adjuntos SO → tarea para no duplicar
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
