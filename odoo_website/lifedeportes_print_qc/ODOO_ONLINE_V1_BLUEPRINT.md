# Odoo Online V1 Blueprint (sin instalar addon)

Implementación objetivo para la instancia Odoo Online de Life Deportes.

## Aclaración de negocio (diseño / impresión)

- El archivo PDF de la tarea **no es una tabla**; es el **imprimible de camisetas**.
- Desde ese imprimible se deben extraer, por línea/prenda:
  - talla de la camiseta (por ejemplo `M`, `L`, etc.),
  - nombre de espalda (aunque esté como imagen/vector),
  - número.
- Luego se compara ese resultado contra lo que viene en el Excel/JSON de lista del pedido.
- Si el PDF no trae texto extraíble (escaneado o diseño vectorizado sin texto accesible), se requiere paso OCR/IA para cerrar la comparación.

## Trigger de negocio

- Trigger real: tarea en estado **amarillo: solicitud de aprobación**.
- El webhook debe dispararse en ese cambio de estado/campo (no por etapa de fabricación).

## Configuración mínima en Studio

1. Modelo: `project.task`.
2. Automation rule:
   - Trigger: `On create and edit`.
   - When updating field: campo real de solicitud de aprobación (el que use su operación hoy).
   - Apply on: estado = solicitado/aprobación pedida.
3. Acción: **Send Webhook**.
4. URL: endpoint público de Kapso `print_qc_webhook_odoo`.
5. Headers:
   - `Content-Type: application/json`
   - `X-LD-QC-Signature: <LD_PRINT_QC_WEBHOOK_SECRET>`
6. Body mínimo:

```json
{
  "task_id": ${record.id},
  "attachment_id": null,
  "event": "approval_requested"
}
```

## Opción adicional

Si quieren disparar también cuando se sube PDF:

- modelo `ir.attachment`, trigger `On create`, dominio `res_model=project.task` y `mimetype=application/pdf`.
- body:

```json
{
  "task_id": ${record.res_id},
  "attachment_id": ${record.id},
  "event": "pdf_attached"
}
```

## Qué hace Kapso en V1

- recibe webhook seguro,
- resuelve adjuntos (`xlsx/json` + `pdf`) por JSON-RPC,
- compara multiconjunto nombre/talla/número extraído del imprimible vs lista,
- si el PDF no contiene texto utilizable, puede activar fallback a extractor IA (`PRINT_QC_AI_EXTRACTOR_URL`),
- publica informe en chatter (`project.task.message_post`),
- evita duplicados consecutivos (idempotencia por firma de evento).

