---
name: life-odoo-lista-tarea
description: >-
  Toma pedidos o tareas en Odoo Life Deportes: lee lista desde Excel FORMATO PEDIDO LIFE,
  Word lista familia (.docx) o imagen, genera HTML agrupado por manga y escribe project.task.description y sale.order.note.
  Usar al pedir actualizar lista en tarea, pasar Excel a descripción de tarea, sincronizar
  detalle de pedido Odoo, o corregir líneas SO según lista.
---

# Lista de pedido → tarea / nota Odoo (Life Deportes)

Flujo para **operación**: partir de un SO o tarea ya existente, parsear la lista (Excel o imagen) y volcar el detalle formateado en Odoo **sin precios ni datos del contacto**.

## Cuándo usar

- «Actualiza la tarea con este Excel»
- «Pasa la lista a la descripción del pedido S02564»
- «Sincroniza tallas desde imagen/lista en Odoo»
- Tarea en etapa diseño/coordinación con lista nueva en WhatsApp

**No** usar para crear SO desde cero → ver skill `life-odoo-ingreso-pedidos`.
Para la guía conceptual y detallada de flujos, casos de uso y parseo, ver skill maestro [`life-guia-flujos-y-listas`](../life-guia-flujos-y-listas/SKILL.md).

## Entrada

| Fuente | Cómo parsear |
|--------|----------------|
| Excel `.xlsx` | Pestaña **`formato life`** — `parseListAttachmentBytes` (local) o tool Kapso `parsear_lista_excel_pedido` |
| Word `.docx` | Tabla Día de la Familia — misma tool/parser unificado (`parseListAttachmentBytes`) |
| Imagen lista | Visión → JSON filas → `parsear_lista_imagen_pedido` o guardar JSON y script local |
| Texto pegado | `parsear_lista_texto_pedido` |

Prioridad: **Excel/Word > texto > imagen**.

## Fidelidad al Excel (hard rule)

- **No inventar** texto: ni Delantera/Trasera, ni dorsales, ni arqueros, ni una palabra de más.
- COMENTARIO + OBSERVACIONES → unidos en el HTML; PRECIO no entra a la lista.
- `Delantera` / `Trasera` **solo** si el encabezado del archivo lo dice explícitamente.

## Salida (mismo HTML en ambos)

1. `sale.order.note`
2. `project.task.description` (tarea vinculada al SO, si existe)

Generar con `buildOdooOrderNoteHtml` (`lifedeportes/kapso/functions/lib/build_odoo_order_note.js`).

### Formato HTML (jul 2026)

**Excel FORMATO LIFE** — agrupa por **género → producto (uniforme / camiseta) → manga** (corta/larga).

**Word Día de la Familia** (`family_day_docx_v1`) — agrupa **por familia**:
1. Resumen por producto (uniforme niños · camiseta dama · camiseta caballero)
2. Una tabla por familia (`Familia CRISTOFER`, etc.) con columna **Producto**

**Excel (general):**
2. **Resumen de uniformes** — bullets por **manga corta / larga** y género; cantidades sin precios.
3. **Arquero** — solo anotación en lista («colores invertidos, sin cargo adicional»); **no** línea SO aparte.
4. **Tablas** agrupadas:
   - Masculino — Uniforme · manga corta / larga
   - Masculino — Camiseta · manga corta / larga
   - Femenino — Camiseta · manga corta
   - (mismo patrón para pantaloneta si aplica)
5. Columnas: **N°** · **Nombre** · **Talla** · **Cant.** (si qty>1) · **Rol / variante** (sin repetir manga/producto si ya está en el título).

Detalle completo: [formato-html.md](formato-html.md) y [excel-formato-life.md](excel-formato-life.md).

## Reglas Excel FORMATO PEDIDO LIFE

- **Solo pestaña `formato life`** (no Hoja1/Hoja2).
- Col **No.** (A) → dorsal solo si existe columna **NUMERO** y viene vacía; si D = **CANTIDAD**, No. es índice.
- Dorsal = col **NUMERO** (cuando existe).
- Si D = **CANTIDAD**: unidades por fila; manga puede ser `2 LARGA+1 CORTA` / `3 LARGA`. Totales = suma de unidades, no de filas.
- **X en Camiseta (H)** / **X en Uniforme (I)** tipan la fila (manda sobre defaults).
- **MAS** / **FEM** definen bloque; fem sin **No.** es normal.
- **Arquero**: col J (X) o comentario «arquero»; **no** inferir por dorsal repetido.
- Arquero **masculino** sin producto marcado → **uniforme** (factura en línea uniforme según manga).
- Arquero **femenino** → **camiseta**.
- Solo **X** en casillas (no números plantilla tipo 104).
- Caso documentado: S02103 Patricia Blanco → 8 filas / 20 u. Ver [excel-formato-life.md](excel-formato-life.md).

## Flujo agente (Cursor + MCP Odoo)

```
1. Identificar pedido
   - Número SO (S02564 / 2564) o id project.task
   - MCP: search_read sale.order / project.task

2. Obtener filas
   - Archivo local → `node kapso/scripts/sync_lista_pedido_to_odoo.js --file=...` (Excel o Word)
   - O leer bytes y `parseListAttachmentBytes` en memoria

3. buildOdooOrderNoteHtml({ title, detailRows, designNotes? })

4. Escribir Odoo (prod solo si el usuario lo pide)
   - sale.order.write → note
   - project.task.write → description

5. Opcional --sync-so
   - countRowsBySoLineBucket + syncSoLinesFromProductMix
   - Ajusta qty en líneas uniforme/camiseta corta/larga (nunca producto «arquero»)
```

## Script local (recomendado)

Desde `lifedeportes/`:

```bash
# Solo HTML en nota + tarea
node kapso/scripts/sync_lista_pedido_to_odoo.js \
  --order=2564 \
  --file="/ruta/Copia de FORMATO PEDIDO LIFE 1.xlsx" \
  --prod

# Word lista familia
node kapso/scripts/sync_lista_pedido_to_odoo.js \
  --order=2536 \
  --file="/ruta/LISTADO.docx" \
  --prod

# Por id de tarea
node kapso/scripts/sync_lista_pedido_to_odoo.js --task=2358 --file="..." --prod

# Ajustar cantidades SO según lista
node kapso/scripts/sync_lista_pedido_to_odoo.js --order=2564 --excel="..." --sync-so --prod

# Filas ya parseadas (p. ej. desde imagen)
node kapso/scripts/sync_lista_pedido_to_odoo.js --order=2564 --rows-json=filas.json --prod
```

Credenciales: `.env` con `ODOO_LIFEDEPORTES_PROD_*` para `--prod`.

## Kapso staff (WhatsApp)

1. `clasificar_adjuntos_pedido` → `parsear_lista_excel_pedido` (o imagen/texto).
2. `fusionar_borrador_lista` → mostrar `parse_report` a operaria.
3. `corregir_pedido_odoo` si hay que alinear líneas SO con la lista.

KB agente: `lifedeportes/kapso/knowledge/life_lista_pedido_staff_v1.md`.

## Prohibido en nota/tarea

- Nombre cliente, teléfono, montos, precios unitarios, totales.
- Inventar arqueros o dorsales no parseados.
- Línea de producto «arquero» en el SO.
- **Renombrar** oportunidad, `x_studio_nombre_del_pedido` o tarea sin orden explícita de staff. El nombre staff manda; refs de diseño van en nota/adjuntos. `--title` del script solo pisa el H1 de la lista si se pasa a propósito — por defecto reusa nombre studio / título existente / partner.

## Validación rápida

Tras escribir, comprobar:

- Conteo filas = filas Excel con datos.
- `parse_report.summary_text` (arqueros, mangas) coherente con operaria.
- Buckets SO: `countRowsBySoLineBucket(rows)` vs líneas presupuesto.

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `kapso/functions/lib/parse_list_bytes.js` | Router Excel / Word |
| `kapso/functions/lib/parse_life_excel.js` | Parser Excel formato life |
| `kapso/functions/lib/parse_family_day_docx.js` | Parser Word lista familia |
| `kapso/functions/lib/build_odoo_order_note.js` | HTML agrupado |
| `kapso/functions/lib/odoo_order_correction.js` | Buckets y sync líneas SO |
| `kapso/scripts/sync_lista_pedido_to_odoo.js` | Script unificado |
| `kapso/knowledge/life_lista_pedido_staff_v1.md` | KB Kapso staff |
