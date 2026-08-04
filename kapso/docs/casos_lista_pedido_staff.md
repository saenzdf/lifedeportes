# Casos — lista de detalle staff (ingreso pedido)

Catálogo de **casos conocidos** y reglas de parseo para el agente **ingreso pedido** (`agent_1780762885818`).

Referencias: `knowledge/life_lista_pedido_staff_v1.md`, tests en `tests/run_order_detail_tools_tests.js`.

---

## Principio: detectar, no asumir

**No todo `.xlsx` es formato Life. No todo `.docx` es Día de la Familia.**

| Extensión | Lo que hace el sistema |
|-----------|------------------------|
| **Excel** | Intenta pestaña `formato life` → analiza encabezados (`analyzeLifeExcelLayout`). Si coinciden columnas Life → `formato_life_v1`. Si **no** → `generic` + warning. |
| **Word** | Lee tabla del docx. Si encabezados son UNIFORME NIÑOS / CAMISETA DAMA / CABALLERO → `family_day_docx_v1`. Otros Word → hoy parseo limitado; operaria valida o se documenta caso nuevo. |
| **PDF** | Texto embebido FORMATO LIFE → `formato_life_pdf_v1` (`parsear_lista_pdf_pedido` / webhook). Solo imagen → `needs_ocr` → `ask_about_file` + `vision_text`. |
| **Texto / imagen** | Parser de líneas; si hay encabezados de sección (`Chaquetas papás:`) → multi-producto. Si no → filas best-effort. |

**Flujo esperado del agente:**

1. Parsear con la tool que corresponda al adjunto.
2. Leer **`layout`**, **`parse_status`**, **`warnings`**, **`parse_report`**.
3. Si `layout !== formato_life_v1` o `parse_status` es `partial` / `needs_review` → aplicar heurísticas (espejo, secciones texto) y **subir borrador**; la operaria corrige y confirma en Odoo.
4. Si aparece un patrón nuevo recurrente → añadirlo a este catálogo y al parser.

La **mayoría** de pedidos siguen siendo Excel **formato life** estándar (caso A). Los demás casos de esta lista son **variantes detectables** — ejemplos reales, no reglas por extensión de archivo.

**PRESEAS (cliente recurrente):** su Excel con DELANTERA/TRASERA **no tiene script propio** — cae en **Caso F** (espejo fiel a la nota del SO). Las cantidades y productos Odoo salen del **texto en hilo** (Caso I) o del agente/script de pedido. Ver `diagnostico_flujo_detalle_pedido.md`.

---

## Matriz — señales de detección → parser

Cada fila es un **caso que el sistema intenta reconocer**. Si las señales no aparecen, aplica el fallback de la columna «Si no coincide».

| # | Caso (si detecta…) | Señales en el archivo | Layout / parser | Si no coincide |
|---|-------------------|----------------------|-----------------|----------------|
| A | **Formato Life estándar** | Pestaña `formato life` + columnas NOMBRE/TALLA/NUMERO/MAS/FEM/Camiseta/Uniforme | `formato_life_v1` | → F |
| B | Excel PRESEAS (ejemplo F) | Columnas `DELANTERA`/`TRASERA`, grid no Life estándar | **`mirror_v1`** (espejo) | → F; no forzar `formato_life_v1` |
| C | Excel Life multi-sección | Filas `Chaquetas papás:`, `Uniformes:` en Excel Life | `formato_life_v1` + secciones | → A sin secciones |
| D | Life solo pantaloneta | Texto `SOLO PANTALONETA` en col. Camiseta/Uniforme | `formato_life_v1` + `pantaloneta` | → A |
| E | Excel varias pestañas | Sin `formato life` | `needs_sheet_choice` | Operaria elige pestaña → A o F |
| F | **Excel no estándar** | Grid sin encabezado Life | `generic` + warning | Revisión operaria; posible caso nuevo |
| G | **Word Día de la Familia** | Tabla con UNIFORME NIÑOS / CAMISETA DAMA / CABALLERO | `family_day_docx_v1` | Word con otra tabla → revisión manual |
| H | Texto libre | Mensaje pegado, sin bloques de sección | `parse_life_text_lines` | `partial` si líneas irregulares |
| I | Texto multi-sección (ej. PRESEAS hilo) | Bloques `Chaquetas papás:` / `Uniformes:` | `list_section_products` → **commercial.lines** | → H |
| J | Foto lista | Imagen + JSON visión | Igual que H/I | Pedir Excel o texto |
| M | **PDF FORMATO LIFE** | Export PDF del Excel Life con capa de texto (No./NOMBRE/TALLA/NUMERO + Camiseta/ESQUELETO) | **`formato_life_pdf_v1`** | Solo imagen → ask_about_file → J |
| K | Solo diseño | Imagen/PDF sin filas | `registrar_adjuntos_pedido` | — |
| L | Audio transcrito | Transcript en hilo | Igual que H | Validar con operaria |

**Siempre después de parsear:** `fusionar_borrador_lista` → revisar `layout`, `parse_status`, `warnings`, `order_draft.commercial.lines`.

## Caso A — Formato Life estándar (baseline)

**Cuándo aplica:** `layout === formato_life_v1` tras `parsear_lista_excel_pedido` (pestaña `formato life` y encabezados reconocidos).

**No asumir** solo por ser `.xlsx` — confirmar `layout` en la respuesta de la tool.

**Columnas clave:** `NOMBRE EN UNIFORME`, `TALLA`, `NUMERO` (dorsal), `Larga/Corta`, `MAS`, `FEM`, `Camiseta`, `Uniforme`, `ARQUERO`, `COMENTARIO`.

**Reglas:**

- Dorsal = columna **NUMERO** (columna `No.` se ignora).
- Bloque **masculino** (`MAS` = X): sin marca Camiseta/Uniforme → **uniforme** por defecto.
- Bloque **femenino** (`FEM` = X): sin marca → **camiseta** por defecto.
- **Arquero:** solo si `ARQUERO` = X o comentario «arquero»/«portero» — no inventar por dorsal.
- Valores plantilla (`104` en celdas) **no** son marcas; solo cuenta `X`.
- Femenino sin nombre en columna B → `Camiseta #N` (placeholder); no es error.
- Salida: `parse_report` con conteos M/F, arqueros, mangas + `warnings`.

**Ejemplo test:** grid Beltrán (arqueros David #99 + Liset #99, camisetas fem sin nombre, dorsales #24 repetidos).

---

## Caso B — Excel PRESEAS (documentación → Caso F espejo)

**No es un parser dedicado.** El Excel de PRESEAS (columnas DELANTERA/TRASERA, filas spec, nombres vacíos) es un **ejemplo real de Excel no reconocido**: la información va a la nota del SO **igual que la tabla fuente** (`mirror_v1`).

**Señales (para detectar que NO es Life A):**

- Columnas `DELANTERA`, `TRASERA` u otras fuera del estándar Life.
- Filas de especificación sin jugador (ej. `LOGO PRESEAS` | `NOMBRE + #`).
- Grid que no pasa `analyzeLifeExcelLayout` sin warnings.

**Qué hace el sistema:**

- `espejar_excel_a_nota` → HTML tabla fiel en `sale.order.note`.
- **No** reinterpretar a filas Life ni rellenar placeholders.
- Líneas comerciales y conteos → **script de pedido** (texto Caso I, agente, operaria).

**Fixture de prueba:** PRESEAS Excel 3 uniformes (MARTIN LEURO + filas solo dorsal #12 / #8) — validar espejo, no parse Life.

---

## Caso C — Excel Life multi-sección (PRESEAS varios productos)

**Señales:** fila encabezado de bloque en columna A o texto de celda:

```
Uniformes:
Chaquetas papás:
```

**Parser:** `detectListSectionHeader` → `product_line_key` por sección.

| Sección | Producto comercial |
|---------|-------------------|
| Chaquetas papás | Chaqueta Rompevientos **con forro** |
| Camisetas papás / profe | Camiseta deportiva dry-fit |
| Uniformes | Uniforme de Fútbol |

Misma lógica que caso I (texto). Tras merge → **3 líneas comerciales** típicas.

---

## Caso D — Solo pantaloneta (formato Life)

**Señal:** en columna Camiseta o Uniforme hay **texto** (no X), ej. `SOLO PANTALONETA`.

**Parser:** `pantaloneta: true` — no suma como uniforme ni camiseta; nota en rol/comentario HTML.

**Ejemplo test:** filas ANTIGUA (fem + masc solo short).

---

## Caso E — Excel ambiguo (varias pestañas)

**Señal:** no existe pestaña `formato life` / `formatolife`.

**Parser:** `pickLifeExcelSheet` → `needs_sheet_choice: true`; agente pregunta cuál pestaña usar.

---

## Caso F — Excel no estándar (fallback + espejo)

**Cuándo aplica:** `layout === generic` / `mirror_v1` — grid sin encabezado Life reconocido. **Incluye Excel PRESEAS** (Caso B documentado).

**Qué hace el parser:**

1. Leer grid crudo de la hoja elegida.
2. Generar **`mirror_html`** para `sale.order.note` (tabla igual a fuente).
3. **No** forzar `detail.rows` tipo Life si el layout no coincide.

**Qué hace el agente / script de pedido (en paralelo):**

- Interpretar hilo, texto secciones (Caso I), o preguntar a operaria → `commercial.lines`.
- Cotejar cantidades con lo que se entiende del pedido antes de `odoo-create-lead-and-so`.

**Si el cliente manda a menudo el mismo layout raro:** evaluar script **reconocido** en manifest (ej. panamericano); si sigue siendo demasiado variable → mantener espejo.

---

## Caso G — Word Día de la Familia (solo si detecta tabla familia)

**Cuándo aplica:** `.docx` cuya primera fila de tabla tiene columnas UNIFORME NIÑOS / CAMISETA DAMA / CAMISETA CABALLERO.

**No asumir** todo Word — otros `.docx` pueden ser listas distintas; hoy no hay parser automático salvo esta tabla. Operaria valida o se registra caso nuevo.

**Regla:** producto lo define la **columna** (UNIFORME NIÑOS / CAMISETA DAMA / CAMISETA CABALLERO), no el texto de la celda.

- Varias personas en una celda → paréntesis o líneas `Apellido # dorsal talla X`.
- Comentario `Familia [nombre]` en cada fila.
- HTML Odoo agrupado por familia.

**Ejemplo test:** familia CRISTOFER (4 productos en una fila).

---

## Caso H — Texto libre (sin Excel)

**Señal:** operaria pega lista en WhatsApp.

**Parser:** `buildLinesFromText` / `parseLine`.

**Formatos aceptados:**

- Líneas `nombre, talla, dorsal, manga larga/corta`
- `Charli M 8 arquero`
- JSON array (salida de visión)

**Prioridad:** si en el hilo hay Excel Life, **preferir Excel** sobre texto.

---

## Caso I — Texto multi-sección (ej. PRESEAS en hilo)

**Cliente:** PRESEAS y otros que pegan listas por bloques en WhatsApp.

**Rol en arquitectura:** alimenta el **script de pedido** (`commercial.lines`), no el espejo del Excel. Típico combo PRESEAS #14: Excel → espejo en nota + este texto → 8+4+3 en líneas SO.

**Señal:** un solo mensaje con varios bloques:

```
Chaquetas papás:
1. NOMBRE · #65 · XXL
Camisetas papás:
5. ...
Camiseta profe:
7. COACH · sin dorsal · L
Uniformes:
8. ... arquero
```

**Parser:** `detectListSectionHeader` + `inferCommercialLinesFromDetailRows`.

**Salida esperada (PRESEAS #14):**

| Línea comercial | Cantidad | Notas |
|-----------------|----------|-------|
| Chaqueta Rompevientos | 4 | `variant_notes: con forro` (+$5k) |
| Camiseta deportiva dry-fit | 3 | papás ×2 + coach COACH sin dorsal |
| Uniforme de Fútbol | 8 | incl. 2 arqueros |

**Error histórico corregido:** antes todo se parseaba como «Uniforme × 15».

**Cotización:** `buscar_producto_odoo` **una vez por línea comercial** (chaquetas con `variant_notes: con forro`).

---

## Caso J — Imagen de lista

**Flujo:**

1. `clasificar_adjuntos_pedido` → imagen lista.
2. `ask_about_file` con prompt JSON fijo.
3. `parsear_lista_imagen_pedido` con `vision_text`.

Misma semántica que texto (caso H/I).

---

## Caso K — Solo referencia de diseño

**Archivo:** imagen/PDF diseño sin filas de jugadores.

**Tool:** `registrar_adjuntos_pedido` → `role: design_reference`. No parsea tallas.

---

## Flujo staff — casos operativos (jul 2026)

Estos no son tipos de archivo, pero afectan el ingreso:

| Caso | Comportamiento |
|------|----------------|
| **Sin teléfono cliente** | Staff **no** pide `customer_wa_id`; solo el agente vendedor. Partner Odoo por **nombre** (`PRESEAS 14` → buscar PRESEAS). |
| **Cliente desde el hilo** | `get_whatsapp_context` + mensajes previos → `quote.customer_display_name` (ej. PRESEAS 14). |
| **Confirmación** | `complete_task` de la operaria = confirmación; no `formal_quote_requested` ni handoff «humano verifica». |
| **Multi-producto** | `validate-staff-write` acepta `order_draft.commercial.lines` sin un solo `quote.product_text`. |
| **Corrección pedido** | Palabras «corregir/actualizar» + número SO → `buscar_pedido_odoo` + `corregir_pedido_odoo` (nunca `complete_task`). |

---

## Añadir un caso nuevo

Cuando llegue un archivo que **no** encaja en A ni en F de forma útil:

1. Guardar ejemplo (grid o texto anonimizado) en tests.
2. Definir **señales de detección** (encabezados, filas spec, secciones).
3. Extender parser o rama en `analyzeLifeExcelLayout` / `detectListSectionHeader` / Word.
4. Añadir fila a la matriz de este doc.

Hasta entonces: parseo genérico + confirmación operaria.

---

## Prioridad de fuentes en un mismo hilo

1. **Último Excel Life** (más fiable)
2. Word familia (si es evento Día de la Familia)
3. Texto pegado / transcript
4. Imagen (visión)

Si Excel en Odoo está desactualizado vs WhatsApp → **gana el archivo más reciente del hilo**.

---

## Checklist operaria — PRESEAS #14

- [ ] Hilo leído: nombre **PRESEAS 14** (sin pedir teléfono)
- [ ] Lista parseada (texto multi-sección o Excel con DELANTERA/TRASERA)
- [ ] 3 líneas comerciales: 4 chaquetas con forro · 3 camisetas · 8 uniformes
- [ ] Arqueros solo los marcados (2 en uniformes)
- [ ] Coach sin dorsal
- [ ] `complete_task` → SO borrador en Odoo

---

## Tests automatizados

```bash
node kapso/tests/run_order_detail_tools_tests.js   # parsers
node kapso/tests/run_staff_function_tests.js       # validate staff sin teléfono
```

Última actualización: **jul 2026** (casos PRESEAS #14, DELANTERA/TRASERA, staff sin teléfono).
