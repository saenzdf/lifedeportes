# Payload Formulario + fill en Odoo (no celdas desde Kapso)

Tras E2E con Plantilla venta / Formulario nativo (timing: SO + Calculadora deben existir antes de llenar), Kapso **deja de escribir celdas** del spreadsheet. Entrega un **Payload Formulario** en el borrador; un script/automatización Odoo llena el Formulario Life cuando el documento está listo. La **Confrontación Kapso↔Formulario** valida fidelidad sin sustituir al vendedor. Prueba siguiente: 1 pedido bajo este contrato.

**Considered:** A) Kapso escribe celdas (ADR 0004) · B) solo script Odoo sin contrato Kapso · C+B) payload Kapso + fill Odoo — elegida C+B.
