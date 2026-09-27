# Interpretación de pedido — Antigravity / ingreso Odoo

Reglas alineadas con Kapso `life_lenguaje_cliente_productos` + `quote_intent_parser` (jul 2026).

## Regla camiseta (fija)

| Entrada | Interpretación | template_id |
|---------|----------------|-------------|
| camiseta / camisa / camisetas | Camiseta sola dry-fit | 62 |
| camiseta de fútbol / camiseta futbol | Camiseta sola dry-fit | 62 |
| uniforme / uniformes / kit | Uniforme completo | ver deporte |
| solo camisa / solo la camiseta | Camiseta sola | 62 |

**No preguntar** camiseta vs uniforme si dijeron **camiseta**.

## Ambigüedad real (sí preguntar)

- *"Necesito para 15 jugadores"* sin tipo de prenda
- Foto solo diseño sin texto y no se ve pantaloneta
- Texto y foto señalan prendas distintas (por ejemplo, dice camiseta pero la referencia muestra un kit completo)

Pregunta: *"¿Solo camiseta dry-fit o uniforme completo (camiseta, pantaloneta y medias)?"*

## Deporte

| Dice | Deporte | Uniforme default |
|------|---------|------------------|
| futbol, fútbol, microfutbol, futsal | fútbol | 115 |
| baloncesto, basket | baloncesto | 23 |
| voleibol, voley, volei | voleibol | 31 |
| atletismo | atletismo | 35 |
| tenis, natación, etc. | **rechazar** | — |

## Variantes (texto o foto)

### Mapeo lenguaje cliente → atributos Odoo

| Cliente / operaria dice | Atributo Odoo (voleibol 31) | Fútbol 115 |
|-------------------------|------------------------------|------------|
| manga sisa / siza | **Siza** | — (usa Corta/Larga) |
| manga corta / manga normal | **Corta** (voleibol 31, ej. 12202 licra+V) | **Corta** (fútbol 115) |
| manga china | **China** (voleibol 31) | — |
| manga larga | — **no en voleibol** | **Larga** |

**Importante:** manga corta y manga china son **cortes distintos**. No intercambiar ni en notas ni en variantes Odoo.
| pantaloneta / hombre | **Pantaloneta** (voley) | (incluida en uniforme) |
| licra / lycra (mujer) | **Licra** (solo template 31) | **no existe** |
| cuello V | Cuello en V | Cuello en V |
| cuello redondo | Cuello Redondo | Cuello Redondo |
| cuello sport / polo sin botones (en jersey) | Cuello Personalizado o Sport | Cuello Personalizado o Sport — foto sport = solapa tipo polo **sin** botones |
| cuello personalizado / escocés / bicolor | Cuello Personalizado o Sport | Cuello Personalizado o Sport — foto personalizado = V u otro diseño a medida |
| polo con botones / camiseta polo | → template **61** (no es variante de cuello de 62) | — |

| Cliente / foto | Campo | Efecto precio |
|--------------|-------|---------------|
| polo sin botones (camiseta) | cuello polo | template 61 |
| polo (uniforme) | uniforme polo | 947 |
| manga larga (fútbol) | manga larga | variantes 10231+ o +$3k si base |
| manga china / sisa (voley) | Siza / China | variantes 11139–11146 |
| dry fit (default) | tela | base |
| dumonti / falcao | tela premium | +costo (685 camiseta, uniforme según catálogo) |
| pant. impermeable | microfútbol | 1815 |
| mariposa | baloncesto | variantes 23 |

### Validación obligatoria de variante (antes de `sale.order.line`)

1. Identificar **deporte** → template (voley **31**, fútbol **115**, etc.).
2. `search_read` `product.product` con `product_tmpl_id` = template.
3. Leer `product_template_attribute_value_ids` de cada variante y armar la combinación (pantalon + cuello + manga).
4. Si la combinación pedida **no existe**:
   - **No** crear la línea con otra variante “parecida”.
   - **No** usar fútbol + precio manual para licra.
   - Anotar en `note` / `order_draft.blockers` y **preguntar a la operaria** (una pregunta por mensaje) o rechazar el ingreso hasta aclarar.
5. Si hay varias variantes en el mismo pedido (ej. 6 sisa pant + 6 licra china), usar **una línea Odoo por variante** con el `product.product` id exacto.
6. Tallas/nombres/dorsales van en la tabla de la nota; no sustituyen la variante de producto.
7. En la nota y en la tarea: **no** repetir nombre/teléfono del cliente ni precios (ver [notas-odoo.md](notas-odoo.md)).

## Foto / referencia visual

Si la operaria describe una foto:

1. ¿Solo parte superior o también short? → camiseta vs uniforme
2. ¿Cuello polo (cuello con solapa) o V/redondo?
3. ¿Manga corta, larga o sisa?
4. Anotar colores en `sale.order.note`

### Prioridad variantes (cuello, manga, tela, forro)

1. **Explícito** del cliente/operaria (campo o texto del pedido) **gana siempre**.
2. Si el pedido **no** especifica esa variante → tomarla de la **foto / `visual_hints` / `photo_description`**.
3. Si texto y foto chocan en un atributo → queda el texto; no pisar con la foto.
4. Si texto y foto chocan en **tipo de prenda** (camiseta vs uniforme) → **preguntar** (no inventar).

Código: `resolveVariantAttr` en `kapso/functions/lib/product_match_engine.js` (`attr_sources`: `explicit` | `text` | `photo`).

## Audio / transcript

- Pegar `Transcript:` tal cual Kapso lo muestra.
- Si transcript basura (`[ruido]`, vacío) → pedir texto a operaria; no inventar producto.
- Combinar transcript (cantidad/deporte) + descripción foto (cuello/manga).

## Cantidad

- Número + prenda: *"12 camisetas"*, *"20 uniformes"*
- Campo + arquero: *"20 de campo y 2 arqueros"*
  - Si el arquero lleva **pantaloneta** (mismo diseño de los jugadores pero en diferente color): 20 línea jugador (template 115) + 2 línea arquero en pantaloneta (template 115, mismo precio base $50k / $53k si es manga larga).
  - Si el arquero lleva **pantalón** (buzo manga larga acolchado + pantalón acolchado): 20 línea jugador (template 115) + 2 línea conjunto de arquero (template **178**, $70.000 c/u).
- Docena = 12
- &lt; 6 → no crear; informar mínimo

## Errores a evitar al ingresar

1. Ingresar **uniforme 115** cuando pidieron **camiseta** (usar 62).
2. Preguntar camiseta vs uniforme cuando ya dijeron camiseta.
3. Asumir que el arquero con pantalón cuesta lo mismo que el uniforme de campo en pantaloneta (el conjunto con pantalón es template 178 a $70.000).
4. Mezclar arquero en la misma línea/cantidad que jugadores sin línea aparte si son productos o variantes distintas.
5. Usar `product.template` id en `sale.order.line` (usar variante `product.product`).
6. Omitir línea Diseño 504 a $0.
7. Poner **fútbol (115)** cuando el deporte es **voleibol** (31).
8. Línea con **licra** sobre template **115** — no existe; licra es atributo del uniforme de voleibol.
9. Asignar **manga larga** en voleibol — no hay variante; solo Siza o China.
10. Una sola línea genérica “uniforme” sin el `product.product` id de la variante correcta.
11. Inventar precio $55.000 u otro sin variante Odoo que lo soporte (usar `list_price` de la variante).
