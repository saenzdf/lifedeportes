# Cierre del handoff Kapso → Paola/Javier y template de oportunidad — Plan de implementación

> **For Hermes:** Ejecutar este plan completo y en orden. No declarar cerrado hasta que el handoff se haya probado con un envío real, la function esté desplegada y el template esté `APPROVED` o exista evidencia de la causa y del camino manual de aprobación.

**Goal:** Completar el handoff comercial de una oportunidad real desde Kapso a Paola/Javier: crear/actualizar el lead, avisar al staff con un mensaje corto sin datos técnicos, incluir enlace directo a la conversación de Kapso (fotos e historial) y enlace `wa.me` al cliente; además, dejar un template Meta viable para avisar fuera de la ventana de 24 horas.

**Architecture:** `notify-sales-interest` seguirá siendo el punto único de notificación. Para una conversación activa del staff envía texto libre con los dos enlaces. Para una conversación del staff fuera de 24 horas, envía un template de utilidad mínimo con un botón URL dinámico a la conversación de Kapso. El botón abre Kapso directamente; el mensaje detallado con nombre, pedido, valor y `wa.me` se envía únicamente después de que el staff responda o cuando la ventana esté activa.

**Tech Stack:** Kapso Functions (Cloudflare runtime), Kapso Project MCP, WhatsApp Cloud API/Meta templates, workflow `8995b14c-d852-4fb3-bceb-8a51a6ccc2c6`, Odoo CRM, Node.js, Git.

---

## Estado comprobado antes de ejecutar

- La function viva `notify-sales-interest` (`a2236fdc-8afa-40ab-a09f-d231c2b638cd`) está `deployed` y contiene el formato corto sin emoticones.
- El tool `notificar_interes_ventas` está cableado al workflow vivo (6 apariciones) y la function `notify-sales-interest` aparece en la definición viva.
- El mensaje actual contiene `wa.me`, pero **no incluye** el enlace al inbox/conversación de Kapso.
- Hay un bug bloqueante en el código vivo: se usa `executionContext?.context...` pero la variable `executionContext` no se declara en `handler`; en runtime puede producir `ReferenceError`.
- Los templates variables creados el 2026-08-12 fueron rechazados. El error de los templates históricos muestra parámetros inválidos y los intentos nuevos no incluyeron `example` de los parámetros, requisito de Meta.
- El único template aprobado para retomar es `retomar_pedido_v2`, sin parámetros. No reutilizarlo para avisos de oportunidad porque no contiene la semántica ni los enlaces requeridos.
- El worktree está compartido con Cursor/Antigravity y tiene cambios ajenos. Sólo se pueden commitear archivos propios de este plan.

## Contrato del mensaje de oportunidad

### Cuando la conversación del staff está activa

Enviar texto libre, sin emojis, sin IDs, sin CRM y sin instrucciones técnicas:

```text
Nueva oportunidad de ventas por Kapso

Cliente: {nombre confirmado o WA xxxxxxxxxx}
Pedido: {cantidad} × {producto}
Valor: {valor COP si existe}

Abrir conversación y fotos en Kapso:
{kapso_inbox_url}

Para hablarle al cliente:
{wa_me_url}
```

- `kapso_inbox_url`: `https://inbox.kapso.ai/projects/b470d474-6a7a-4d84-a214-6cd4b198b4f3?conversation_id={conversationId}`.
- `wa_me_url`: conserva el saludo fijo ya aprobado: `Hola, le escribo de Life Deportes para confirmar su pedido.`
- Fotos, variantes, lista, historial, referencias y detalle adicional no se empujan en el aviso; se consultan desde Kapso cuando el staff lo pida.

### Cuando la conversación del staff está fuera de 24 horas

No intentar texto libre: Meta lo rechaza con 131047.

Enviar un template `UTILITY` corto con un botón URL que abra la conversación correcta en Kapso. El body no debe intentar incluir el resumen ni un `wa.me` dinámico:

```text
Life Deportes registró una oportunidad que requiere atención.

Abre la conversación para ver el pedido, las fotos y responder al cliente.
```

Botón URL dinámico:

```text
Abrir en Kapso → https://inbox.kapso.ai/projects/b470d474-6a7a-4d84-a214-6cd4b198b4f3?conversation_id={{1}}
```

Al abrir/responder, el staff recupera el detalle comercial desde Kapso y, si responde al número de Life, se habilita la ventana para el mensaje completo.

---

## Task 1: Congelar y validar el estado compartido antes de editar

**Objective:** No pisar trabajo de Cursor/Antigravity ni publicar sobre un grafo que cambió.

**Files:**
- Inspect: `projects/lifedeportes/kapso/functions/notify_sales_interest.js`
- Inspect: `projects/lifedeportes/kapso/functions/notify_sales_interest_deploy.js`
- Inspect: workflow vivo `8995b14c-d852-4fb3-bceb-8a51a6ccc2c6`

**Steps:**
1. Ejecutar `git status --short` y guardar los archivos ajenos ya modificados.
2. Descargar la definición viva del workflow y registrar `lock_version`, `updated_at`, referencias de `notificar_interes_ventas` y el `function_id` de `notify-sales-interest`.
3. Descargar la función remota y comparar su hash con `notify_sales_interest_deploy.js` antes de escribir.
4. Si otro agente cambió cualquiera de los dos archivos de notificación o el grafo, re-leer el cambio y aplicar sólo el delta necesario; no sobrescribir.

**Verification:** El function ID cableado, el lock vivo y la copia local que se va a modificar quedan identificados antes de hacer un upsert.

## Task 2: Corregir el handler y construir ambos enlaces

**Objective:** Evitar el `ReferenceError` y generar el enlace directo de Kapso junto con el enlace `wa.me`.

**Files:**
- Modify: `projects/lifedeportes/kapso/functions/notify_sales_interest.js`
- Modify: `projects/lifedeportes/kapso/functions/notify_sales_interest_deploy.js`

**Steps:**
1. Al inicio de `handler`, declarar:
   ```js
   const executionContext = body?.execution_context || {};
   const vars = executionContext.vars || body?.vars || {};
   ```
   y conservar los fallbacks actuales de `whatsapp_context`.
2. Cambiar `buildNotifyBody` para recibir `env` y `conversationId`, sin descartar `conversationId`.
3. Reutilizar `buildKapsoConversationUrl(env, conversationId)` ya existente en la función.
4. Añadir el bloque `Abrir conversación y fotos en Kapso:` sólo si hay URL válida.
5. Mantener el bloque `Para hablarle al cliente:` con `buildWaMeLink(customerPhone)` y saludo fijo sin nombre.
6. Mantener fuera del aviso: IDs de CRM, UUID de conversación, `LIFE_DOSSIER_v1`, estado interno, nombres de functions y todo detalle técnico.
7. Eliminar la instrucción `void conversationId;` porque el valor ahora sí se usa.
8. Copiar exactamente la fuente final a `notify_sales_interest_deploy.js`.

**Tests:** Crear un test ad-hoc aislado que cargue las funciones relevantes o extraiga el builder y compruebe:
- Nombre real + pedido + valor + URL de Kapso + URL `wa.me`.
- Sin emojis.
- Sin `Conv:`, `semilla CRM`, `LIFE_DOSSIER`, UUID ni texto técnico.
- Sin nombre de cliente en el texto precargado de `wa.me`.
- Sin `executionContext is not defined` al invocar con un payload representativo.

**Verification:** `node --check` pasa para ambas copias y el test termina con código 0.

## Task 3: Validar y desplegar la function sin alterar topología

**Objective:** Publicar sólo la corrección de notificación, sin tocar el carril cliente ni las modificaciones de otros agentes.

**Files:**
- Deploy: `projects/lifedeportes/kapso/functions/notify_sales_interest_deploy.js`

**Steps:**
1. Ejecutar el upsert sobre `notify-sales-interest` usando el deploy file.
2. Ejecutar el endpoint de deploy explícito del ID `a2236fdc-8afa-40ab-a09f-d231c2b638cd`.
3. Esperar estado terminal y leer la función remota.
4. Confirmar `status: deployed`, timestamp nuevo, presencia de `Abrir conversación y fotos en Kapso` y ausencia de los términos técnicos eliminados.

**Verification:** La versión desplegada debe coincidir por hash o comparación textual con la copia deploy local.

## Task 4: Prueba real del aviso completo a Diego

**Objective:** Probar la entrega y los dos enlaces sin involucrar todavía a Paola/Javier.

**Files:** Ninguno.

**Steps:**
1. Confirmar que la conversación de Diego (`3000000047`) está dentro de la ventana activa.
2. Enviar una notificación de prueba con un caso conocido y no sensible, claramente marcado como prueba si hace falta.
3. Consultar el mensaje por MCP hasta estado `delivered`.
4. Verificar manualmente/mediante estructura que:
   - el URL de Kapso contiene el `conversation_id` correcto;
   - el URL `wa.me` contiene el teléfono correcto y el saludo fijo;
   - no aparece información técnica.

**Verification:** `delivered` + ambos enlaces presentes y correctos. Si no se puede confirmar el click desde API, documentar que el payload y el URL se verificaron, y pedir a Diego sólo una confirmación visual de apertura.

## Task 5: Preparar el template Meta correctamente

**Objective:** Presentar a Meta un template de utilidad diseñado para el caso fuera de ventana y con ejemplos exigidos por la API.

**Files:**
- Create: `projects/lifedeportes/kapso/docs/template_handoff_staff_meta_2026-08-12.json`
- Create: `projects/lifedeportes/kapso/docs/template_handoff_staff_meta_2026-08-12.md`

**Template propuesto:**

```json
{
  "name": "aviso_atencion_oportunidad",
  "language": "es",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Life Deportes registró una oportunidad que requiere atención.\n\nAbre la conversación para ver el pedido, las fotos y responder al cliente."
    },
    {
      "type": "BUTTONS",
      "buttons": [
        {
          "type": "URL",
          "text": "Abrir en Kapso",
          "url": "https://inbox.kapso.ai/projects/b470d474-6a7a-4d84-a214-6cd4b198b4f3?conversation_id={{1}}",
          "example": ["3c2d747c-446d-4e9a-8293-bf6fcd97591a"]
        }
      ]
    }
  ]
}
```

**Steps:**
1. Consultar la documentación vigente de Meta y confirmar el esquema exacto que el MCP de Kapso acepta para un botón URL dinámico y su `example`.
2. Si el MCP pierde campos de ejemplo o no expone errores de revisión, crear el template desde WhatsApp Manager o usar el endpoint Meta directo con el mismo JSON; no reintentar ciegamente con nombres distintos.
3. Guardar el request exacto, la respuesta y el ID Meta en el documento de evidencia.
4. Consultar el template hasta tener un estado final `APPROVED` o `REJECTED` con razón legible.
5. Si Meta lo categoriza como MARKETING, no discutir ni forzar UTILITY: evaluar el costo/consentimiento con Diego antes de crearlo bajo MARKETING.

**Verification:** `APPROVED`, con botón `Abrir en Kapso` y URL dinámica validada. Si es rechazado, registrar la razón oficial y el único siguiente intento permitido, no generar plantillas duplicadas.

## Task 6: Diseñar el envío condicional fuera/dentro de ventana

**Objective:** La function debe elegir texto libre o template sin producir el 131047.

**Files:**
- Modify: `projects/lifedeportes/kapso/functions/notify_sales_interest.js`
- Modify: `projects/lifedeportes/kapso/functions/notify_sales_interest_deploy.js`
- Possibly Modify: workflow definition only if se requiere un nodo de evento/respuesta del staff.

**Steps:**
1. Definir una fuente fiable de estado de ventana para cada destino staff: consultar la conversación con el número de Paola/Javier por MCP antes de enviar, no inferirla por el cliente.
2. Si está activa, enviar el mensaje completo de Task 2.
3. Si no está activa, enviar el template `aviso_atencion_oportunidad` con el `conversation_id` como parámetro del botón URL.
4. Guardar en `vars.sales_notify` únicamente valores de negocio: destino, método (`text`/`template`), estado, `message_id`, `kapso_url`, hora y huella. No almacenar/mostrar secretos.
5. Si la API no permite enviar el template desde la function con parámetros de botón, implementar un endpoint/function pequeño y probada para hacerlo. No usar el texto libre como fallback fuera de ventana.
6. Acordar los números canónicos de Paola y Javier con Diego/KB antes de activar envíos automáticos; no usar candidatos de Odoo como destinos sin confirmación.

**Tests:**
- Simulación ventana activa → `type: text`, dos enlaces.
- Simulación ventana cerrada → `type: template`, parámetro de URL de Kapso.
- Error 131047 → no retry de texto; resultado explícito `window_closed_template_required`.
- Destino sin conversación o número inválido → no envío, error entendible.

**Verification:** Evidencia de un envío `delivered` de cada ruta (texto y template) a Diego antes de activar Paola/Javier.

## Task 7: Activar Paola/Javier y hacer canary de oportunidad real

**Objective:** Cerrar el handoff completo sin enviar ruido ni romper conversaciones de clientes.

**Files:**
- Modify only if needed: secret/configuración del destino de la function (no `.env` ni secretos en Git).

**Steps:**
1. Obtener por escrito de Diego los teléfonos definitivos y el orden de destinación (Paola primero; Javier opcional/fallback o ambos).
2. Configurar los secretos del entorno Kapso para permitir el envío sólo a esos destinos.
3. Elegir una oportunidad real vigente con consentimiento operativo o un caso canary de Diego.
4. Ejecutar el handoff una sola vez y verificar idempotencia: no se debe duplicar el aviso al volver a procesar el mismo quote/revisión.
5. Confirmar en Odoo que se creó/actualizó el lead, y en Kapso que la conversación/fotos se abren desde el enlace.
6. Si el staff pide detalle, comprobar que Kapso lo devuelve a petición, sin inflar el aviso inicial.

**Verification:** Evidencia de: lead CRM creado/actualizado, aviso `delivered`, link de Kapso correcto, link `wa.me` correcto, y sin envío duplicado.

## Task 8: Cierre documental, Git y wiki

**Objective:** Que el handoff no vuelva a quedar sin contexto ni a medias.

**Files:**
- Create immutable source: `raw/projects/2026-08-12-handoff-paola-template-evidence.md`
- Modify compiled project page: `wiki/projects/lifedeportes.md`
- Append: `wiki/log.md`
- Commit only own files under `projects/lifedeportes/`.

**Steps:**
1. En `raw/`, guardar el diseño final, IDs de template, estados Meta, resultados de canary y límites 24h/131047, sin secretos.
2. Actualizar `wiki/projects/lifedeportes.md` con un bloque “Handoff comercial Kapso → Paola/Javier” que indique: entradas, función, mensaje, links, template, estado y operación manual de contingencia.
3. Appendar una única entrada en `wiki/log.md`:
   ```md
   ## [2026-08-12] deploy | Cierre handoff comercial Kapso → Paola/Javier | agent:hermes
   - **Detalle:** ...
   ```
4. Ejecutar `git diff --check`.
5. Commitear exclusivamente archivos creados/modificados por este plan. No incluir los cambios previos de Cursor/Antigravity.
6. Reportar una tabla final con cada criterio de aceptación y evidencia real, marcando cualquier dependencia externa que siga pendiente.

---

## Criterios de aceptación de cierre

- [ ] No queda `executionContext is not defined` en la function ni en una invocación representativa.
- [ ] El mensaje de texto libre tiene nombre, pedido, valor, enlace Kapso y enlace `wa.me`; no tiene emojis, CRM IDs, UUIDs ni términos técnicos.
- [ ] La conversación de Kapso abre el hilo correcto y permite revisar fotos/historial.
- [ ] `wa.me` abre el teléfono correcto y conserva el saludo fijo sin nombre de cliente.
- [ ] El template fuera de ventana usa un botón URL dinámico y está `APPROVED`, o existe una razón oficial documentada más su plan alternativo aprobado por Diego.
- [ ] Fuera de 24 horas no se manda texto libre ni se repite el error 131047.
- [ ] Dentro de 24 horas se envía el detalle completo una sola vez.
- [ ] Paola/Javier se activan sólo con números explícitamente confirmados por Diego.
- [ ] El canary se valida con `delivered`, CRM y ambos enlaces.
- [ ] Wiki y raw dejan el estado durable; Git contiene únicamente el cambio propio.

## Riesgos y decisiones pendientes

1. **Números definitivos:** Paola y Javier no deben inferirse de candidatos de Odoo; Diego debe confirmarlos antes de automatizar destinos.
2. **Aprobación Meta:** La aprobación es externa; no se puede prometer. La corrección de mayor probabilidad es usar un template `UTILITY` sin texto de venta variable, con botón URL dinámico y ejemplos de parámetro correctos.
3. **Botón URL dinámico:** Confirmar el formato exacto soportado por Kapso MCP/Meta. Si el MCP no lo transmite completo, usar WhatsApp Manager/Meta API directo y documentarlo.
4. **Ventana de staff:** El template reabre el contacto sólo cuando el staff responde; no se debe suponer que el mero delivery abre la ventana.
5. **Cambios concurrentes:** Antes de cada deploy, volver a leer la function y la definición viva; no publicar una copia local obsoleta.

## Definición de “terminado”

No es suficiente con que el archivo exista o el mensaje de prueba llegue a Diego. El handoff queda terminado sólo cuando: (1) la function está sana y desplegada; (2) el aviso activo tiene ambos enlaces; (3) el caso fuera de ventana tiene template aprobado y ruta de envío sin 131047; (4) un canary produce evidencia de entrega y CRM; y (5) el resultado queda documentado en raw, wiki y log.
