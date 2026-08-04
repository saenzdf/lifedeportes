# Payload Formulario v1 + confrontación híbrida

Contrato **Kapso → Odoo** (ADR 0005 / 0006). Kapso **no** es dueño de las celdas del Formulario Life.

## Attachment

| Campo | Valor |
|-------|--------|
| `ir.attachment.name` | `formulario_payload_v1.json` |
| `res_model` | `sale.order` |
| `mimetype` | `application/json` |

## Schema (`schema_version: formulario_payload_v1`)

```json
{
  "schema_version": "formulario_payload_v1",
  "built_at": "ISO-8601",
  "fingerprint": "string|null",
  "meta": { "source": "kapso", "parse_status": "partial|ok|…", "layout": "formato_life_v1|…" },
  "commercial": { "lines": [{ "product_text", "quantity", "product_variant_id", "category" }] },
  "lines": [{
    "line_id", "product_base", "product_variant_id", "quantity", "category", "confidence",
    "principal": { "cuello", "manga", "genero", "deporte" },
    "otros": { "tela", "medias", "tipo_pantalon", "forro" },
    "attributes": {}, "comments": ""
  }],
  "units": [{
    "row", "nombre", "numero", "talla", "color_medias", "comentario", "product_hint"
  }],
  "totals": { "person_count", "line_qty", "qty_match": true|false|null }
}
```

## Timing

1. Crear **Borrador Odoo** + Plantilla venta → Formulario nativo (ODOO.LIST / XLOOKUP).
2. Adjuntar Payload.
3. Fill Odoo (automation o `kapso/scripts/fill_formulario_from_payload.js`) **después**.

## Checklist confrontación híbrida

### Grave (bloquea write / fill)

- Sin líneas comerciales (`no_lines`)
- `product_base` vacío
- Cantidad ≤ 0
- Schema inválido
- Producto irresoluble en **todas** las líneas (sin variant) **y** sin CONFIRMO staff

### Aviso (`needs_review`, no bloquea)

- `parse_status: partial` con variantes high
- Personas ≠ suma cantidades
- **`names_without_product`**: filas Aprobación con Nombre/Talla y Producto vacío → primera intención *faltan productos en SO* (o plantilla Pedido→Aprobación no expande)
- **`people_exceed_line_qty`**: personas payload > qty líneas
- Sin unidades (lista vacía) pero hay líneas
- Diffs suaves payload vs sheet tras fill
- Sinónimo regional / confidence medium (vendedor decide)

## Código

- Lib: `kapso/functions/lib/payload_formulario.js`
- Fill PoC: `kapso/scripts/fill_formulario_from_payload.js`
- Writer flag: `FORMULARIO_FILL_MODE=payload|cells|both` (default `payload`)
