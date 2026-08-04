# HTML nota SO / descripción tarea

Mismo contenido en `sale.order.note` y `project.task.description`.

## Estructura

```html
<h1>[Equipo o referencia]</h1>

<h2>Resumen por producto y manga</h2>
<ul>
  <li><strong>Uniforme manga corta:</strong> N u.</li>
  <li><strong>Uniforme manga larga:</strong> N u.</li>
  <li><strong>Camiseta manga corta:</strong> N u.</li>
  <li><strong>Camiseta manga larga:</strong> N u.</li>
</ul>

<hr>

<h2>Lista de jugadores (Masculino) — Uniforme (conjunto) · Manga corta</h2>
<!-- tabla -->

<h2>Lista de jugadores (Masculino) — Uniforme (conjunto) · Manga larga</h2>
<!-- tabla -->

<h2>Lista de jugadores (Masculino) — Camiseta · Manga corta</h2>
<!-- tabla -->

<!-- Luego femenino con el mismo orden: Uniforme → Camiseta → Pantaloneta; dentro, corta → larga -->
```

## Agrupación (obligatoria)

Orden de tablas:

1. **Género** (Masculino → Femenino → general)
2. **Producto**: Uniforme (conjunto) → Camiseta → Pantaloneta → Otro
3. **Manga**: corta → larga → mixta → otra

Filas con desglose `2 LARGA+1 CORTA` se **expanden**: aparecen en manga larga (cant. 2) y manga corta (cant. 1) del mismo producto.

## No incluir

- Cliente, teléfono, WhatsApp.
- Precios, subtotales, IDs de variante Odoo.
- Línea de producto separada para arquero.

## Generación

`buildOdooOrderNoteHtml({ title, detailRows, designNotes? })` en `kapso/functions/lib/build_odoo_order_note.js`.

Tras cambiar el lib, re-bundle Kapso: `node kapso/scripts/bundle_odoo_order_note.js` (+ lanes de corrección / staff según deploy).

Entrada `detailRows[]`: `numero`, `nombre`, `talla`, `grupo`, `rol`, `manga`, `arquero`, `camiseta`, `uniforme`, `cantidad`, `manga_parts`.
