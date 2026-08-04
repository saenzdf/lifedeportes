# Formulario Life / Calculadora de presupuestos

Smart button Odoo 19 → documento **Formulario Life**.

## Contrato C+B (ADR 0005)

1. Kapso adjunta **Payload Formulario** (`formulario_payload_v1.json`) al borrador.
2. Odoo (o PoC `fill_formulario_from_payload.js`) llena celdas **después** de existir el spreadsheet nativo.
3. Flag writer: `FORMULARIO_FILL_MODE=payload|cells|both` (default **payload**).

Ver `kapso/docs/payload_formulario_v1.md`.

## Pestañas

| Pestaña | Rol |
|---------|-----|
| **Pedido** (nativo Plantilla venta; no renombrar si hay `Pedido!`) | 1 fila = 1 línea SO (ODOO.LIST) |
| **Aprobación** (`Formulario Life (Aprobación…)`) | 1 fila = 1 unidad |

## Qué no se pisa

- Pedido: A–F (ODOO.LIST / Valido / cumqty); G–H Tallas/Colores legacy
- Aprobación: A–B (SEQUENCE / XLOOKUP)

## Fill nativo (Plantilla venta)

Si el snapshot tiene `Pedido!` + `XLOOKUP`/`ODOO.LIST`:

- Siempre **C–F** (Nombre, Número, Talla, Color media).
- **Talla** debe coincidir con `Pedido!G` (`Tallas: S`, ` Tallas: 14`, …) — `normalizeFormularioTalla`. Si se escribe solo `S`/`14`, Odoo marca puntito rojo.
- **Color media** debe coincidir con `Pedido!H` (Negro, Blanco, Azul…).
- Si la plantilla ya tiene headers ADR 0003 en G–M → también **G–M** …
- No expandir tablas ni pisar A/B.

**Formato de celdas:** strings planos (`"ANDRÉS"`), nunca `{ content: "…" }`.

Corroboración: `sale.order.note` (lista Life o espejo Excel) ↔ Formulario. La vendedora corrige desde la **descripción**.

**URL correcta:** `/odoo/sales/<so_id>/sale-order-spreadsheet/<sheet_id>`.

## Interpretación gradual

1. Descripción / nota HTML (`buildOdooOrderNoteHtml`)
2. Líneas SO (productos + qty + variantes) → crea Calculadora
3. Fill Formulario desde detalle interpretado (payload + celdas si `FORMULARIO_FILL_MODE=both`)

Flag writer: `FORMULARIO_FILL_MODE=payload|cells|both` (default **both** — Kapso llena celdas; Odoo no aplica el payload solo).

## Columnas de datos (ADR 0003)

### Principales
Producto base · Cuello · Largo Manga · Género · Deportes

### Otros atributos
Concat `Clave: valor · …`

### Comentario
Notas de persona / residuales

### Aprobación además
Nombre · Numero · Talla · Color medias

## Código

- Payload: `lib/payload_formulario.js`
- Fill celdas (legacy / PoC Odoo): `lib/sale_order_spreadsheet.js`
- Writer: `odoo_create_lead_and_so.js`
- PoC fill: `kapso/scripts/fill_formulario_from_payload.js`
