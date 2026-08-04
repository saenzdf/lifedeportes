# Variantes Odoo Life — referencia staff (jul 2026)

Guía para **ingreso de pedidos** y `buscar_producto_odoo`. Siempre resolver `product.template` → `product.product` con atributos reales.

**Regla crítica:** **manga corta ≠ manga china** — son cortes distintos. No intercambiar en notas, líneas ni interpretación.

---

## Uniforme de voleibol (template **31**) — 12 variantes @ $50.000

Atributos: **Tipo pantalon** × **Cuello** × **Largo manga**

| Tipo pantalon | Cuello | Largo manga | id ejemplo |
|---------------|--------|-------------|------------|
| Pantaloneta | Cuello en V | Siza | 11139 |
| Pantaloneta | Cuello en V | China | 11140 |
| Pantaloneta | Cuello en V | **Corta** | 12200 |
| Pantaloneta | Cuello Redondo | Siza | 11141 |
| Pantaloneta | Cuello Redondo | China | 11142 |
| Pantaloneta | Cuello Redondo | **Corta** | 12201 |
| **Licra** | Cuello en V | Siza | 11143 |
| **Licra** | Cuello en V | China | 11144 |
| **Licra** | Cuello en V | **Corta** | **12202** |
| **Licra** | Cuello Redondo | Siza | 11145 |
| **Licra** | Cuello Redondo | China | 11146 |
| **Licra** | Cuello Redondo | **Corta** | 12203 |

**Licra / lycra** existe en voleibol (31) y atletismo (35) con sobrecosto +$5.000, **no** en fútbol (115).

**Manga larga** no existe en voleibol Odoo — anotar excepción en nota (+$3.000 si aplica) o preguntar operaria.

### Mapeo lenguaje → voleibol

| Operaria / lista dice | Atributo Odoo | No confundir con |
|----------------------|---------------|------------------|
| manga sisa / siza | Siza | Corta |
| manga corta / manga normal / MC | **Corta** | China |
| manga china | China | Corta |
| pantaloneta (hombre) | Pantaloneta | Licra |
| licra / lycra (mujer) | Licra | Pantaloneta |

---

## Uniforme de fútbol (template **115**)

Atributos: **Tipo medias** × **Cuello** × **Largo manga** × **Tipo pantalón** × **Tela** (+ Género, Tallas)

Sobrecostos por atributo (Odoo `price_extra`): manga Larga +$3.000, cuello Sport/Personalizado +$3.000, pantaloneta impermeable +$8.000, pantaloneta con bolsillos +$5.000, Tela Dumonti +$15.000, Medias Profesionales +$7.000.

| Cuello | Manga | id ejemplo (medias semi) |
|--------|-------|--------------------------|
| Cuello en V | Corta | **10219** |
| Cuello Redondo | Corta | **10220** |
| Cuello en V | Larga | 10231 |
| Cuello Redondo | Larga | 10232 |

**No existe licra** en fútbol 115. Si piden licra → deporte voleibol (31).

### Mapeo lenguaje → fútbol

| Dice | Variante |
|------|----------|
| manga corta / normal | Corta |
| manga larga | Larga (+$3.000 c/u si base) |
| cuello V | Cuello en V |
| cuello redondo | Cuello Redondo |
| medias semi | Medias Semiprofesionales (incluidas en base) |
| medias pro | Medias Profesionales (+costo) |

---

## Casos reales (jul 2026)

| Pedido | Masculino | Femenino |
|--------|-----------|----------|
| GUAINÍA fútbol | Cuello **redondo** → 10220 | Cuello **V** → 10219 |
| Hub Ball voleibol | Pantaloneta sisa V → 11139 | Licra **manga corta** V → **12202** (no 11144 China) |

---

## Varias variantes en un pedido

- **Una línea Odoo por `product.product` id** (no mezclar variantes en una sola línea).
- Tallas/nombres/dorsales → tabla HTML en `sale.order.note` y `project.task.description` (mismo HTML).
- **No** poner precios ni teléfono del cliente en la nota HTML.

---

## Línea Diseño

- Producto **504**, qty 1, **price_unit 0** en pedidos ≥ 6 u.

---

## Validación antes de `sale.order.line`

1. Deporte → template correcto.
2. `search_read` variantes del template.
3. Si combinación **no existe** → bloqueador; no usar variante “parecida”.
4. SO confirmado: no `unlink` líneas; qty 0 + línea nueva.
