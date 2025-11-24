# 🚚 Automatización Odoo 19: Stock Move → Cambio de Etapa de Tareas

## 📋 Resumen del Proyecto

Se ha creado una **automatización para Odoo 19** que detecta cuando un **movimiento de stock** (`stock.move`) se marca como realizado y automáticamente mueve las tareas asociadas desde la etapa **"Cobro y entrega"** hacia la etapa **"Hecho"**.

## 🎯 Funcionalidad

Esta automatización se ejecuta cuando:
- Se completa un movimiento de stock (línea de entrega)
- El movimiento fue creado al confirmar un pedido de venta
- Existen tareas asociadas al mismo pedido

## 📁 Archivo Principal

### **`Entrega-cambio-tarea.py`** ⭐ **ARCHIVO PARA COPIAR**
- **Descripción:** Código para automatizaciones de `stock.move`
- **Contenido:** Automatización completa con verificaciones de seguridad
- **Modelo:** `stock.move`
- **Uso:** Copiar y pegar directamente en automatización de Odoo

## 🔧 Configuración en Odoo 19

### Paso 1: Crear Automatización

1. Ir a **Configuración > Técnico > Automatizaciones > Automatizaciones de Servidor**
2. Crear nueva automatización
3. **Nombre:** "Cambio de etapa cuando movimiento se completa"
4. **Modelo:** `stock.move` ⭐ **IMPORTANTE: No stock.picking**
5. **Trigger:** `On Write`
6. **Activado:** ✅
7. **Filtro:** `state = 'done' AND move_type = 'direct'`

### Paso 2: Código Python

**Copiar TODO el contenido del archivo `Entrega-cambio-tarea.py`:**

```python
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
```

### Paso 3: Configurar Etapas

En cada **Proyecto > Configuración > Etapas de Tareas**:
- **"Cobro y entrega"** (secuencia ~30)
- **"Hecho"** (secuencia ~40)

## 🧪 Prueba de Funcionamiento

### Escenario de Prueba:
1. **Crear pedido de venta** → genera movimientos de stock automáticamente
2. **Verificar tareas** en etapa "Cobro y entrega"
3. **Completar movimiento** → marcar como realizado
4. **Verificar** que tareas cambien a "Hecho"

## ✅ Beneficios

- **Automatización completa** del flujo de entrega
- **Reducción de trabajo manual** en cambios de etapa
- **Trazabilidad** con mensajes automáticos
- **Consistencia** en el proceso
- **Escalable** para cualquier volumen

## 🔍 Diferencia Clave: stock.move vs stock.picking

| Aspecto | stock.move | stock.picking |
|---------|------------|---------------|
| **Cuándo se crea** | Al confirmar pedido | Al validar entrega |
| **Qué representa** | Línea de producto individual | Documento de entrega |
| **Trigger** | Durante confirmación | Durante entrega |
| **Automatización** | **✅ Recomendado** | ❌ Muy específico |

---

**¡La automatización está lista para funcionar con stock.move!** 🎉