# Corrección / retoma pedidos staff (v4)

## Índice

Número `S0…` / `2714` + corregir|retomar|mejorar|completar → **este** flujo. No crear CRM/SO nuevo.

1. `buscar_pedido_odoo`
2. Parse / `registrar_adjuntos_pedido` si hay archivos nuevos
3. `corregir_pedido_odoo` (lista/fotos/nota) **o**
4. `staff.write_mode=sale_order` + `complete_task` si hay que completar líneas/Formulario del **mismo** borrador

## Tono agente

Respuestas **cortas**. Solo resumen. No explicar proceso ni tools.

## Cuándo usar este carril

- Staff da número de pedido (`S02714`, `2714`) y pide **corregir / modificar / retomar / mejorar / completar**.
- Ya hay presupuesto borrador y hay que tocar lista, refs, qty, variante o nota — **no** crear CRM/SO nuevo.
- **Mismo hilo / contexto activo:** si en turnos previos ya se retomó un S0… (o `vars.order` / `vars.order_correction` están) y staff pide un cambio puntual sin repetir el número («ODALINDA es femenino», «cambia la talla de X»), **sigue en ese pedido**. No pidas de nuevo el S0 ni crees CRM nuevo.

## Buscar pedido / tarea / presupuesto / oportunidad (Reglas de resolución)

1. **Número sin especificar tipo (ej. "2821", "S02821", "pedido 2821"):**
   - **Asumir SIEMPRE que es el número de orden (`sale.order` / SO / Presupuesto)**.
2. **Si especifican "presupuesto" o "SO" (ej. "presupuesto 2821", "SO 2821"):**
   - Buscar directamente la `sale.order` por el número con `buscar_pedido_odoo`.
3. **Si especifican "tarea" / "tarjeta" / "producción" (ej. "tarea 2821", "tarjeta S02821"):**
   - Buscar la tarea (`project.task`) que contenga el **número de pedido SO en su nombre usando `ilike`** (ej. `['name', 'ilike', '2821']`), ya que las tareas de producción siempre llevan el número de SO en el nombre.
4. **Si especifican "oportunidad" (CRM):**
   - Buscar la oportunidad en el CRM **únicamente por el NOMBRE DEL PEDIDO / CLIENTE / EQUIPO** (`buscar_oportunidad_odoo` por nombre), **NUNCA por el número de oportunidad** (Lead ID).
5. **Hard Rule (Prohibición):**
   - **NUNCA usar los números de oportunidad (Lead ID) para búsquedas o referencias**, para evitar confusiones con el número de pedido SO.

La tool lee en orden:
1. `vars.order_correction` / `vars.order` (turnos anteriores) ← **prioridad si el mensaje es un parche sin número**
2. Texto del hilo WhatsApp ("corregir pedido 2714", "S02714", "retoma el 2714", `*2789] FREDY BRAM*`)
3. `input.order_number` si el agente lo pasa

Tras buscar: queda `vars.order.id` + `vars.order_correction.target_order_id`.

Si `order_draft` ya tiene lista/adjuntos del hilo, úsalos directo — no vuelvas a pedir el Excel.

Opcional: `sincronizar_pedido_odoo` para leer líneas + Formulario desde Odoo antes de editar.

## Parches puntuales (género, talla, dorsal, nombre)

Ej. «ODALINDA ES UNIFORME FEMENINO» (cliente marcó MAS por error):

1. Resolver pedido en contexto (`vars.order` / `vars.order_session` o último S0 del hilo).
2. `corregir_pedido_odoo` con `list_mode=patch` (o reescribir nota/tarea moviendo la fila al bloque correcto).
3. Ack corto: `Listo S0… {nombre}: ODALINDA → femenino`.

No hace falta reenviar el Excel si el cambio es una fila.

## Cambio de pedido / aislamiento (hard rule)

Un solo **pedido activo** (`vars.order_session`). Al pasar a otro (ej. Fredy Bram → Daniel Tovar):

| Señal | Acción |
|-------|--------|
| Otro `S0…` / número ≠ sesión | `buscar_pedido_odoo` → **limpia** `order_draft` + ancla el nuevo. Cero mezcla. |
| «pedido Daniel Tovar» / retoma con nombre distinto **sin** S0 | Preguntar una vez: `¿Seguimos en S02789 FREDY BRAM o pasamos a Daniel Tovar?` |
| Parche de fila sin S0 («ODALINDA es femenino») | **Mismo** pedido; no switch |

**Prohibido** tras el switch: mencionar personas/listas del pedido anterior; reusar Excel/adjuntos/rows del draft viejo; aplicar patch de Fredy sobre Tovar.

Si `corregir_pedido_odoo` responde `order_session_mismatch` → llamar `buscar_pedido_odoo` del pedido nuevo y reintentar.

## Qué actualizar

| Tipo cambio | `sale.order` (presupuesto) | `project.task` (si existe) |
|-------------|----------------------------|----------------------------|
| Talla, dorsal, ortografía, género (MAS/FEM) | **Nota** (`sale.order.note`) + lista HTML | Descripción con lista |
| Variante / qty / producto | **Nota + líneas** | Descripción |
| Fotos / Excel / mockup | **Adjuntos en SO** | Adjuntos en tarea |
| Completar Formulario / líneas faltantes | Retoma writer (`complete_task` + `sale_order`) sobre el **mismo** `order.id` | — |

**Hard rule — nombre del pedido:** no cambiar `crm.lead.name`, `x_studio_nombre_del_pedido`, ni el título de la tarea salvo orden explícita («renombrar a X»). Staff manda (equipo o cliente). Refs de diseño van en nota/adjuntos, **no** como nombre.

**Confirmación WhatsApp:** `Listo S0… {nombre_que_dio_staff}: …`. Si staff dijo *FREDY BRAM*, decir FREDY BRAM — **prohibido** usar el filename del mockup (ej. UNIFORME CHAMEZA DISCAPACIDAD.png) como nombre del pedido.

Hard rule: SO solo **draft/sent**. Nunca `action_confirm`.

## Archivos

- **Excel** → parsear → nota SO (+ tarea) + adjunto
- **Fotos / mockup** → adjunto en SO (`attachments_only` si no hay lista)

## `list_mode`

- `full` — Excel completo
- `patch` — cambios puntuales en filas
- `attachments_only` — solo archivos

## `change_type`

Default `cliente`. Solo preguntar si es error interno o de diseño.

`change_summary` lo infiere la tool si no se pasa.

## Flujo tools

1. `buscar_pedido_odoo`
2. Parse / `registrar_adjuntos_pedido` si hay archivos nuevos
3. `corregir_pedido_odoo` (lista/fotos/nota)
4. Si falta producto/qty/Formulario del mismo borrador → `staff.write_mode=sale_order` + `complete_task` (writer retoma ese id)

## Advertencia Excel

Solo al confirmar corrección con lista, no en cada turno.
