# CÓDIGO CORRECTO PARA STOCK.MOVE - VERSIÓN FINAL
# Archivo: scripts/development/Entrega-cambio-tarea.py
# Automatización: Cambio de etapa cuando stock.move se completa

# 1. El 'record' aquí es el Stock Move que se acaba de completar
move = record

# 2. Verificar que el movimiento tenga origen
if move.origin:
    # 3. Buscar la Orden de Venta que originó este movimiento
    sale_order = env['sale.order'].search([('name', '=', move.origin)], limit=1)
    
    if sale_order:
        # 4. Buscar tareas asociadas a este movimiento/sale order
        tasks = env['project.task'].search([
            ('sale_line_id', 'in', sale_order.order_line.ids),
            ('stage_id.name', '=', 'Cobro y entrega')
        ])
        
        for task in tasks:
            # 5. Buscar la etapa "Hecho" en el proyecto de la tarea
            done_stage = env['project.task.type'].search([
                ('project_ids', '=', task.project_id.id),
                ('name', '=', 'Hecho')
            ], limit=1)
            
            if done_stage:
                # 6. Mover la tarea a la etapa "Hecho"
                task.write({
                    'stage_id': done_stage.id
                })
                
                # 7. Registrar mensaje de trazabilidad
                try:
                    message_body = 'Movimiento completado: ' + str(move.name)
                    task.message_post(body=message_body)
                except:
                    pass
                
                # 8. Registrar en la orden de venta
                try:
                    sale_message = 'Tarea actualizada tras completar movimiento: ' + str(task.name)
                    sale_order.message_post(body=sale_message)
                except:
                    pass

# NOTA: Este código funciona con stock.move (movimientos de stock)
# que se crean cuando se confirma un pedido de venta