# Confrontación Kapso↔Formulario en modo híbrido

La validación Payload vs Formulario Life es **híbrida**: evidencia siempre (score, diffs, `needs_review`); bloqueo solo en fallos graves (sin líneas comerciales, producto irresoluble, mínimo 6 sin CONFIRMO staff). El vendedor sigue siendo quien resuelve ambigüedad regional o briefs fuera de estándar.

## Dos canales (no forzar cuadre)

| Canal | Fuente | Qué mide |
|-------|--------|----------|
| **A — Comercial** | Líneas SO / `resolved_lines` | Cantidad de productos cotizados |
| **B — Detalle** | Excel Life / lista texto / OCR foto → columnas C–F | Nombres, números, tallas |

Si A y B coinciden → OK. Si no → **problema visible** (`needs_review`), no un fallo del chequeo.

**Anti-patrón:** inventar `JUGADOR N`, padear filas desde `qty`, o rellenar Formulario desde un CSV/fallback “para que cuadre”. Eso enmascara pedidos rotos (p. ej. PRESEAS Excel que el parser no entiende).

## Match de primera intención (2026-07-12)

Filas en Aprobación con **Nombre/Talla y Producto vacío** (`names_without_product`) o `person_count > line_qty` (`people_exceed_line_qty`) → señal operativa de que **faltan productos en el pedido** (o la plantilla no expande Pedido→Aprobación). No bloquea solo; marca `needs_review`.

También: `people_short_of_line_qty` / `lines_without_people` cuando hay qty SO y Formulario vacío o corto (parse Excel/OCR falló).

Producto en columna B debe ser **producto base** (plantilla v2), no el display largo de variante — ver `kapso/docs/formulario_plantilla_v2.md`.
