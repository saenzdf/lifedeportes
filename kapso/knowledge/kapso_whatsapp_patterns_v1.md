# Patrones Kapso / WhatsApp — Life Deportes

Estándar de plataforma para audio, archivos y turnos multi-mensaje.

## Modelo del grafo (agentes cliente)

- Tras debounce (~30s de silencio), el vendedor atiende el hilo consolidado.
- **Staff:** debounce **~10s** (`wait_staff_burst`) antes del Agent Staff; cada mensaje reinicia el timer. Al arrancar, leer últimos 3–5 inbound.
- **Vendedor:** termina cada turno con **`enter_waiting`**, tras `save_variable` de `quote.*`; así conserva la ejecución y recibe el siguiente mensaje. Incluye despedidas (“gracias, luego vuelvo”). **Nunca `complete_task`** en cliente — eso pone la ejecución/conversación en `ended`.
- **Histórico:** puede usar `enter_waiting` en consultas de pedido.
- **`handoff_to_human`** escala a operario humano en inbox **solo cuando el cliente solicita explícitamente hablar con una persona**. Aceptar una cotización guarda datos y vuelve a `enter_waiting`.

Antes de responder en ventas: **`get_whatsapp_context`** y leer los **últimos 3–5** mensajes inbound.

## Formato del texto (cliente en WhatsApp)

WhatsApp **no** renderiza Markdown de GitHub/web.
| Escribes | En el teléfono del cliente |
|----------|----------------------------|
| `**Telas:**` / `**Dry Fit:**` | Se ven los `**` literales (feo) |
| `*Dry Fit*` | Negrita WhatsApp |
| Texto plano | Ideal para Life |

**Prohibido** enviar `**...**` al cliente. Preferir texto plano; si hace falta énfasis, un solo `*asterisco*`. Kapso Inbox puede mostrar lo mismo en crudo: lo que importa es cómo se ve en WhatsApp.

## Nota de voz (audio)

Kapso **transcribe audio automáticamente** (WhatsApp Data). El agente recibe:

`Audio attached (...) URL: ...` + `Transcript: <texto>`

**Respuesta al cliente: siempre TEXTO escrito.** No enviar notas de voz de vuelta.

1. Lee el **Transcript** del último mensaje.
2. Si hace falta contexto: `get_whatsapp_context`.
3. Trata el transcript como texto del usuario — extrae producto, cantidad, deporte (mismas reglas que KB `life_lenguaje_cliente_productos`: **camiseta = camiseta sola dry-fit**).
4. **Transcript inválido** (no cotices ni avances): vacío, `[ruido]`, `[outro jingle]`, `[phone ringing]`, `[background noise]`, sin contenido comercial.
5. Si inválido: pide **texto** o audio más claro. No hagas handoff automático; ofrece que el cliente puede pedir un asesor.
6. Respuesta modelo: "Qué pena, no logro entender bien el audio. ¿Me confirma por aquí para qué producto y cuántas unidades necesita?"
7. Opcional: `save_variable` → `vars.media` con `{ type: "audio", transcript: "...", used_for: "quote_context" }`.

**`ask_about_file` NO es para audio** — solo PDF, imagen, Excel, Office (`.docx`, `.xlsx`, `.pptx`).

**Flujo audio + foto combinado:** consulta KB `life_flujo_audio_foto`.

## Archivos (imagen, PDF, Excel, documento)

1. `get_whatsapp_context` → `media_data.url` del último adjunto.
2. `ask_about_file` con `file_url` + **pregunta concreta** (una llamada por archivo por turno).
3. Resume en texto corto lo entendido; no inventes detalles visuales.
4. `enter_waiting` al cerrar el turno.

## Staff reenviando audio del cliente

Si la operaria reenvía un audio del cliente: lee Transcript, confirma con ella lo extraído, guarda en `order_draft` / `quote.*`.
