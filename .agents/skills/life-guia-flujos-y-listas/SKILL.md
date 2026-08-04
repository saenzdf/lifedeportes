---
name: life-guia-flujos-y-listas
description: >-
  Guía maestra para agentes Antigravity en Life Deportes: explica qué es ingresar/subir
  productos a Odoo, la lógica y casos de parseo de listas (Excel formato life, Word,
  imágenes, PDFs imprimibles), manejo de adjuntos vía MCP Odoo, consulta e inspección
  con Kapso MCP/wacli, y reglas comerciales y de posventa.
---

# Guía Maestra: Flujos, Listas, Odoo y Kapso en Life Deportes

Esta skill es el punto de referencia único y completo para cualquier agente **Antigravity** que trabaje dentro del ecosistema de **Life Deportes**. Explica conceptualmente y operativamente cómo se ingresan los pedidos, cómo se entienden y parsean las listas de jugadores, cómo manejar archivos adjuntos en Odoo vía MCP y cómo inspeccionar o colaborar con las automatizaciones de Kapso.

---

## 1. Mapeo Rápido de Documentos de esta Skill

Para profundizar en áreas específicas, consulta los módulos incluidos en esta skill:

| Archivo | Contenido Principal |
|---------|---------------------|
| [listas-y-parseo.md](listas-y-parseo.md) | Parseo detallado de listas: Excel `formato life`, Word Día de la Familia, Excel Libre, Imágenes (visión OCR) y PDFs de Impresión (PyMuPDF + Tesseract/Gemini OCR). |
| [casos-pedidos-y-deportes.md](casos-pedidos-y-deportes.md) | Reglas de producto Odoo (Camiseta sola vs Uniforme completo vs Arquero vs Sudaderas), particularidades por deporte (Fútbol, Voleibol, Baloncesto, Atletismo) y casos mixtos. |
| [adjuntos-y-mcps.md](adjuntos-y-mcps.md) | Uso de MCP Odoo para crear/consultar registros, subida de adjuntos (`ir.attachment`), automatización SO → Tarea, y uso de Kapso MCP / `wacli` para auditar el trabajo de Kapso. |

---

## 2. Visión General: ¿Qué es "Subir Productos / Ingresar Pedidos" en Life Deportes?

En Life Deportes, "subir un producto" o "ingresar un pedido" significa tomar la intención de compra expresada por un cliente en WhatsApp (a través de texto, mensajes de voz transcritos, imágenes de referencia o listas en archivos) y estructurarla formalmente en el ERP **Odoo** en estado **Borrador (`draft`)**.

### El Flujo de Trabajo Operativo (Paso a Paso)

```
[Cliente WhatsApp] -> (Kapso / Wacli / Operaria) 
       |
       v
[Interpretación del Pedido] (Producto base + Deporte + Variante + Cantidad ≥ 6)
       |
       v
[Parseo de Lista de Pedidos] (Excel / Word / Imagen / PDF -> HTML estandarizado)
       |
       v
[Registro en Odoo vía MCP]
  1. res.partner (Crear/Obtener cliente por teléfono 573XXXXXXXXX)
  2. crm.lead (Oportunidad commercial - etapa temprana)
  3. sale.order (Presupuesto en estado draft)
  4. sale.order.line (Servicio de Diseño ID 504 por $0)
  5. sale.order.line (Línea(s) por cada product.product id y variante real)
  6. Escribir sale.order.note y project.task.description con el HTML parseado
  7. Adjuntar escudos, referencias y listas en ir.attachment de sale.order
       |
       v
[Notificación a la Operaria] (Se entrega el número S0xxxx para revisión humana)
```

---

## 3. Reglas de Oro Absolutas

1. **PROHIBIDO ejecutar `action_confirm`**: El agente NUNCA confirma el presupuesto (`sale.order`). La confirmación de la venta y la verificación del abono del 50% la realiza exclusivamente la operaria humana desde la interfaz web de Odoo.
2. **Línea Servicio de Diseño Obligatoria**: Todo presupuesto debe incluir una línea con `product_id = 504` (Diseño servicio), `qty = 1` y `price_unit = 0`.
3. **Usar `product.product` (Variante Real)**: Las líneas del presupuesto deben usar el ID de variante real (`product.product`), no la plantilla (`product.template`) ni un ID genérico.
4. **Mínimo Comercial**: Mínimo 6 unidades del mismo producto/diseño.
5. **Regla de Subida Directa (Sin Fricción Staff)**: Si la información ingresada es válida y no hay un bloqueador duro (como una variante inexistente o cantidad < 6), el agente debe **crear el borrador en Odoo de inmediato sin preguntar "¿Confirmas la subida?"**.
6. **No Duplicar Datos Sensibles en Notas**: La nota del presupuesto (`sale.order.note`) y la descripción de la tarea (`project.task.description`) **NO** deben contener el nombre del cliente, teléfono ni precios. Esos datos ya residen en los campos nativos de Odoo.

---

## 4. Skills Complementarios en el Workspace

Este skill interactúa y se coordina con los siguientes skills especializados dentro de `projects/lifedeportes/.agents/skills/`:

- **`life-odoo-ingreso-pedidos`**: Ejecución directa del flujo de ingreso preventa (creación de Partner, SO borrador, líneas de producto).
- **`life-odoo-lista-tarea`**: Parseo de listas y actualización de notas HTML en presupuestos existentes (`sale.order.note`) y tareas (`project.task.description`).
- **`life-preparar-pedido`**: Extracción y descarga previa de archivos/conversaciones desde WhatsApp vía `wacli`.
- **`print-pdf-ocr-local`**: Lógica OCR local (PyMuPDF + Tesseract/Gemini) para auditar PDFs imprimibles vs listas de pedidos.

---

## 5. Matriz Resumen de Herramientas (MCPs)

| Necesidad | Herramienta / MCP | Acción / Comando |
|-----------|-------------------|------------------|
| Buscar/Crear Cliente, SO, Tareas | MCP Odoo (`odoo-mcp-multi-instance`) | `search_read`, `create`, `write` |
| Subir Escudo, Referencia o Excel | MCP Odoo | `create` en `ir.attachment` |
| Revisar Chat / Descargar Fotos WhatsApp | Kapso / `wacli` | `wacli` sync / read messages |
| Inspeccionar Webhooks / Logs Kapso | Kapso API / Database | Query executions / logs |
