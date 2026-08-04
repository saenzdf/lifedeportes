# Plantilla Formulario pedido Life v2 (preparar en Odoo)

Objetivo: que la **Calculadora / Plantilla venta** ya traiga el formato ADR 0003, sin que Kapso mute tablas ni fórmulas. Context7 Odoo 19: listas con `ODOO.LIST` / `ODOO.LIST.HEADER`; plantillas en Documentos → Configuración → Plantillas de hojas de cálculo; la SO copia el template vía `sale.order.template.spreadsheet_template_id`.

## Problema visto en S02642

1. **Match visual útil:** filas con Nombre/Número/Talla (C–E) y **Producto (B) vacío** → primera intención: *faltan productos en el pedido* (o la expansión Pedido→Aprobación no cubre la qty). Código: `names_without_product` / `people_exceed_line_qty` en confrontación híbrida.
2. Columna B hoy = `XLOOKUP` → `Pedido!A` = `product_id` **display completo** (`Uniforme de Fútbol (Medias…, Cuello…)`). Queremos **solo producto base**; atributos en columnas propias.

## Diseño de plantilla (hacer en UI Odoo test, luego copiar a prod)

### Pestaña Pedido (1 fila = 1 línea SO)

| Col | Contenido | Notas |
|-----|-----------|--------|
| A | `=ODOO.LIST(…,"product_id")` | Display Odoo (referencia) |
| B | `=ODOO.LIST(…,"product_uom_qty")` | Qty |
| C–D | precios (opcional) | Como hoy |
| E | Valido | Como hoy |
| F | Cumqty correcta | `F2=IF(E2,B2,0)`; `F3=F2+IF(E3,B3,0)` … **excluir Diseño** en Valido |
| **I** | **Producto base** | Fórmula: texto antes de ` (` en A, o campo Studio `x_product_base` vía `ODOO.LIST` |
| J–M | Cuello / Manga / Género / Deportes | Vacías o desde attrs (fase 2) |
| N–O | Otros / Comentario línea | Opcional |

No renombrar la hoja si hay `Pedido!` en fórmulas Aprobación.

### Pestaña Aprobación (1 fila = 1 unidad)

| Col | Header | Origen |
|-----|--------|--------|
| A | Idx | `=SEQUENCE(MAX(Pedido!F:F))` spill |
| B | **Producto** | `=XLOOKUP(A2, Pedido!F:F, Pedido!I:I, "", 1, 1)` → **base**, no display largo |
| C | Nombre en camiseta | Fill Kapso/Odoo (string plano) |
| D | Numero en camiseta | Fill |
| E | Talla uniforme | Fill |
| F | Color medias | Fill |
| G | Producto base | Opcional espejo / vacío |
| H | Cuello | Fill o XLOOKUP línea |
| I | Largo Manga | Fill |
| J | Género | Fill |
| K | Deportes | Fill |
| L | Otros atributos | Fill concat |
| M | Comentario | Fill |

Tabla estática `A1:M200` (o `A1:F200` hasta que G–M estén listos). **Celdas = strings planos**, nunca `{content:…}`.

### Autofill B

A2 SEQUENCE hace spill; B2 debe autofill / array para cada idx. Verificar en UI que B se rellena hasta `MAX(F)` (hoy a menudo solo cubre la 1ª línea de producto).

### Excluir Diseño del cumqty

En Valido (E): `=IF(AND(A2<>"", ISNUMBER(B2), B2>0, NOT(REGEXMATCH(A2,"(?i)dise[nñ]o"))), 1, 0)`  
Así SEQUENCE no reserva slots para la línea Diseño $0.

## Cómo editar (Odoo 19)

1. Ventas → Configuración → **Plantillas de cotización** → Plantilla venta → abrir Calculadora / spreadsheet template (id 11 en test).
2. O Documentos → Configuración → **Plantillas de hojas de cálculo** (docs Odoo 19).
3. Ajustar fórmulas → **File → Save as template** / guardar el `sale.order.spreadsheet` template ligado.
4. Probar en SO borrador nueva (no mutar snapshots viejos a mano vía XML-RPC salvo restore).

## Kapso / fill

- Sigue escribiendo **solo C–F** (y luego H–M cuando la plantilla ya tenga headers).
- No expandir tablas ni pisar A/B.
- Confrontación: `names_without_product` = aviso `needs_review`.

## Checklist manual plantilla

- [x] Pedido!I = producto base (fórmula LEFT/FIND) — aplicado en template **11** test 2026-07-12; **prod** 2026-07-21
- [x] Aprobación B → XLOOKUP a Pedido!I
- [x] Diseño fuera de cumqty (Valido E)
- [x] LIST indices consecutivos (row→idx)
- [x] Cumqty F limpia (`F2=IF(E2=1,B2,0)` …)
- [x] Headers G–M ADR 0003
- [ ] SO nueva abre Calculadora sin crash Owl — **verificar en UI**
- [ ] 2 líneas producto expanden B en todas las filas — **verificar en UI** (S02642)

Script: `node kapso/scripts/apply_formulario_plantilla_v2.js [--also-order S02642]`  
Prod: apuntar `ODOO_URL`/`ODOO_*` a lifedeportes.odoo.com (Plantilla venta → sheet id **11** sin `order_id`).  
Backup: `/tmp/formulario_tmpl11_before.json`
