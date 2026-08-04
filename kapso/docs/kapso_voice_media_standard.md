# Kapso — voz, archivos y patrones de grafo (referencia Life Deportes)

Documento interno para alinear Life con el **estándar Kapso** (2026-07). Fuentes: [Agent node](https://docs.kapso.ai/docs/flows/step-types/agent-node), [WhatsApp data](https://docs.kapso.ai/docs/platform/whatsapp-data), [Event types / audio](https://docs.kapso.ai/docs/platform/webhooks/event-types), assets `automate-whatsapp`, grafos archivados Life.

---

## Resumen

| Tipo | Quién lo procesa | Tool del agente | ¿Nodo extra en grafo? |
|------|------------------|-----------------|------------------------|
| **Nota de voz** | Kapso (transcripción automática) | Leer `Transcript` en mensaje; opcional `get_whatsapp_context` | **No** |
| **Imagen / PDF / Excel** | Kapso multimodal vía agente | `ask_about_file` + URL de `get_whatsapp_context` | **No** |
| **Texto** | Agente directo | — | **No** |

El patrón moderno Kapso es **un agente con tools built-in**, no un subworkflow `transcribe-audio` + Decide por confianza (diseño Life v2 archivado).

---

## Servicio interno Kapso (plataforma)

### Transcripción de audio

- Kapso almacena media y genera **transcripción automática** (idioma, duración, provider) — ver WhatsApp Data.
- En webhooks / contexto del mensaje:
  - `message.kapso.content` incluye texto legible + línea `Transcript: ...`
  - `message.kapso.transcript.text` — texto estructurado
  - `message.kapso.media_data.url` — URL del `.ogg` / audio

Ejemplo real (Life, chats históricos):

```
Audio attached (audio_86f0b20b6fdf.ogg) [...] URL: https://app.kapso.ai/...
Transcript: La verdad yo tengo una agencia de publicidad y voy a patrocinar un equipo...
```

Transcripts basura observados (tratar como **no útiles**):

- `[ruido]`, `[background noise]`, `[phone ringing]`, `[outro jingle]`

### `ask_about_file` (agent built-in)

- **Para:** PDF, imágenes, texto, Office (docx, xlsx, pptx).
- **Parámetros:** `file_url` (Kapso URL desde `media_data.url`), `question`.
- **Límites:** 30 MB; xlsx primeras 10 hojas / 50 filas.
- **No documentado para audio** — no sustituye la transcripción de plataforma.

### `get_whatsapp_context`

- Teléfono, conversation id, contacto, mensajes recientes con media.
- Primer paso recomendado cuando el último mensaje trae adjunto o audio.

### `enter_waiting` + reanudación

- Cada nuevo audio del usuario **reanuda** el mismo nodo agente con contexto completo.
- No hace falta edge de vuelta desde Start para seguir charlando dentro del agente (el agente ya está en multi-turn).

### `contact_conversations` (opcional, no en Life hoy)

- Lista/lee conversaciones **anteriores** del mismo contacto.
- Útil en soporte comercial recurrente; candidato para agente histórico.

---

## Patrón estándar recomendado (por carril)

### Cliente (vendedor / histórico)

```
Mensaje (texto | audio | archivo)
  → Agente
       audio: leer Transcript inyectado
       archivo: get_whatsapp_context → ask_about_file
       enter_waiting
```

Reglas de negocio Life encima: una pregunta, no inventar precios, 6 u. mínimo, handoff si 2 audios ilegibles.

### Staff (ingreso pedido)

```
Operaria: texto | audio | Excel reenviado
  → Agente staff
       extraer → order_draft / quote.*
       buscar_producto_odoo / previsualizar_borrador_cotizacion
       complete_task → grafo escribe Odoo
```

Si reenvía audio del cliente: transcript → confirmar con operaria → `quote.customer_wa_id` manual si no está en el hilo.

---

## Grafos de referencia

### Solo en cuenta Kapso Life (API)

Un workflow publicado: `lifedeportes_sales_inbound` (v10). No hay otros proyectos en la misma API key para comparar en vivo.

### Biblioteca Kapso (`automate-whatsapp/assets`)

| Asset | Patrón útil para Life |
|-------|------------------------|
| `workflow-customer-support-intake-agent.json` | `send_text` → `wait_for_response` → **agent** (intake estructurado) |
| `workflow-api-template-wait-agent.json` | Template API → wait → agent follow-up |
| `workflow-interactive-buttons-decide-function.json` | Botones → decide function → ramas (útil si algún día router explícito) |
| `workflow-agent-simple.json` | Agent minimalista |
| `workflow-decision.json` | Decide AI vs function |

**Lección comercial:** intake con **wait + agent** o **agent puro multi-turn**; routing pesado **antes** del agente, no después (alineado con decisión Diego 2026-06-17 en cliente).

### Life — archivado (no usar)

| Grafo | Enfoque viejo | Por qué obsoleto |
|-------|---------------|------------------|
| `archive/workflow_lifedeportes_create_order_audio_v2.json` | `transcribe-order-audio` → decide confianza → handoff | Kapso ya transcribe; lógica va en **prompt del agente** |
| `workflow_media_intake_stub.json` + `media-intake-dispatcher` | Function stub multimodal | Reemplazado por **`ask_about_file`** |

---

## Life v10 — estado vs estándar Kapso

| Aspecto | Estado | Acción |
|---------|--------|--------|
| Grafo sin nodo audio dedicado | OK | Mantener |
| `ask_about_file` en agentes | OK (staff, vendedor en prompt v3) | — |
| Prompts mencionan voz / Transcript | **Gap** → snippet `_snippet_voice_media_kapso.md` | Embeber en vendedor + staff |
| `vars.media` en vars_contract | Definido | Usar desde agente con `save_variable` |
| `media-intake-dispatcher` | Archivado | No reintroducir |
| `contact_conversations` | No habilitado | Evaluar en histórico |
| Confianza transcript | Solo en prompt (2 reintentos) | Suficiente fase 1; decide function solo si métricas reales lo exigen |

---

## Mejoras sugeridas (prioridad)

1. **Prompts** — incluir snippet voz/media en vendedor, histórico y staff (hecho en `agent_staff_upload_v5`, pendiente embed vendedor vía `embed_prompts_v8.js`).
2. **Verificar en Kapso UI** — transcripción de audio activa en proyecto (WhatsApp Data).
3. **Métricas** — en entrenamiento, anotar % transcripts basura vs útiles (datos reales Life en `scratch/rule_classified.json`).
4. **No** añadir nodo `function transcribe` al grafo salvo requisito muy específico (duplica Kapso).
5. **Histórico** — probar `contact_conversations` para clientes con varios pedidos.
6. **Observer mode** — si operario usa inbox + Workflow Chat sidebar, `observer_prompt_mode: interactive_chat` (ya en agente staff); distinto del canal staff directo v10.

---

## Variables sugeridas (`vars_contract`)

```json
"media": {
  "type": "audio | image",
  "source_url": "https://...",
  "transcript": "texto Kapso o ask_about_file",
  "confidence": "high | low | junk",
  "used_for": "quote_context | order_details | design_reference"
}
```

`confidence: junk` cuando transcript ∈ etiquetas de ruido o sin intención comercial.

---

## Sync

Tras editar prompts:

```bash
cd lifedeportes/kapso
node scripts/embed_prompts_staff_v10.js    # staff
node scripts/embed_prompts_v8.js           # vendedor + histórico (si aplica)
node scripts/validate-graph-lifedeportes.js workflow_lifedeportes_sales_inbound_v10.json
# get-graph → update-graph
```

Ver también: `kapso-graph-guard` skill, `graph_architecture.md`.
