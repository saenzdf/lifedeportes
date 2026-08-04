# Vars Contract v4 - Life Deportes Kapso

Contrato canonico de variables del execution context (`vars.*`) para el workflow principal `lifedeportes_sales_inbound`. El Agent orquestador lee estas variables y las escribe via sus tools; los guards y las functions siguen el mismo shape.

## Principios

- Namespaces por dominio: `tenant`, `user`, `intent`, `funnel`, `quote`, `order`, `order_details`, `payment`, `design`, `production_order`, `flow`, `media`, `handoff`, `security`, `service`.
- Las functions NO inventan namespaces nuevos sin registrarlos aqui.
- Todo servicio que falle o este en stub escribe en `vars.service.last_call_*` para trazabilidad.
- Odoo es el sistema de registro. `vars.*` mantiene el estado conversacional y de ruteo del workflow.

## Namespaces

### `vars.tenant`
En el inbound actual se asume tenant unico (`life_main`); no se resuelve via guard dedicado al inicio.

| Campo | Tipo | Descripcion |
|---|---|---|
| `id` | string | Identificador del tenant (`life_main` por defecto). |
| `name` | string | Nombre legible. |
| `policy_set` | string | Nombre de la politica de seguridad. |
| `secret_prefix` | string | Prefijo para lookup de secretos (`TENANT_LIFE_MAIN`). |
| `phone_number_id` | string | phone_number_id Meta asociado. |

### `vars.user`
Resuelto por `staff_allowlist_check`.

| Campo | Tipo | Descripcion |
|---|---|---|
| `wa_id` | string | Numero WhatsApp del emisor, sin `+`. |
| `role` | string | `customer` (default) \| `staff`. |
| `is_allowed_for_transactions` | boolean | Permite flujos internos (pedido/compras interno). Siempre `false` para `customer`. |

### `vars.intent`
Escrito por el Agent tras cada turno para trazabilidad. No lo usa el router (ya no hay router AI de primera linea).

| Campo | Tipo | Descripcion |
|---|---|---|
| `raw_text` | string | Ultimo mensaje del cliente normalizado. |
| `type` | string | Etiqueta narrativa que el agente anota (`exploring_quote`, `confirming_payment`, `sending_order_details`, `needs_human`, `uploading_media`, `other`). |
| `confidence` | number | Auto-estimacion del agente [0..1]. |

### `vars.funnel`
Fase comercial explicita del cliente.

| Campo | Tipo | Descripcion |
|---|---|---|
| `stage` | string | `preventa` \| `venta` \| `pago_en_revision` \| `posventa` \| `diseno_en_aprobacion` \| `produccion` \| `entrega`. |
| `stage_reason` | string | Motivo corto del ultimo cambio de fase. |
| `updated_at` | string ISO | Fecha del ultimo cambio de fase. |

### `vars.quote`
Cotización / **pedido vivo multi-semana**. Capa corta Kapso; se rehidrata tras `ended` y se espeja en CRM como `LIFE_DOSSIER_v1` (no wiki Sync por cliente).

| Campo | Tipo | Descripcion |
|---|---|---|
| `product_text` | string | Descripcion libre del producto solicitado (principal). |
| `variant` | string | Legacy: `manga_corta`, `manga_larga`, `polo_con_botones`, etc. Preferir `variants`. |
| `material` | string | Legacy: `dry_fit` \| `dumonti` \| `lluvia` \| `hidrotec` \| null. Preferir `variants.material`. |
| `quantity` | number | Cantidad solicitada (>=1). |
| `unit_cop` | number | Precio unitario en pesos (match high). |
| `total_cop` | number | Total en pesos (match high). |
| `price_from_cop` | number | Precio desde cuando match ambiguo. |
| `match_confidence` | string | `high` \| `low` \| `none`. |
| `odoo_product_id` | number | ID producto Odoo (solo match high). |
| `suggested_alternatives` | array | `{name, list_price_cop}` upsell cuando match low. |
| `draft_payload` | object | Borrador JSON; upload Odoo solo via staff handoff. |
| `commercial_summary` | string | Resumen tipo Paola antes de pedir abono. |
| `minimum_ready_for_quote` | boolean | `true` solo con `match_confidence=high` y reglas comerciales OK. |
| `commercial_validation` | object | `{ok, code, message_es, base_uniform_qty, extras_qty}` de minimo 6 uniformes. |
| `extra_lines` | array | Lineas adicionales `{product_text, quantity}` encima del producto base (legacy). |
| `lines` | array | Cotizaciones múltiples `{product_text, quantity, unit_cop, total_cop, odoo_product_id?, garment_type?}`. |
| `variants` | object | `{material, collar, sleeves, sport}` confirmados. |
| `notes` | string | Contexto durable (colegio, grado, instrumento, “vuelve la otra semana”). |
| `media_refs` | array | `{url?, summary, role, at?}` tras analizar foto. |
| `history` | array | `{at, note}` cambios graduales. |
| `status` | string | `cotizando` \| `esperando_equipo` \| `armando_lista` \| `listo_presupuesto`. |
| `revision` | number | Crece al cambiar qty/líneas/variantes. |
| `updated_at` | string ISO | Última actualización. |
| `dossier_text` | string | Bloque `LIFE_DOSSIER_v1` para CRM. |

### `vars.staff_route` (trial v1)
Escrito por `detect-staff-upload-command`.

| Campo | Tipo | Descripcion |
|---|---|---|
| `staff_route` | string | `continue_agent` \| `staff_upload_odoo`. |

### `vars.order`
Escrito por `activar_cotizacion_odoo` y por el nodo `send_interactive flow=order_details`.

| Campo | Tipo | Descripcion |
|---|---|---|
| `id` | string | ID de `sale.order` en Odoo. |
| `status` | string | `draft` \| `quotation` \| `confirmed`. |
| `amount_total` | number | Total cotizado. |
| `detail_flow_sent_at` | string ISO | Timestamp del envio del Flow. |
| `customer_confirmed` | boolean | Cliente confirmo el detalle. |

### `vars.orders` (multi-pedido)

Escrito por `classify_contact_odoo`:

| Campo | Tipo | Descripcion |
|---|---|---|
| `active` | array | Pedidos abiertos `{id,name,state,task_id,task_stage}` en `draft\|sent\|sale`. |
| `active_count` | number | Cantidad de pedidos activos. |
| `focus_order_id` / `focus_order_name` | number\|string\|null | Foco de seguimiento; null si hay varios y el cliente no eligió. |

### `vars.session.continuity`

Escrito por `classify_contact_odoo` tras hidratar Kapso y/o dossier CRM:

| Campo | Tipo | Descripcion |
|---|---|---|
| `resumed` | boolean | `true` si se reinyectó quote desde Kapso y/o CRM. |
| `source` | string | `kapso_prior_execution` \| `odoo_crm_dossier` \| `kapso_and_crm_dossier` \| `odoo_only` \| `none`. |
| `conversation_id` / `execution_id` | string\|null | Origen Kapso. |
| `same_conversation` | boolean\|null | Si el hilo WABA es el mismo o uno nuevo tras `ended`. |
| `opportunity_id` | number\|null | Oportunidad CRM con `LIFE_DOSSIER_v1`. |
| `resume_hint` | string\|null | Frase corta para retomar sin repreguntar. |
| `hydrate_error` | string\|null | Si `resumed=false`, causa corta (`missing_kapso_secrets`, `no_useful_quote`, …). |

### `vars.crm` (opcional)

| Campo | Tipo | Descripcion |
|---|---|---|
| `opportunity_id` | number | Lead/oportunidad abierta. |
| `opportunity_name` | string | Nombre en Odoo. |
| `opportunity_stage` | string\|null | Etapa CRM. |

### `vars.sales_notify`

Escrito por `notify-sales-interest` tras interés claro (aceptación de cotización). **No** implica handoff.

| Campo | Tipo | Descripcion |
|---|---|---|
| `status` | string | `disabled` \| `dry_run` \| `sent` \| `failed` \| `no_destinations`. |
| `enabled` | boolean | `LIFE_SALES_NOTIFY_ENABLED`; en pruebas suele ser `false` (no WA a Javier/Paola). |
| `fingerprint` | string | Idempotencia `conversation+producto+qty+total`. |
| `destinations` | array | Teléfonos E.164 notificados (vacío si disabled). |
| `whatsapp` | array | Resultado por destino `{to,ok,error,message_id}`. |
| `webhook` | object | `{ok,skipped,error}` si hay `LIFE_SALES_NOTIFY_WEBHOOK`. |
| `message_preview` | string | Texto enviado a ventas. |

### `vars.order_draft`

Borrador canónico usado por todos los canales de ingreso antes de crear el SO en Odoo.

| Campo | Tipo | Descripcion |
|---|---|---|
| `detail.schema_version` | string | `life_order_people_v1`. |
| `detail.people` | array | Personas/destinatarios con `person_id`, `identity`, `components[]` y comentarios. |
| `detail.person_count` | number | Número de personas o destinatarios normalizados. |
| `detail.rows` | array | Proyección legacy para notas Odoo y parsers existentes; no es la fuente canónica nueva. |
| `detail.source` | string | `flow` \| `text` \| `excel` \| `media` \| `conversation`. |
| `detail.parse_status` | string | `ok` \| `partial` \| `needs_review`. |
| `commercial.lines` | array | Líneas pedidas en lenguaje Life (pre-resolución): `product_text`, `quantity`, `category`, `variant_notes`. |
| `commercial.resolved_lines` | array | Líneas listas para Odoo tras `compile_staff_order_draft` (ver abajo). |
| `commercial.requested_lines` | array | Alias opcional de `commercial.lines` (pedido en lenguaje Life). |
| `spreadsheet` | object | Estado del Formulario Life: `id`, `status` (`empty`\|`partial`\|`complete`\|`mismatch`), `fingerprint`, `cross_check`, `url`. |
| `write` | object | Checklist post-compilación: `status` (`ready`\|`needs_staff_confirmation`\|`blocked`\|`needs_human_reconcile`), `fingerprint`, `code`. |
| `lifecycle` | object | Estado vivo `life_order_lifecycle_v1`: `state`, cantidades comercial/detalle, `missing_fields`, compuerta de confirmación y revisión activa. |
| `attachments` | array | Evidencia original (Excel/fotos); referencia, no verdad. |

Cada elemento de `detail.people` usa este contrato:

- `identity`: `display_name`, `print_name`, `number`, `group`.
- `components[]`: `type`, `size`, `sleeve`, `goalkeeper`, `printing`, `comment`, y referencias opcionales de producto (`resolved_line_id`).
- Una persona puede tener varios componentes y cada componente puede tener una talla distinta.
- Los adaptadores convierten Excel/texto/imagen/Flow a este contrato y mantienen `detail.rows` mientras los constructores Odoo legacy lo necesiten.

Cada elemento de `commercial.resolved_lines[]`:

| Campo | Tipo | Descripcion |
|---|---|---|
| `line_id` | string | Clave estable para alinear personas ↔ línea SO ↔ sheet. |
| `product_base` | string | Nombre de template sin atributos embebidos. |
| `product_text` | string | Texto original pedido. |
| `product_tmpl_id` | number\|null | `product.template` Odoo. |
| `product_variant_id` | number\|null | `product.product` exacto (obligatorio para write). |
| `attributes` | object | `{cuello, tela, manga, tipo_pantalon, forro, deporte}` desglosados. |
| `quantity` | number | Cantidad de la línea. |
| `unit_cop` | number\|null | Precio Odoo/catálogo. |
| `confidence` | string | `high` \| `medium` \| `low` \| `none`. |
| `comments` | string | Notas de interpretación al frente del producto. |

### `vars.staff` (write gate)

Escrito por `validate_staff_write` / `compile_staff_order_draft`:

| Campo | Tipo | Descripcion |
|---|---|---|
| `write_status` | string | `ok` (listo para writer) \| `blocked` \| `needs_confirmation`. |
| `write_code` | string | p.ej. `pedido_ready`, `needs_confirmation`, `unresolved_variant`. |
| `write_blocked_reason` | string\|null | Mensaje para staff. |
| `confirmation_fingerprint` | string\|null | Si el staff responde `CONFIRMO SUBIR`, debe coincidir con `order_draft.write.fingerprint`. |
| `registration_type` | string | `pedido`. |

Tras crear el SO, Odoo es la fuente de verdad. `sync_order_draft_from_odoo` reconstruye `order_draft` desde líneas + spreadsheet.

### `vars.order_lifecycle`

Controla la evolución del pedido sin confundir cantidad comercial, lista y producción:

| Campo | Tipo | Descripción |
|---|---|---|
| `schema_version` | string | `life_order_lifecycle_v1`. |
| `state` | string | `draft_partial` \| `draft_ready_for_review` \| `draft_revisioned` \| `confirmed_revisioned` \| estados posteriores de producción/entrega. |
| `commercial_quantity` | number | Unidades solicitadas/cotizadas; puede iniciarse como estimado provisional (lista o conversación). |
| `detail_quantity` | number | Personas/unidades detalladas en Formulario. |
| `quote.estimate` | object | Estimado inicial `life_order_estimate_v1`: `{ quantity, product_text, source, provisional, confidence, amount_estimated }`. Fuentes: `list_detail` \| `list_detail_bump` \| `conversation` \| `commercial` \| `quote`. Se refina al crear/actualizar el presupuesto. |
| `missing_fields` | array | `cliente`, `lista_personas`, `nombres`, `numeros`, `tallas`, `cuadre_cantidad_lista`, `variantes_odoo`. |
| `confirmation_gate.allowed` | boolean | `true` solo cuando no faltan variables iniciales. Kapso nunca ejecuta `action_confirm`. |
| `active_revision` | number | Última revisión estructurada aplicada. |

Las correcciones crean un adjunto inmutable `life-order-revision-vNNNN.json` sobre el `sale.order`, con snapshot antes/después, actor, motivo, líneas y estado. El chatter conserva el resumen humano y el JSON conserva la auditoría reconstruible.

### `vars.order_details`
Captura progresiva de datos para diseno e impresion. Antes del abono puede estar parcial; despues del pago aprobado es obligatoria.

| Campo | Tipo | Descripcion |
|---|---|---|
| `partial` | object | Datos entregados naturalmente antes del abono: tallas aproximadas, referencias, colores, nombres, numeros, logos o notas. |
| `designer_schema_version` | string | Version del esquema para el formato de disenadores (`life_designer_order_v1`). |
| `color_media` | string \| null | Valor del campo `COLOR DE MEDIA` en el Excel. |
| `disciplina` | string \| null | Deporte/disciplina. |
| `lines` | array | Filas normalizadas para diseno. Cada fila usa `nombre_uniforme`, `talla`, `numero`, `manga`, `genero`, `camiseta`, `uniforme`, `arquero`, `comentario`. |
| `attachments` | array | Logos, referencias, comprobantes o archivos vinculados. Guardar URL/id y tipo. |
| `source` | string | `flow` \| `text` \| `excel` \| `media` \| `conversation`. |
| `completeness` | string | `complete` \| `incomplete` \| `needs_human_review`. |
| `missing_fields` | array | Campos faltantes que se deben pedir de forma puntual. |
| `confidence` | number | Confianza de normalizacion [0..1]. Si es baja, escalar o pedir aclaracion. |
| `updated_at` | string ISO | Ultima actualizacion. |

Campos base del Excel `FORMATO PEDIDO LIFE 1.xlsx`, hoja `formato life`:

| Excel | Campo canonico |
|---|---|
| `B2 COLOR DE MEDIA` | `color_media` |
| `G2 DISCIPLINA` | `disciplina` |
| `B5 NOMBRE EN UNIFORME` | `line.nombre_uniforme` |
| `C5 TALLA` | `line.talla` |
| `D5 NUMERO` | `line.numero` |
| `E5 Larga/Corta` | `line.manga` |
| `F5 MAS` | `line.genero = masculino` |
| `G5 FEM` | `line.genero = femenino` |
| `H5 Camiseta` | `line.camiseta` |
| `I5 Uniforme` | `line.uniforme` |
| `J5 ARQUERO` | `line.arquero` |
| `K5 COMENTARIO` | `line.comentario` |

**Parser formato life (jul 2026):** dorsal = `NUMERO`, o `No.` si NUMERO vacío; MAS/FEM = género; Camiseta/Uniforme = validación pre-ingreso (no columna Formulario); arquero solo marca/comentario; curso/pago en comentarios → `registro`. Tool `parsear_lista_excel_pedido` → `parse_report` con conteos, hints y `registro_hints`.

### `vars.payment`
El agente recibe evidencia, pero no aprueba pagos.

| Campo | Tipo | Descripcion |
|---|---|---|
| `verification_status` | string | `not_received` \| `pending_human_review` \| `approved` \| `rejected`. |
| `expected_amount_cop` | number | Abono esperado, normalmente 50% del total. |
| `received_reference` | string \| null | Referencia enviada por el cliente. |
| `received_method` | string \| null | Nequi, Bancolombia, transferencia u otro. |
| `receipt_attachment` | object \| null | Imagen/PDF/documento del comprobante. |
| `review_packet` | object | Resumen para humano: cliente, monto, cotizacion, comprobante y notas. |
| `reviewed_by` | string \| null | Humano que valido o rechazo. |
| `reviewed_at` | string ISO \| null | Fecha de validacion humana. |

### `vars.design`
Estado de coordinacion de diseno y aprobacion del cliente.

| Campo | Tipo | Descripcion |
|---|---|---|
| `approval_status` | string | `not_sent` \| `sent_to_customer` \| `corrections_requested` \| `approved` \| `needs_human_review`. |
| `version` | string \| null | Version o identificador del diseno enviado. |
| `sent_at` | string ISO \| null | Fecha de envio al cliente. |
| `approved_at` | string ISO \| null | Fecha de aprobacion explicita. |
| `approved_text` | string \| null | Texto exacto del cliente, idealmente `APROBADO` o equivalente inequivoco. |
| `corrections` | array | Correcciones puntuales acumuladas. |
| `handoff_required` | boolean | `true` si la respuesta es ambigua o riesgosa para impresion. |

### `vars.production_order`
Compuerta hacia fabricacion.

| Campo | Tipo | Descripcion |
|---|---|---|
| `ready_for_design` | boolean | `true` cuando pago aprobado y detalles completos. |
| `ready_for_production` | boolean | `true` solo cuando `vars.design.approval_status = approved`. |
| `odoo_stage` | string \| null | Estado consultado en Odoo: Corte, Confeccion, Entrega, etc. |
| `notes_for_designers` | string | Resumen limpio para equipo de diseno. |

### `vars.flow`
Respuestas estructuradas de WhatsApp Flow.

| Campo | Tipo | Descripcion |
|---|---|---|
| `last_name` | string | Nombre logico del ultimo Flow (`order_details_v1`, etc.). |
| `last_response` | object | Payload completo de `nfm_reply` o data endpoint. |
| `last_response_at` | string ISO | Fecha de recepcion. |
| `last_parse_status` | string | `parsed` \| `incomplete` \| `error`. |

### `vars.media`
Escrito por `invocar_media_intake`.

| Campo | Tipo | Descripcion |
|---|---|---|
| `type` | string | `image` \| `audio`. |
| `source_url` | string | URL del archivo en Kapso. |
| `transcript` | string | Transcripcion/OCR. |
| `confidence` | number | [0..1]. Si <0.8, handoff. |
| `used_for` | string | `quote_context` \| `order_details` \| `design_reference` \| `payment_receipt`. |

### `vars.handoff`
Escrito por el Agent cuando usa `handoff_to_human`, o por guards/services que bloquean.

| Campo | Tipo | Descripcion |
|---|---|---|
| `reason` | string | Motivo narrativo. |
| `context_packet` | object | Resumen de la conversacion para el humano / asistente inbox. |

### `vars.fidelity`
Escrito por `snapshot-upload-fidelity` al subir SO y por `compute-fidelity-retention` tras sync/correccion.

| Campo | Tipo | Descripcion |
|---|---|---|
| `kapso_snapshot` | object | Borrador congelado al subir (`resolved_lines`, fingerprint, `uploaded_at`). |
| `odoo_order_id` / `odoo_order_name` | number / string | SO creado. |
| `pass_clean` | boolean \| null | `true` si el SO no diverge del snapshot. |
| `retention_pct` | number \| null | % de campos/lineas del snapshot que se mantuvieron. |
| `correction_burden` | number \| null | `100 - retention_pct`. |
| `last_compared_at` | string ISO \| null | Ultima medicion. |

### `vars.security`
Escrito por `policy_guard_input` y por cada function Odoo (rate limit).

| Campo | Tipo | Descripcion |
|---|---|---|
| `policy_version` | string | Version de la policy cargada. |
| `mcp_call_count` | number | Contador acumulado por ejecucion. |
| `last_block_reason` | string \| null | Motivo del ultimo bloqueo, si aplica. |
| `input_flagged` | boolean | `true` si el guard detecto injection/abuse. |

### `vars.service`
Escrito por cualquier function al terminar, y por `get_service_status` cuando el agente consulta.

| Campo | Tipo | Descripcion |
|---|---|---|
| `last_call_name` | string | Nombre del ultimo servicio invocado. |
| `last_call_status` | string | `ready` \| `stub` \| `error`. |
| `last_call_at` | string ISO | Timestamp. |
| `fallback_message` | string \| null | Mensaje a narrar al cliente si el servicio esta en stub/error. |

### `vars.intent_next`
Signal que emite el Agent al llamar `complete_task` para que el Decide post-agent rutee a la salida correcta.

Valores permitidos:
- `continue_chat` (default): no hay accion especial, el turno termina.
- `capture_partial_details`: guardar detalles parciales sin bloquear la venta.
- `payment_human_review`: enviar paquete de comprobante a revision humana.
- `flow_order_details`: enviar el Flow de detalle de pedido (post-pago).
- `parse_flow_response`: parsear respuesta `nfm_reply` de WhatsApp Flow.
- `parse_excel_order`: normalizar filas extraidas de Excel al esquema de disenadores.
- `parse_text_order`: normalizar texto libre al esquema de disenadores.
- `send_design_for_approval`: registrar que el diseno se envio al cliente.
- `record_design_corrections`: registrar correcciones puntuales del cliente.
- `approve_design`: registrar aprobacion explicita del cliente y habilitar produccion.
- `handoff_human`: escalar a humano.
- `fallback_text`: el agente no pudo y pide cierre con texto estructurado.

## Reglas de escritura

- Cada function retorna un objeto `{ vars: {...} }` parcial que Kapso mergea en el context.
- El Agent en su system prompt NO escribe `vars.*` directamente; solo llama tools cuyas functions escriben.
- Los guards al inicio escriben `vars.user`, `vars.security`; `vars.tenant` queda opcional/fijo para trazabilidad.
- Si una function esta en estado `stub`, SIEMPRE escribe `vars.service.last_call_status = "stub"` y `vars.service.fallback_message`.
