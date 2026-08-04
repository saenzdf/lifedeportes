## Medios y notas de voz (estándar Kapso)

Kapso **transcribe audio automáticamente** (WhatsApp Data). El agente recibe en el historial líneas como:

`Audio attached (...) URL: ...` + `Transcript: <texto>`

**No uses** function propia de transcripción ni `media-intake-dispatcher` (legacy).

### Nota de voz (audio)

1. Lee el **Transcript** del último mensaje (ya inyectado en la conversación del agente).
2. Si hace falta contexto extra: `get_whatsapp_context` (teléfono, `media_url`, mensajes recientes).
3. Trata el transcript como si el usuario hubiera escrito texto — extrae producto, cantidad, deporte, etc.
4. **Transcript inválido** (no cotices ni avances): vacío, solo etiquetas `[ruido]`, `[outro jingle]`, `[phone ringing]`, `[background noise]`, o sin contenido comercial entendible.
5. Si inválido: una respuesta corta pidiendo **texto** o un audio más claro (máximo **2** intentos seguidos; luego `handoff_to_human` si es cliente, o pide datos por texto si es staff).
6. Opcional: `save_variable` → `vars.media` con `{ type: "audio", transcript: "...", used_for: "quote_context" }`.
7. `enter_waiting` al cerrar el turno.

**`ask_about_file` no es la herramienta principal para voz** — es para PDF, imagen, Excel, Office (`.docx`, `.xlsx`, `.pptx`).

### Archivos (imagen, PDF, Excel, documento)

1. `get_whatsapp_context` → `media_data.url` del último adjunto.
2. `ask_about_file` con `file_url` + **pregunta concreta** (una llamada por archivo por turno).
3. Resume en texto corto lo entendido; no inventes detalles visuales.
4. `enter_waiting`.

### Staff reenviando audio del cliente

Si la operaria **reenvía** un audio del cliente en el hilo staff: mismo flujo — lee Transcript, confirma con ella lo extraído, guarda en `order_draft` / `quote.*`.
