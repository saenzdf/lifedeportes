# Flujo audio + foto — cotización Life (WhatsApp)

Guía operativa para el agente vendedor y staff. **Siempre responder al cliente en texto** (WhatsApp escrito). Nunca enviar nota de voz de vuelta.

---

## Principio: un solo pipeline de cotización (gradual)

Da igual si el cliente escribe, habla o manda foto — al final debe quedar:

1. **Tipo de prenda** (camiseta sola dry-fit, uniforme completo, buzo, etc.)
2. **Cantidad** (≥ 6 del mismo diseño)
3. **Variantes** (cuello, manga, tela) — de texto, transcript o foto
4. **Validación con el cliente** (sobre todo si hubo foto) — sin precio aún
5. **`buscar_producto_odoo`** → precio **opcional**, solo si el cliente pidió valor (unidad o cantidad exploratoria)
6. Respuesta **texto** corta al cliente → `enter_waiting`

**No** saltes del paso 3 al 5 de oficio. Tras leer una foto: confirma lectura + “¿estoy en lo correcto?” y espera — salvo que en el mismo mensaje pida el precio.

---

## Regla camiseta (sin ambigüedad)

| Cliente dice | Interpretación | `garment_type` | Producto base |
|--------------|----------------|----------------|---------------|
| camiseta, camisa, camisetas | **Camiseta sola dry-fit** | `camiseta_sola` | Camiseta deportiva dry-fit (62) |
| camiseta de fútbol / camiseta futbol | **Camiseta sola dry-fit** (deporte contexto) | `camiseta_sola` + `sport: futbol` | 62 |
| uniforme, uniformes, kit, conjunto | **Uniforme completo** | `uniforme_completo` | Según deporte |
| solo camisa / solo la camiseta | Camiseta sola (refuerzo explícito) | `camiseta_sola` | 62 |

**No preguntar** “¿solo camiseta o uniforme?” si dijeron **camiseta** o **camiseta de fútbol**.

**Sí preguntar** solo si mezclan señales: ej. *“10 camisetas para el equipo”* sin decir uniforme ni “solo camiseta” → *“¿Necesita solo la camiseta dry-fit o el uniforme completo (camiseta, pantaloneta y medias)?”*

---

## Cadena con function Life (recomendada)

Tras `ask_about_file` (si hay foto), llamar **`interpretar_intencion_cotizacion`**:

- Entrada: `message_text`, `transcript`, `photo_description`, `visual_hints`, `quantity`
- Salida: `ready_for_buscar_producto`, `buscar_producto_odoo_input`, `phase`, `suggested_customer_question`

Si `ready_for_buscar_producto` → pasar `buscar_producto_odoo_input` a **`buscar_producto_odoo`**.

Código: `functions/lib/quote_intent_parser.js` · Deploy: `interpret-quote-intent` · Doc: `docs/agent_tools_media_pipeline.md`

## Audio — cómo funciona (Kapso, sin nodo extra)

Kapso **transcribe automáticamente** cada nota de voz. El mensaje del agente incluye:

```
Audio attached (audio_xxx.ogg) [...] URL: https://app.kapso.ai/...
Transcript: <texto hablado>
```

### Pasos del agente

1. **Leer `Transcript:`** del último mensaje (no usar `ask_about_file` para audio).
2. Si el transcript es basura (`[ruido]`, `[phone ringing]`, vacío, sin intención comercial):
   - Responder **en texto** pidiendo aclaración (máx. 2 veces).
   - Frase: *"Qué pena, no logro entender bien el audio. ¿Me confirma por aquí para qué producto y cuántas unidades necesita?"*
   - Si sigue sin entenderse, ofrece que el cliente puede pedir un asesor y usa `enter_waiting`. No hagas handoff automático.
3. Si el transcript es válido → **tratarlo como si el cliente hubiera escrito ese texto** (misma Fase 1–3).
4. Opcional: `save_variable` → `vars.media` = `{ type: "audio", transcript: "...", confidence: "high|junk", used_for: "quote_context" }`.
5. Si hace falta contexto de mensajes anteriores → `get_whatsapp_context`.

**No existe** function de transcripción en el grafo Life v10 — Kapso ya lo hizo.

---

## Foto — análisis de referencia de camiseta/uniforme

Usar **`ask_about_file`** solo para imagen/PDF/Excel (no audio).

### Pasos

1. `get_whatsapp_context` → URL del adjunto (`media_data.url`).
2. `ask_about_file` con **una pregunta estructurada** (una llamada por foto por turno):

**Pregunta estándar para foto de prenda:**

> Describe esta imagen para cotización Life Deportes: (1) ¿Es camiseta sola o uniforme completo visible? (2) ¿Cuello polo con/sin botones, cuello V, redondo u otro? (3) ¿Manga corta, larga o sisa/china? (4) ¿Colores principales? (5) ¿Deporte si se infiere?

3. Con la respuesta de la tool, armar:
   - `photo_description` — resumen en una frase
   - `visual_hints` — lista corta: `["cuello polo sin botones", "manga corta", "dry fit"]`
4. Si el cliente **también escribió o habló** cantidad/deporte en el mismo turno o en mensaje anterior → combinar transcript + hints (guardar en `quote.*` si aplica).
5. **Respuesta de ese turno (obligatorio):** resume lo visto + pide aprobación. Ejemplo: *“Según la foto, son camisetas de fútbol negras, cuello en V, manga corta. ¿Es ese el diseño que quieren replicar?”*  
   **Prohibido en ese mensaje:** cualquier `$`, unitario, total (aunque sea entre paréntesis), abono, tiempos, “¿desea avanzar…?”. Tener cantidad en el hilo **no** autoriza a adelantar el precio.
6. Si la foto es solo diseño/colores pero **falta cantidad** → tras validar lectura, preguntar cantidad (otro turno).
7. Precio con `buscar_producto_odoo` solo en un turno posterior, cuando el cliente pida cotización/precio o confirme que le cotices.

### Árbol visual → producto

| En la foto se ve | `garment_type` | `collar` / `sleeves` | Siguiente paso |
|------------------|----------------|----------------------|----------------|
| Solo parte superior (sin short visible) | `camiseta_sola` | según cuello/manga | `buscar_producto_odoo` |
| Camiseta + pantaloneta (+ medias) | `uniforme_completo` | según cuello/manga | + deporte si falta |
| Cuello con botones / placket | polo | `polo_con_botones` o `polo_sin_botones` | confirmar botones si no es claro |
| Cuello tipo camisa con cuello | polo | `polo_sin_botones` habitual | |
| Cuello V o redondo | dry-fit normal | `cuello_v` o `cuello_redondo` | base $30k camiseta / $50k uniforme |
| Manga larga | — | `manga_larga` | +$3k |
| Manga sisa / china | atletismo o femenino | `manga_sisa` | |
| Solo logo/diseño, prenda genérica | inferir del texto del cliente | — | no inventar prenda |

---

## Audio + foto en el mismo turno (o seguidos)

Orden recomendado en **un solo run** del agente:

```
1. Leer Transcript (audio) → producto, cantidad, deporte en texto
2. Si hay imagen en el mismo mensaje o es el adjunto más reciente:
     get_whatsapp_context → ask_about_file → visual_hints
3. Fusionar mentalmente:
     product_text = transcript + resumen foto
     garment_type / collar / sleeves / sport desde reglas camiseta + árbol visual
4. Responder en TEXTO corto: validar lectura + ¿estoy en lo correcto? (sin precio)
5. enter_waiting — esperar confirmación / pedido de precio
6. Solo después, si pide valor → buscar_producto_odoo → unitario + total (sin CTA robótico)
```

### Ejemplo

**Cliente:** [audio 15s] + [foto camiseta]

- Transcript: *"Hola, necesito 12 camisetas de fútbol como esta de la foto"*
- ask_about_file: cuello V, manga corta, dry fit
- Guardar en `quote.*` producto + qty + hints (sin cotizar aún)
- Respuesta texto: *“Según la foto, son camisetas de fútbol, cuello en V, manga corta. ¿Es ese el diseño que quieren replicar?”*
- **Prohibido** añadir *“(El precio es $30.000… para 12 serían…)”* — esa frase solo si después preguntan cuánto cuesta.

### Ejemplo solo audio

- Transcript: *"Buenas, quiero cotizar 20 uniformes de voleibol"*
- Sin foto → no `ask_about_file`
- `garment_type: uniforme_completo`, `sport: voleibol`, quantity 20
- Respuesta: confirmar 20 uniformes voleibol + una pregunta útil (tela/manga) **sin** precio, salvo que el audio diga *cuánto cuestan*.

### Ejemplo solo foto

- Texto: *"Esta es la referencia"* + imagen
- ask_about_file primero
- Validar lectura + *¿es ese el diseño?* — sin `$`
- Si no dijo cantidad: en **otro** turno preguntar cuántas unidades / deporte

### Ejemplo cuando SÍ dan precio (reserva de frase)

- Cliente: *"¿Cuánto cuesta la camiseta?"* o *"para 12 cuánto sería?"*
- Entonces sí: `buscar_producto_odoo` → *“El precio por camiseta es de $30.000; para 12 el total sería $360.000.”*

---

## Persistencia sugerida (`save_variable`)

```json
{
  "media": {
    "type": "audio|image|mixed",
    "transcript": "...",
    "photo_summary": "...",
    "visual_hints": ["cuello polo", "manga corta"],
    "confidence": "high|low|junk",
    "used_for": "quote_context"
  },
  "quote": {
    "product_text": "...",
    "quantity": 12
  }
}
```

---

## Errores a evitar

1. Usar `ask_about_file` en un `.ogg` (no funciona — usar Transcript).
2. Cotizar de oficio tras foto/cantidad sin que pregunten el valor (incl. precio entre paréntesis).
3. Preguntar camiseta vs uniforme cuando dijeron **camiseta** o **camiseta de fútbol**.
4. Responder con audio al cliente (solo texto).
5. Inventar cuello/manga que no viste en foto ni dijo el cliente.
6. Ignorar el transcript cuando audio + foto vienen juntos — el audio suele traer cantidad y deporte.

---

## Verificación en Kapso

En el proyecto Life, confirmar en UI que **WhatsApp Data / transcripción de audio** está activa. Sin eso, el agente no verá `Transcript:` y debe pedir texto o escalar.

Referencia interna: `kapso/docs/kapso_voice_media_standard.md`.
