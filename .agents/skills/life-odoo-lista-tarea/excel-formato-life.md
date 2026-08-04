# Excel FORMATO PEDIDO LIFE — columnas y reglas

Pestaña: **`formato life`** (alias `formatolife`).  
**Única pestaña a leer.** Ignorar `Hoja1` / `Hoja2` (curso, pago, producción).  
**Única lógica de parseo:** `kapso/functions/lib/parse_life_excel.js` (vía `parse_list_bytes` / `parsear_lista_excel_pedido` / `sync_lista_pedido_to_odoo.js`).

## Layout estándar (plantilla)

| Col | Encabezado | Regla |
|-----|------------|-------|
| A | No. | Número de jugador si **NUMERO** viene vacío; si ambos existen, gana **NUMERO**. En layout **CANTIDAD** (sin columna NUMERO), No. es solo índice de fila — **no** dorsal. |
| B | NOMBRE EN UNIFORME | Nombre impreso |
| C | TALLA | S, M, L, XL… (por persona) |
| D | **NUMERO** *o* **CANTIDAD** | Ver variantes abajo |
| E | Larga/Corta | Manga → atributo Largo Manga; puede traer desglose con cantidades |
| F | MAS | X = género **masculino** |
| G | FEM | X = género **femenino** |
| H | Camiseta | **X** = la fila es camiseta (pista de producto) |
| I | Uniforme | **X** = la fila es uniforme (pista de producto) |
| J | ARQUERO | X = arquero → Comentario + flag (no producto SO) |
| K | COMENTARIO | Libre; curso/pago/etc. se conservan en `registro` |
| L… | OBSERVACIONES (si existe) | Se une a COMENTARIO con ` · ` (sin inventar etiquetas) |
| (opcional) | DELANTERA / TRASERA | Solo con encabezado explícito |
| (opcional) | PRECIO | Ignorar en lista HTML |

## Fidelidad (no inventar)

El parser **no** puede añadir palabras que no existan en el Excel. Unir COMENTARIO+OBSERVACIONES está bien; inventar «Delantera:»/«Trasera:» porque hay celdas a la derecha de K **no**. Caso Fredy Bram (S02789): K/L/M = comentario · observaciones · precio.

## Variante D = NUMERO (plantilla clásica)

- Col D = dorsal preferente.
- Cada fila = **1 unidad** (salvo que manga/comentario indiquen otra cosa).
- `cantidad` default = 1.

## Variante D = CANTIDAD (caso Patricia Blanco / S02103)

Cuando el encabezado de D es **CANTIDAD** (no NUMERO):

1. Leer solo pestaña **`formato life`**.
2. Cada fila con datos = **1 línea de pedido**; `cantidad` = valor de D (entero ≥ 1).
3. **X en Uniforme (I)** → uniforme; **X en Camiseta (H)** → camiseta. No inferir al revés.
4. Manga (E) puede desglosar las unidades de esa fila:
   - `2 LARGA+1 CORTA` → 2 u. manga larga + 1 u. manga corta (debe sumar la CANTIDAD).
   - `3 LARGA` / `3 CORTA` → las N unidades de esa manga.
   - `LARGA` / `CORTA` + CANTIDAD 1 → una unidad.
5. Filas vacías de plantilla (solo No. 9, 10…) y notas de pie (especificación pantaloneta sin talla/marcas) → **no** cuentan como líneas.
6. Totales comerciales = **suma de unidades** (no “número de filas”). Contadores SO usan `manga_parts` + `cantidad`.

### Ejemplo S02103 Patricia Blanco

| # | Nombre | Cant. | Manga | Tipo |
|---|--------|------:|-------|------|
| 1–4 | SEBASTIAN…JORNELL | 3 | 2 LARGA+1 CORTA | Uniforme |
| 5 | STIKY | 3 | 3 LARGA | Uniforme |
| 6 | PETER L. | 3 | 3 CORTA | Camiseta |
| 7–8 | (sin nombre) | 1 | LARGA | Camiseta |

→ **8 filas · 20 unidades** · uniforme 11 larga + 4 corta · camiseta 3 corta + 2 larga.

## Metadatos cabecera

| Campo | Uso |
|-------|-----|
| COLOR DE MEDIA | Color medias (Aprobación); ≠ Tipo de Medias |
| DISCIPLINA | Deportes / match de Producto base |

## Camiseta / Uniforme (fase actual)

- Se **leen** (marca **X**) para tipar la fila y cruzar con el producto cotizado **antes de subir**.
- **No** se proyectan como columnas del Formulario Life.
- Texto no-X (ej. `SOLO PANTALONETA`) → comentario/nota.

## Defaults de pista comercial (sigue en parser)

Solo cuando **no** hay X en H ni I:

| Contexto | Pista `product_choice_hint` |
|----------|----------------------------|
| Fila masculina sin marca H/I | uniforme |
| Fila femenina sin marca H/I | camiseta |
| Arquero masculino | uniforme |
| Arquero femenino | camiseta |

Si hay X, la marca manda.

## Arquero

- Marca: col J o comentario con «arquero» / «portero».
- **No** marcar arquero solo por dorsal.
- En HTML: rol «Arquero (colores invertidos)»; sin cargo diseño extra.

## Registro (curso / pago)

Si el comentario (u otras celdas) trae curso, pago, forma de pago, Katu, etc. → `row.registro` + `parse_report.registro_hints`. No descartar info arbitraria.

## Formulario Life

Correlación completa: `kapso/docs/formato_life_column_correlation.md`.

Implementación: `parse_life_excel.js` → `layout: formato_life_v1` · helpers `parseMangaUnitParts` · campo fila `cantidad` / `manga_parts`.
