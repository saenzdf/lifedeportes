# PRESEAS #14 — Paola · Kapso → Odoo

## Kapso

- **Ejecución:** `70ab1f72-22b4-47b4-b87b-475f5399b840` (2026-07-06, terminó en **handoff**)
- **Staff:** Paola (`573213988464`) · Proyecto Paola (id 9)
- **Motivo handoff:** `validate-staff-write` bloqueó por `formal_quote_requested` (ya corregido en grafo v10)

## Adjuntos en Kapso

| Tipo | Cantidad |
|------|----------|
| Fotos diseño (JPEG) | 7 |
| Excel | **No** — lista vino en texto del hilo (formato multi-sección PRESEAS) |

Fotos descargadas en `scratch/preseas/images/` y adjuntas al SO.

## Lista parseada (15 filas)

| Producto | Cant. |
|----------|-------|
| Chaqueta Rompevientos (papás, **con forro**) | 4 |
| Camiseta dry-fit (papás + COACH) | 3 |
| Uniforme fútbol (incl. 2 arqueros) | 8 |

Detalle en `draft_payload.json` y nota HTML del presupuesto.

## Odoo producción — creado

| Campo | Valor |
|-------|-------|
| **SO** | **S02570** (id 2568) |
| **CRM** | lead 3437 |
| **Partner** | PRESEAS (2617) |
| **Estado** | borrador |
| **Base imponible** | $750.000 |
| **Total con IVA** | $892.500 |

### Líneas

| Producto | Qty | Precio u. |
|----------|-----|-----------|
| Diseño (504) | 1 | $0 |
| Uniforme fútbol medias semipro (11155) | 8 | $50.000 |
| Chaqueta con forro (11740) | 4 | $65.000 |
| Camiseta dry-fit corta V (11788) | 3 | $30.000 |

### Adjuntos SO

7 imágenes de referencia de diseño.

## Lección — lista vs líneas SO (jul 2026)

Paola corrigió **S02570** manualmente: en el **texto/nota** estaban bien los **8 uniformes de fútbol** (bloque 4 de la lista PRESEAS, filas 8–15), pero al subir **faltaba la línea comercial** `Uniforme de Fútbol × 8` en el presupuesto — solo quedaban chaquetas + camisetas + diseño.

**Checklist antes de dar por subido un PRESEAS multi-producto:**

| Fuente | Debe cuadrar |
|--------|----------------|
| Texto agente / `order_note_html` | 4 chaquetas + 3 camisetas + **8 uniformes** |
| Líneas `sale.order.line` | Diseño $0 + **Uniforme × 8** + Chaqueta × 4 + Camiseta × 3 |
| `order_draft.commercial.lines` | 3 líneas con qty 8 / 4 / 3 |

No confiar solo en `order_draft.detail` si `parse_status: partial` — en este caso marcó las 15 filas como «uniforme» y no alimentó bien las líneas comerciales.

**Segunda lista PRESEAS:** el bloque «Uniformes de fútbol (8 u.)» es la base del pedido (`commercial_role: base_uniform`); chaquetas y camisetas papá/coach van como **extra**.
