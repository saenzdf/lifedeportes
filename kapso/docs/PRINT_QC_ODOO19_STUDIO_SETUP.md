# Auditoría lista vs PDF — Odoo 19 Studio + webhook a Kapso

Este documento sustituye la instalación de addons en **Odoo Online**: la lógica de comparación corre en **Kapso** ([`print_qc_webhook_odoo.js`](../functions/print_qc_webhook_odoo.js)).

## Aclaración funcional (auditoría de diseño)

- El **PDF no se trata como tabla**: se considera un **arte imprimible de camisetas**.
- La validación debe extraer del imprimible, por cada prenda:
  - **talla real** (ej. `M`, `L`; el arte puede cambiar de tamaño según la talla),
  - **nombre de espalda** (puede venir como texto, imagen o vector),
  - **número de espalda**.
- Con esos datos extraídos del imprimible se hace la comparación contra el **Excel/JSON de lista** (fuente de pedido).
- Si el PDF viene rasterizado o el nombre/número no son texto extraíble, se considera caso para **OCR/IA (fase 2)** antes de comparar.

## 1. Trigger real en Studio (tarea en amarillo)

En vuestro flujo, el trigger es el estado de la tarea cuando queda en **amarillo: solicitud de aprobación** (archivo subido por diseñador y revisión/aprobación por empleada).

Crear/usar en **Studio** sobre el modelo **Task** (`project.task`) el campo/estado real de aprobación (no inventar otro si ya existe):

| Campo sugerido | Tipo | Uso |
|----------------|------|-----|
| `x_studio_solicitud_aprobacion_impresion` (o el campo real que ya usan) | Boolean o Selection | Debe representar el estado amarillo “solicitud de aprobación”. El webhook se dispara cuando cambia a solicitado. |
| (Opcional) `x_studio_lista_qc_adjunto` | Many2one → Attachment | Fuerza el Excel/JSON de lista si las heurísticas por nombre fallan. |
| (Opcional) `x_studio_pdf_qc_adjunto` | Many2one → Attachment | Fuerza el PDF a comparar. |

**Nota:** Si no usáis Many2one, el webhook puede enviar solo `task_id` y `attachment_id` del PDF recién creado; Kapso resuelve la lista como en el addon de referencia.

## 2. Parámetros del sistema en Odoo

Para v1 no se requiere parámetro de etapa. El trigger es únicamente la solicitud de aprobación (amarillo).

## 3. Automatización Studio + webhook saliente

### Opción A (recomendada): solo al pedir aprobación (amarillo)

1. Studio → modelo **Task** → **Automations** → New.
2. **Trigger:** *On create and edit* → *When updating field* = campo real de “solicitud de aprobación” (estado amarillo).
3. **Apply on domain** (modo desarrollador): condición para que quede en “solicitado/aprobación pedida”.  
   Si vuestro campo es selection, ejemplo: `[('x_studio_solicitud_aprobacion_impresion', '=', 'solicitada')]`.
4. **Actions to do** → Add → tipo **Send Webhook** / enviar datos a webhook externo (según etiqueta en vuestra edición 19).
5. **URL:** URL pública de la función Kapso `print_qc_webhook_odoo` (tras `deploy-function`).
6. **Headers:** `Content-Type: application/json` y `X-LD-QC-Signature: <mismo valor que secreto Kapso LD_PRINT_QC_WEBHOOK_SECRET>`.
7. **Body (JSON):** mapear desde el registro, mínimo:

```json
{
  "task_id": ${record.id},
  "attachment_id": null,
  "event": "approval_requested",
  "db": "<nombre_bd>"
}
```

Si Studio permite expresiones, incluir `list_attachment_id` / `print_attachment_id` leyendo campos `x_studio_*` si existen.

### Opción B: al crear PDF en la tarea

1. Modelo **Attachment** (`ir.attachment`).
2. **Trigger:** *On create*.
3. **Apply on:** `[('res_model', '=', 'project.task'), ('mimetype', '=', 'application/pdf')]`, y excluir nombres con `muestra`/`adic` si podéis con dominio.
4. Misma acción webhook; cuerpo ejemplo:

```json
{
  "task_id": ${record.res_id},
  "attachment_id": ${record.id},
  "event": "pdf_attached",
  "db": "<nombre_bd>"
}
```

### Opción C: solo cuando se requiere (Server Action + botón)

Para pedidos **corporativos**, cuando el Excel no sigue el mismo esquema que el arte por jugador, o cuando parte del arte llegó **por correo** y el PDF en la tarea no es el de camisetas: **no** usar automatización al pasar a amarillo. En su lugar:

1. Studio → modelo **Task** → **Server Action** (o Acción vinculada a un botón en la vista de formulario).
2. El usuario pulsa **“Auditar lista vs PDF”** (o nombre acordado) cuando la tarea ya tiene el Excel y el PDF correctos en adjuntos.
3. La acción ejecuta el mismo **Send Webhook** que en Opción A, con `task_id` y opcionalmente `list_attachment_id` / `print_attachment_id` si usáis campos Studio para forzar adjuntos.

Así el QC Kapso sigue siendo el mismo endpoint; solo cambia **quién dispara** (humano vs regla automática).

### Idempotencia (explicación corta)

Si Odoo guarda la tarea dos veces casi seguidas, la automatización puede disparar dos POST iguales.  
Kapso evita publicar dos informes idénticos seguidos usando una firma (`task_id` + ids de adjuntos + `event`).

## 4. Secretos y despliegue Kapso

En la función Kapso configurar:

- `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD` (igual que otras funciones Life).
- `LD_PRINT_QC_WEBHOOK_SECRET`: valor compartido con el header `X-LD-QC-Signature` de Odoo Studio.
- (Opcional, recomendado) `PRINT_QC_AI_EXTRACTOR_URL` y `PRINT_QC_AI_EXTRACTOR_TOKEN` para fallback de extracción IA cuando el PDF no trae texto legible.

Variables de entorno adicionales que afectan la comparación y la elección del PDF (función `print_qc_webhook_odoo`):

| Variable | Rol |
|----------|-----|
| `PRINT_QC_COMPARE_MODE` | `dorsal` (defecto): compara por nombre en uniforme + dorsal; `full`: fila completa nombre+talla+número. |
| `PRINT_QC_NAME_NORMALIZE` | `1`/`true` (defecto): normaliza claves de nombre; `0`/`false`/`off`: sin normalización extra. |
| `PRINT_QC_NAME_EQUIVALENCE_JSON` | JSON con `rules` para tratar tokens de nombre equivalentes por dorsal (calibración Life). |

**Selección del PDF de impresión:** `resolvePrintPdfId` descarta nombres tipo muestra/adicionales, **excluye PDFs de pantalón/bermuda/shorts** (heurística `pantal`, `bermuda`, `pant` en el nombre, etc.) para no usar un arte de pantalón como si fuera camiseta, y si hay varios candidatos prioriza nombre con **orden de trabajo**, luego pistas **cam / camiseta / uniforme / espalda**, y por último el más reciente.

**Despliegue:** `node scripts/create-function.js` / `deploy-function.js` con `--public-endpoint true` para que Odoo Online pueda POST sin API key de Kapso (solo el secreto compartido).

## 5. Sin polling

En v1 **no hay polling**.  
El informe solo se genera por webhook disparado desde la automatización de solicitud de aprobación.

## 6. Qué compara Kapso en esta auditoría

- Clave por fila: `nombre_uniforme + talla + numero` (multiconjunto, no solo presencia simple).
- Diferencias reportadas:
  - **Faltan en PDF (vs Excel)**.
  - **Sobran en PDF (no están en Excel)**.
- La auditoría evalúa consistencia de datos de impresión vs lista de producción, no layout visual del PDF.

## 7. Pruebas

1. Duplicar la base ([documentación Odoo Online](https://www.odoo.com/documentation/19.0/administration/odoo_online.html)).
2. Disparar la automatización o `curl` POST al endpoint con payload mínimo.
3. Verificar mensaje en el chatter de la tarea.

Payloads de ejemplo listos para copiar: [`PRINT_QC_WEBHOOK_PAYLOADS_V1.json`](./PRINT_QC_WEBHOOK_PAYLOADS_V1.json).
