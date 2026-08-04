# E2E 4 casos — Formulario + ingreso (2026-07-12)

Odoo **test**. Interpretación gradual:

1. **Descripción** (`sale.order.note`) — lista entendida (`buildOdooOrderNoteHtml`): Life → tablas por género/manga/familia; no reconocido → **espejo Excel** (`mirror_v1`).
2. **SO** — productos / qty / variantes.
3. **Formulario** Calculadora — C–F + H–M (nombre, #, talla, color, cuello, manga, género, deporte, otros, comentario).

No forzar cuadre inventando personas desde qty SO. Canales A/B separados (ADR 0006).

| Caso | Origen | SO | Nota | Formulario |
|------|--------|----|------|------------|
| **c1** | Excel FORMATO LIFE | S02643 · Unif×8 | Tablas jugadores | 8 · attrs H/I |
| **c2** | Texto Kapso + lista | S02645 · Unif×16 | Tablas jugadores | 16 · attrs |
| **c3** | Fotos sin OCR | S02644 · Unif×20 | Resumen comercial; sin filas | 0 · needs_review hasta OCR |
| **c4** | PRESEAS Excel no Life | S02646 · 8+3+4 | **Espejo Excel** | 15 filas sección best-effort + attrs |

## Hallazgos

### Gradual restaurado
- Nota ya no es atajo narrativo `<pre>`: usa `lib/build_odoo_order_note.js` (bundle al writer).
- Fill nativo plantilla v2: `native_aprobacion_cf_hm` cuando hay headers G–M.
- `FORMULARIO_FILL_MODE=both` en E2E.

### c4 PRESEAS
- Parser Life: 0 filas (`generic`).
- Nota: espejo (no reinterpretar a Life).
- Formulario: secciones del Excel (best-effort), no inventadas desde qty.
- Comercial: 8+3+4 canal aparte.

## Artefactos
`scratch/e2e_4casos_2026-07-12/` · `kapso/scripts/run_e2e_4casos.js` · ADR 0006 · `notas-odoo.md`
