# 🚚 Automatización: Cambio de Etapa de Tareas por Órdenes de Entrega Completadas

## 📋 Resumen

Esta automatización en Odoo 19 detecta cuando una **orden de entrega** se marca como realizada y automáticamente mueve las **tareas asociadas** desde la etapa "Cobro y entrega" hacia la etapa "Hecho", cambiando también su estado a completado.

## 🎯 Objetivo

Automatizar el flujo de trabajo para que cuando se complete una entrega:
- Las tareas que comparten el mismo origen se muevan automáticamente a la etapa "Hecho"
- El estado de las tareas cambie a "done" (completado)
- Se registren mensajes de trazabilidad en las tareas y órdenes de venta

## 📁 Archivos Incluidos

1. **`orden_entrega cambio de etapa.py`** - Script principal de automatización
2. **`configuracion_instalacion.md`** - Este archivo con instrucciones detalladas
3. **`automacion_base.xml`** - Configuración XML de respaldo (opcional)

## 🔧 Configuración en Odoo 19

### Paso 1: Acceder a Automatizaciones

1. Ir a **Configuración** → **Técnico** → **Automatizaciones** → **Automatizaciones de Servidor**
2. Hacer clic en **"Nuevo"**

### Paso 2: Configurar la Automatización

**Datos básicos:**
- **Nombre:** `Cambio de etapa cuando orden de entrega se completa`
- **Modelo:** `stock.picking` (Órdenes de Entrega)
- **Trigger:** `On Write`
- **Activado:** ✅ (marcar casilla)

**Filtro para activar automatización:**
```python
state = 'done' AND picking_type_code = 'outgoing'
```

### Paso 3: Agregar el Código

1. En el campo **"Código Python"**, copiar y pegar todo el contenido del archivo `orden_entrega cambio de etapa.py`
2. **IMPORTANTE:** Eliminar todos los comentarios de documentación y dejar solo el código de automatización

**Código limpio a copiar:**
```python
# El 'record' aquí es la Orden de Entrega (stock.picking) que se acaba de completar.
delivery_order = record

# 1. Verificar que la orden de entrega tenga un origen
if delivery_order.origin:
    # 2. Buscar la Orden de Venta que originó esta entrega
    sale_order = env['sale.order'].search([('name', '=', delivery_order.origin)], limit=1)
    
    if sale_order:
        # 3. Buscar tareas asociadas a esta orden de venta
        # Buscamos tareas que estén en el proyecto relacionado y tengan líneas de venta asociadas
        tasks = env['project.task'].search([
            ('sale_line_id', 'in', sale_order.order_line.ids),
            ('stage_id.name', '=', 'Cobro y entrega')  # Solo tareas en la etapa "Cobro y entrega"
        ])
        
        for task in tasks:
            # 4. Buscar la etapa "Hecho" en el proyecto de la tarea
            done_stage = env['project.task.type'].search([
                ('project_ids', '=', task.project_id.id),
                ('name', '=', 'Hecho')  # Buscamos la etapa llamada "Hecho"
            ], limit=1)
            
            if done_stage:
                # 5. Mover la tarea a la etapa "Hecho"
                task.write({
                    'stage_id': done_stage.id,
                    'state': 'done'  # Cambiar el estado de la tarea a "done"
                })
                
                # 6. Registrar mensaje de trazabilidad en la tarea
                task.message_post(
                    body=f"""
                    <div style="color: green; font-weight: bold;">
                        🚚 ORDEN DE ENTREGA COMPLETADA
                    </div>
                    <p>La orden de entrega <strong>({delivery_order.name})</strong> ha sido marcada como realizada.</p>
                    <p>La tarea ha avanzado automáticamente a la etapa: <strong style="color: green;">{done_stage.name}</strong></p>
                    <p><em>Fecha de automatización: {fields.Datetime.now()}</em></p>
                    """,
                    subtype_xmlid='mail.mt_note',
                    body_is_html=True
                )
                
                # 7. También registrar en la orden de venta para trazabilidad completa
                sale_order.message_post(
                    body=f"""
                    <div style="color: blue;">
                        📋 ACTUALIZACIÓN AUTOMÁTICA DE TAREA
                    </div>
                    <p>La tarea <strong>{task.name}</strong> ha sido movida automáticamente a la etapa "Hecho" 
                    después de completar la orden de entrega <strong>{delivery_order.name}</strong>.</p>
                    """,
                    subtype_xmlid='mail.mt_note',
                    body_is_html=True
                )
            else:
                # Si no se encuentra la etapa "Hecho", enviar advertencia
                task.message_post(
                    body=f"""
                    <div style="color: orange; font-weight: bold;">
                        ⚠️ CONFIGURACIÓN REQUERIDA
                    </div>
                    <p>No se encontró la etapa "Hecho" en el proyecto <strong>{task.project_id.name}</strong>.</p>
                    <p>Por favor, configure la etapa "Hecho" en el proyecto para completar la automatización.</p>
                    """,
                    subtype_xmlid='mail.mt_note',
                    body_is_html=True
                )
```

### Paso 4: Configurar Etapas en Proyectos

Para que la automatización funcione correctamente, necesitas configurar las etapas en tus proyectos:

1. Ir a **Proyecto** → **Configuración** → **Etapas de Tareas**
2. Crear o verificar que existan estas etapas:
   - **"Cobro y entrega"** (etapa donde están las tareas antes del envío)
   - **"Hecho"** (etapa destino después del envío)

**Orden de las etapas:**
```
1. Planificación
2. En Proceso
3. Cobro y entrega ← (aquí están las tareas antes de la automatización)
4. Hecho ← (aquí van las tareas después de la automatización)
```

## 🧪 Procedimiento de Pruebas

### Preparación

1. **Crear un proyecto** con las etapas mencionadas
2. **Crear una orden de venta** y generar tareas
3. **Asegurar que las tareas estén en la etapa "Cobro y entrega"**

### Ejecución de Pruebas

1. **Crear orden de venta:**
   ```
   - Cliente: Cliente de prueba
   - Producto: Producto con gestión de inventario
   - Generar orden de entrega automáticamente
   ```

2. **Verificar tareas:**
   ```
   - Las tareas deben estar en etapa "Cobro y entrega"
   - Estado: En progreso
   ```

3. **Completar orden de entrega:**
   ```
   - Ir a Inventario → Órdenes de Entrega
   - Marcar como realizado
   ```

4. **Verificar automatización:**
   ```
   - La tarea debe cambiar a etapa "Hecho"
   - Estado de la tarea: Completado
   - Mensajes de trazabilidad registrados
   ```

## 🔍 Solución de Problemas

### Problema: La automatización no se ejecuta

**Posibles causas:**
- Filtro mal configurado
- Etapas con nombres diferentes
- Permisos insuficientes

**Solución:**
1. Verificar que el filtro sea: `state = 'done' AND picking_type_code = 'outgoing'`
2. Confirmar nombres exactos de etapas: "Cobro y entrega" y "Hecho"
3. Verificar permisos de automatización del usuario

### Problema: No encuentra las tareas

**Posibles causas:**
- Tareas no asociadas a líneas de venta
- Tareas en etapas diferentes

**Solución:**
1. Verificar que las tareas tengan `sale_line_id` asignado
2. Confirmar que las tareas estén en etapa "Cobro y entrega"
3. Revisar que compartan el mismo origen con la orden de entrega

### Problema: No encuentra la etapa "Hecho"

**Posibles causas:**
- Etapa no existe en el proyecto
- Nombre de etapa incorrecto

**Solución:**
1. Crear etapa "Hecho" en el proyecto correspondiente
2. Verificar que el nombre sea exactamente "Hecho"
3. Asegurar que esté asignada al proyecto correcto

## 📊 Logs y Monitoreo

### Verificar Automatizaciones Ejecutadas

1. Ir a **Configuración** → **Técnico** → **Automatizaciones** → **Logs de Automatización**
2. Buscar la automatización "Cambio de etapa cuando orden de entrega se completa"
3. Revisar registros de ejecución

### Activar Debug Mode (Desarrollo)

Para activar logs detallados durante desarrollo:

1. Modificar el código agregando logging:
```python
import logging
_logger = logging.getLogger(__name__)

# Agregar en el código:
_logger.info(f"Delivery order {delivery_order.name} completed, processing automation...")
_logger.info(f"Found {len(tasks)} tasks to update")
```

## 🔄 Mantenimiento

### Actualizaciones del Código

Si necesitas modificar la automatización:

1. Hacer backup de la configuración actual
2. Editar la automatización en Odoo
3. Modificar el código Python
4. Probar en entorno de desarrollo primero
5. Desplegar en producción

### Monitoreo Continuo

- Revisar logs de automatización mensualmente
- Verificar que las etapas estén correctamente configuradas
- Monitorear el rendimiento del sistema

## 📞 Soporte

Para soporte adicional:

1. **Revisar logs** en Odoo
2. **Verificar configuración** de etapas
3. **Probar en ambiente de desarrollo** antes de producción
4. **Documentar cambios** realizados

---

## ✅ Lista de Verificación Final

- [ ] Automatización creada en Odoo
- [ ] Filtro configurado correctamente
- [ ] Código Python agregado
- [ ] Etapas "Cobro y entrega" y "Hecho" configuradas
- [ ] Pruebas realizadas exitosamente
- [ ] Logs de automatización funcionando
- [ ] Documentación del proceso disponible

¡La automatización está lista para usar! 🚀