# Manual de Archivos Adjuntos, Odoo MCP y Kapso

Este documento orienta sobre la interacción técnica con los servidores MCP de **Odoo** y de **Kapso / Wacli** para gestionar archivos adjuntos y revisar ejecuciones.

---

## 1. Gestión de Archivos Adjuntos en Odoo (`ir.attachment`)

Los archivos adjuntos (escudos en alta resolución, fotos de referencia de diseño, archivos Excel de listas y PDFs) deben subirse a Odoo vinculados al registro del Presupuesto (`sale.order`).

### Subida de Adjuntos vía Odoo MCP

Para subir un archivo a Odoo usando el MCP:

1. Leer el archivo local y convertir su contenido a **base64**.
2. Llamar a la herramienta `create` del MCP Odoo sobre el modelo `ir.attachment`:

```json
{
  "model": "ir.attachment",
  "values": {
    "name": "escudo_equipo.png",
    "datas": "<CONTENIDO_EN_BASE64>",
    "res_model": "sale.order",
    "res_id": 2564,
    "type": "binary"
  }
}
```

### Propagación de Adjuntos del Pedido a la Tarea de Producción

En Life Deportes, cuando un presupuesto (`sale.order`) se encuentra en estado **Borrador**, la tarjeta de producción (`project.task`) aún no existe.

- **Al Confirmar el Presupuesto**: Odoo crea automáticamente la tarjeta de tarea (`project.task`).
- **Automatización Studio**: Existe una regla en Odoo Studio sobre `ir.attachment` que duplica los adjuntos del `sale.order` a la `project.task` correspondiente tan pronto se genera la tarea o se sube un nuevo archivo al pedido.

---

## 2. Guía del MCP de Odoo (`odoo-mcp-multi-instance`)

El MCP de Odoo permite consultar y manipular datos en las instancias de desarrollo, pruebas y producción de Life Deportes.

### Modelos Frecuentes
- `res.partner`: Gestión de contactos y clientes (búsqueda por campo `phone` o `mobile` con formato `573XXXXXXXXX`).
- `crm.lead`: Oportunidades comerciales.
- `sale.order`: Presupuestos / Pedidos de venta.
- `sale.order.line`: Líneas del presupuesto.
- `project.task`: Tarjetas del tablero Kanban de producción.
- `product.product`: Variantes reales de productos con su atributo y `list_price`.

### Prerrequisitos de IDs Fijos en Life Deportes
- `product.product` ID **504**: Servicio de Diseño (Línea $0).
- `project.project` ID **8**: Proyecto Javier.
- `project.project` ID **9**: Proyecto Paola.

---

## 3. Guía de Kapso y Wacli (WhatsApp Workflow Inspection)

**Kapso** es la plataforma de automatización de WhatsApp de Life Deportes. Como agente Antigravity, puedes revisar el trabajo realizado por Kapso o extraer datos directamente usando `wacli` o las herramientas de Kapso.

### Búsqueda y Sincronización con Wacli
1. **Buscar Conversación**: Utilizar `wacli` para localizar el contacto por número o nombre.
2. **Descargar Adjuntos**: Extraer escudos y Excels de la conversación a una carpeta local:
   `Pedidos/[Nombre_Cliente]/[YYYY-MM-DD]/`.
3. **Leer Transcripciones**: Consumir los transcripts de audios de voz procesados por Kapso.

### Verificación del Trabajo de Kapso
Para auditar si Kapso ejecutó correctamente un flujo:
- Revisar si Kapso generó el **Payload Formulario** en la nota del SO.
- Verificar si el webhook de clasificación de adjuntos (`clasificar_adjuntos_pedido`) procesó el Excel o la imagen correctamente.
- Comprobar que los logs de ejecución no muestren bloqueos por fallos de variante o montos comerciales.
