# Staff — lista de pedido (tools determinísticas)

Guía para el agente **staff** (`agent_1780762885818`). El agente **orquesta**; las tools escriben `order_draft`. El **grafo** (tras `complete_task`) crea CRM/SO, Formulario y sube adjuntos a Odoo.

## Índice rápido

| Paso | Tools | Resultado |
|------|-------|-----------|
| 1 | `get_variable` + `get_whatsapp_context` | Estado + hilo (3–5 msgs) |
| 2 | `clasificar_adjuntos_pedido` | `suggested_tools` + layout |
| 3 | `parsear_lista_excel_pedido` / `_texto_` / `_imagen_` | `order_draft.detail` |
| 4 | `registrar_adjuntos_pedido` | Staging en Kapso (**no** Chatter Odoo aún) |
| 5 | `fusionar_borrador_lista` | Resumen + líneas comerciales |
| 6 | (opcional) `buscar_producto_odoo` por línea | Precio/match live |
| 7 | `complete_task` + `write_mode` | Grafo escribe Odoo |

**Hard rule Odoo:** Kapso crea SO **borrador** — nunca confirma. Operaria revisa en Odoo.

## Detección de formato (no asumir por extensión)

- **Excel (`.xlsx`):** la tool analiza encabezados. Si es formato Life → `layout: formato_life_v1`. Si no → `layout: generic` / espejo en nota + heurísticas para líneas comerciales.
- **Word (`.docx`):** solo si la tabla tiene columnas Día de la Familia (UNIFORME NIÑOS / CAMISETA DAMA / CABALLERO) → `family_day_docx_v1`. Otro Word ≠ este formato automáticamente.
- **Texto / imagen:** parser de líneas; si hay secciones (`Chaquetas papás:`) → multi-producto; si no → best-effort.

Catálogo de casos: `kapso/docs/casos_lista_pedido_staff.md`. Formato no listado → máxima precisión con heurísticas + espejo; subir borrador aunque `partial`.

## Flujo por turno (lista + adjuntos)

1. `get_variable` — `order_draft`, `quote`, `lead` / `crm`
2. **`get_whatsapp_context`** — leer el hilo staff (nombre cliente, lista, Excel, fotos). **No pedir teléfono** al cliente; eso es del agente vendedor. Ej. cliente recurrente: **PRESEAS 14** → `quote.customer_display_name`.
2b. Si el hilo trae nombre de cliente/equipo → **`buscar_oportunidad_odoo`**. Si la opp **ya existe** (ej. «Oportunidad de DANIEL TOVAR»): el tool deja `lead.id` + `quote.customer_display_name`. **No repreguntar nombre** ni pedir CONFIRMO por nombre; seguir con parse/adjuntos y `complete_task` `opportunity_only` para completar esa opp.
3. Si hay archivos → **`clasificar_adjuntos_pedido`**
4. Según `suggested_tools` y **`layout`** devuelto por la organización de datos:
   - **Excel** (`.xlsx`) o **Word lista** (`.docx`, formato Día de la Familia) → **`parsear_lista_excel_pedido`**
   - **PDF FORMATO LIFE** (export del Excel, con texto) → **`parsear_lista_pdf_pedido`** (`file_url`). Layout tipificado: `formato_life_pdf_v1`.
   - **PDF solo imagen** (sin texto) → `ask_about_file` con pregunta fija PDF → **`parsear_lista_pdf_pedido`** con `vision_text` (OCR/visión Kapso).
   - **Texto pegado** o transcript → **`parsear_lista_texto_pedido`** con `text`
   - **Imagen lista** → `ask_about_file` con pregunta fija abajo → **`parsear_lista_imagen_pedido`** con `vision_text`
   - **Diseño / mockup** → **`registrar_adjuntos_pedido`** (`design_reference`)
5. **Antes de CRM o presupuesto:** si hubo fotos/Excel en el hilo, **siempre** `registrar_adjuntos_pedido` (aunque también parseaste). Eso **deja los archivos en `order_draft`**; el upload a Chatter Odoo lo hace el writer del grafo al `complete_task`, no esta tool sola.
6. Siempre → **`fusionar_borrador_lista`**
   - Sincroniza líneas comerciales desde la lista (también si es un solo producto: N camisetas → qty N).
   - El estimado comercial es **provisional** (`estimate_source=list_detail`) hasta el presupuesto.
7. **Estimado sin texto explícito:** si hay lista o el hilo dice «20 uniformes» / «7 camisetas», **no pidas estimado**. El gate `validate_staff_write` arma `quote.estimate` + líneas. Si no hay ni lista ni número en el chat, ahí sí pide un estimado corto.
7. Mostrar `layout`, `parse_report`, `warnings` y resumen en español (sin nombres `vars.*`). Si `generic` o `partial`, subir **borrador** con warnings en nota — corrección en Odoo.

## Pregunta fija — imagen / PDF lista (`ask_about_file`)

```
Extrae SOLO un JSON array de objetos con keys: numero, nombre, talla, manga, genero (masculino|femenino), arquero (true|false). Sin markdown ni texto extra.
```

Luego pasa la respuesta a `parsear_lista_imagen_pedido` o `parsear_lista_pdf_pedido` como `vision_text`.

## PDF FORMATO PEDIDO LIFE (`formato_life_pdf_v1`)

Export PDF del Excel Life (capa de texto, no solo escaneo):

| Señal | Valor tipificado |
|-------|------------------|
| Layout | `formato_life_pdf_v1` |
| Filas | `No. · NOMBRE EN UNIFORME · TALLA · NUMERO` + marca Camiseta/ESQUELETO |
| Tool | `parsear_lista_pdf_pedido` (texto embebido) |
| Solo imagen | `needs_ocr` → `ask_about_file` → `vision_text` |

Ejemplo validado: DANIEL TOVAR S02792 — 15 filas (SARA…SANCHEZ), disciplina baloncesto, media blanco, estilo ESQUELETO.

## Prioridad de fuentes

1. Excel o Word lista (más fiable) — también queda en `order_draft.attachments` como `detail_list`
2. Texto estructurado
3. Imagen (visión + parser texto)

Si hay Excel/Word **y** texto, preferir el archivo.

---

## Texto con secciones (ej. PRESEAS — varios productos en una lista)

Si la lista trae bloques con encabezado:

```
Chaquetas papás:
1. NOMBRE · #65 · XXL
Camisetas papás:
5. NOMBRE · #65 · XXL
Uniformes:
8. NOMBRE · #12 · S (azul)
```

El parser asigna **producto por sección** (no todo como uniforme):

| Sección | Producto |
|---------|----------|
| Chaquetas papás | Chaqueta Rompevientos **con forro** (+$5k vs sin forro; variante Odoo 68) |
| Camisetas papás / camiseta profe (COACH) | **Camiseta deportiva dry-fit** (62) — misma prenda; coach = sin dorsal, texto «COACH» en impresión |
| Uniformes | Uniforme de Fútbol |

**Cliente recurrente PRESEAS:** en pedidos anteriores (ej. #11, #13) las camisetas adulto fueron **Camiseta deportiva dry-fit**; las chaquetas de papás llevan **forro**. No confundir chaquetas con uniforme ni con sudadera Orión.

Tras `fusionar_borrador_lista`, revisar `order_draft.commercial.lines` (3 líneas típicas: chaquetas · camisetas · uniformes). Llamar **`buscar_producto_odoo`** **una vez por línea comercial** con `variant_notes: "con forro"` en chaquetas.

---

Tabla: columna izquierda = **familia**; columnas de producto:

| Columna | Producto |
|---------|----------|
| UNIFORME NIÑOS | Uniforme niño (masc.) |
| CAMISETA DAMA | Camiseta mujer |
| CAMISETA CABALLERO | Camiseta hombre |

**Regla clave:** el producto lo define la **columna**, no el texto de la celda. Cada fila (familia) puede tener 0–3 ítems — solo donde haya texto en esa columna.

Ejemplo familia **CRISTOFER** (una fila, tres columnas con datos):

- Col uniforme niños → `Andrade #22 talla 4-6` → 1 uniforme niños
- Col camiseta dama → `(Andrade #28 xs) (Andrade #07 L)` → 2 camisetas dama
- Col camiseta caballero → `Andrade #04 talla s` → 1 camiseta caballero

La siguiente familia puede tener otra combinación (solo dama, solo niños, etc.).

Celdas con varias personas en la misma columna: entre paréntesis o líneas `Apellido # dorsal talla X`.

- Comentario `Familia [nombre]` en cada fila organizada
- **HTML en Odoo:** tablas agrupadas por familia (no por género/manga); resumen uniforme niños · dama · caballero
- Misma tool **`parsear_lista_excel_pedido`**
- `layout`: `family_day_docx_v1`

---

## Excel FORMATO PEDIDO LIFE — reglas de organización de datos (jul 2026)

### Pestaña

- Lista en **`formato life`** (también `formatolife`).
- Si el Excel tiene varias pestañas sin esa nombre → la tool pide cuál usar (`needs_sheet_choice`).

### Mapa de columnas (fila de encabezado)

| Col | Encabezado | Uso |
|-----|------------|-----|
| A | No. | Número de jugador si NUMERO vacío; si ambos, gana NUMERO |
| B | NOMBRE EN UNIFORME | Nombre impreso |
| C | TALLA | S, M, L, XL… |
| D | NUMERO | Dorsal preferente (si vacío, usar No.) |
| E | Larga/Corta | Manga larga o corta |
| F | MAS | X = género masculino |
| G | FEM | X = género femenino |
| H | Camiseta | Validación pre-ingreso / pista — **no** columna Formulario |
| I | Uniforme | Validación pre-ingreso / pista — **no** columna Formulario |
| J | ARQUERO | X = arquero (colores invertidos, sin cargo diseño) |
| K | COMENTARIO | Notas; curso/pago → registro |
| L… | OBSERVACIONES (si existe) | Se une a COMENTARIO con ` · ` — **sin** inventar etiquetas |
| (opcional) | DELANTERA / TRASERA | **Solo** si el encabezado las nombra explícitamente → `Delantera: … · Trasera: …` |
| (opcional) | PRECIO / VALOR | **No** va a la lista HTML ni al comentario |

Valores plantilla numéricos en casillas (ej. `104` en XML) **no** son marcas — solo cuenta **X** (u homólogos).

### Fidelidad al Excel (hard rule)

- **No inventar** ni una palabra que no esté en el archivo. Interpretar (unir columnas, tipar X) sí; inventar etiquetas o texto, no.
- COMENTARIO + OBSERVACIONES → juntos en el rol/comentario HTML.
- `Delantera` / `Trasera` **solo** si el Excel sale del formato estándar y el encabezado lo dice explícitamente (caso PRESEAS). Si el archivo trae OBSERVACIONES/PRECIO, **no** reclasificarlos como delantera/trasera.
- Caso Fredy Bram (S02789): columnas K/L/M = COMENTARIO · OBSERVACIONES · PRECIO — el parser no debe emitir «Delantera:»/«Trasera:».

### Bloques masculino / femenino

1. **Masculino**: filas con **MAS** (X). Si no marcan Camiseta ni Uniforme → pista **uniforme** (validación, no columna Formulario).
2. **Femenino**: filas con **FEM** (X), o tras terminar el bloque MAS. Si no marcan producto → pista **camiseta**.
3. **No.** cuenta como dorsal si NUMERO está vacío; en femenino a veces No. vacío y solo NUMERO — OK.

### Arquero — reglas estrictas

- **Sí es arquero**: columna **ARQUERO** (X) **o** comentario con «arquero» / «portero».
- **No es arquero**: fila con solo Camiseta (X) sin ARQUERO ni comentario arquero.
- **Prohibido**: inventar arqueros por dorsal (#4, #68, #24…), por repetir número, ni por «bloque camiseta» genérico.
- **Arquero masculino** sin Camiseta/Uniforme marcados → **uniforme** por defecto (anotación arquero en lista; mismo precio, sin línea SO aparte).
- **Arquero femenino** → **camiseta** (comentario en columna K si aplica).
- **Texto en columna Camiseta/Uniforme** (no es X): nota de impresión — ej. `SOLO PANTALONETA` → solo short, **no** suma en uniforme ni camiseta.
- Los comentarios (columna K y notas en celdas de producto) deben verse en la lista HTML.
- Típico: **un arquero masc + un arquero fem** (ej. David #99 uniforme larga + Liset #99 camiseta).

### HTML en tarea / nota SO (jul 2026)

Generado por `build_odoo_order_note` tras parsear:

1. **Resumen por variante (manga)** — uniforme/camiseta corta y larga; arqueros con nota «sin cargo adicional».
2. **Tablas agrupadas**: masculino manga corta · masculino manga larga · femenino manga corta (rol sin repetir «Corta/Larga»).
3. Columnas: N° · Nombre · Talla · Rol / variante (arquero = prefijo «Arquero (colores invertidos)»).

### Dorsales repetidos

- Válido en femenino (varias jugadoras con el mismo **NUMERO**).
- Cada fila es una prenda distinta (nombre + talla identifican la línea).

### Respuesta de `parsear_lista_excel_pedido`

La tool devuelve además de las filas:

| Campo | Contenido |
|-------|-----------|
| `layout` | `formato_life_v1` \| `generic` |
| `sheet_name` | Pestaña leída |
| `parse_report` | Conteos (M uniforme, F camiseta, arqueros, mangas) + `hints` |
| `color_media` / `disciplina` | Cabecera Excel si existe |
| `warnings` | Incluye hints de formato life |

**Mostrar a operaria** `parse_report.summary_text` y lista de arqueros si hay.

### Errores frecuentes del cliente (validar con operaria)

- Talla o producto mal marcado en una fila (ej. arquero que en realidad es uniforme).
- **Nombre vacío en columna B (uniformes):** intencional — solo dorsal/talla en impresión; el parser conserva `nombre` vacío y marca `nombre_vacio_impresion`. No rellenar con placeholder salvo camisetas (`Camiseta #N`).
- **Columnas DELANTERA / TRASERA:** solo si el encabezado las declara. Texto por fila (y filas de especificación de bloque sin jugador) → comentario/rol HTML (`Delantera: … · Trasera: …`). Si el Excel trae **OBSERVACIONES** (u otra nota) y no dice delantera/trasera, unir al comentario **sin** esas etiquetas. **PRECIO** no entra a la lista.
- **Nunca inventar** texto ausente en el Excel (ni «Delantera», ni dorsales, ni arqueros).
- **Excel PRESEAS multi-sección:** filas `Chaquetas papás:`, `Uniformes:` activan producto por bloque (igual que lista texto).
- Excel desactualizado en Odoo vs archivo nuevo en WhatsApp → preferir el **último Excel** del hilo.

---

## Variables que escriben las tools

| Variable | Contenido |
|----------|-----------|
| `order_draft.detail.rows[]` | numero, nombre, talla, grupo, rol, manga, arquero |
| `order_draft.detail.parse_report` | Resumen Excel formato life (solo tras parsear Excel) |
| `order_draft.detail.summary_text` | Resumen corto para WhatsApp |
| `order_draft.detail.parse_status` | ok \| partial \| needs_review |
| `order_draft.attachments[]` | url, filename, role (`detail_list` \| `design_reference`) |
| `order_draft.blockers[]` | Huecos críticos |

El grafo genera HTML (`sale.order.note`) y sube adjuntos al SO en `odoo-create-lead-and-so`.

## Tools — resumen

| Tool | Cuándo |
|------|--------|
| `clasificar_adjuntos_pedido` | Hay adjuntos en el hilo |
| `parsear_lista_excel_pedido` | Excel de tallas o Word lista familia |
| `parsear_lista_pdf_pedido` | PDF FORMATO LIFE (texto) o vision_text tras ask_about_file |
| `parsear_lista_texto_pedido` | Texto pegado / JSON de visión |
| `parsear_lista_imagen_pedido` | Tras ask_about_file en foto lista |
| `registrar_adjuntos_pedido` | Referencias diseño sin parsear filas |
| `fusionar_borrador_lista` | Tras organizar lista |

## Prohibido

- Armar filas manualmente en `save_variable` si hay tool disponible
- Inventar tallas, dorsales, arqueros **ni ninguna palabra** no presente en el Excel/archivo
- Etiquetar Delantera/Trasera si el archivo no trae esas columnas/encabezados
- Reinterpretar filas camiseta femenina como arqueros masculinos
