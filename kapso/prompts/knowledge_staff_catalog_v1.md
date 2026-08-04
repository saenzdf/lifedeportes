# Catálogo Life — guía para staff (match producto / variante)

Referencia para `buscar_producto_odoo`. No inventar productos ni deportes fuera de esta guía.

## Deportes que SÍ fabricamos

Fútbol, baloncesto, voleibol, atletismo.

## Deportes que NO fabricamos

Natación, ciclismo, béisbol, hockey, patinaje, motocross, porras, equitación, etc. → informar a la operaria; no buscar producto.

## Cómo habla la operaria vs producto Odoo

| Dice la operaria / cliente | Producto Odoo probable | Notas |
|---------------------------|------------------------|-------|
| camiseta / camisa / camiseta de fútbol | **Camiseta dry-fit sola** (62) | No preguntar por uniforme; solo “uniforme” o “kit” significa conjunto completo |
| uniforme de fútbol / kit futbol | Uniforme de Fútbol dry-fit | Incluye camiseta + pantaloneta + medias semi |
| camiseta normal / camiseta dry fit | Camiseta deportiva dry-fit | Manga corta, cuello V/redondo |
| camiseta polo / foto con cuello polo | Camiseta polo sin botones | Si dice “uniforme polo”, usar uniforme de presentación |
| uniforme baloncesto | Uniforme de baloncesto | Short tipo mariposa habitual |
| uniforme voleibol | Uniforme de voleibol | Short lycra habitual |
| uniforme atletismo | Uniforme de atletismo | Camiseta manga sisa |
| uniforme presentación | Uniforme de presentación | Precio mayor |
| pantaloneta lycra | Pantalonetas en lycra | Atletismo / voleibol |
| pantaloneta impermeable | Pantalonetas impermeables / Uniforme con pant. impermeable | Microfútbol |
| medias semi / medias pro | Medias semi / Medias profesionales | Semi van en uniforme fútbol base |
| conjunto arquero | Conjunto de arquero | Manga larga, distinto color |
| gorras, banderas, sudaderas | Ver catálogo otros | Mínimo 6 u. también aplica |

## Dimensiones de variante (interpretar del texto o foto)

- **Tipo prenda:** uniforme completo | camiseta sola | pantaloneta | medias | arquero
- **Cuello:** V/redondo (base) | polo sin botones | polo con botones | sport (+costo)
- **Manga:** corta (base) | larga (+$3k camiseta / uniforme) | sisa (atletismo) | ranglan
- **Tela:** dry fit (base) | Dumonti/Falcao (+costo)
- **Pantaloneta:** estándar | lycra | impermeable | mariposa (baloncesto) | bolsillos

## Uso de `buscar_producto_odoo` (staff)

Pasa todo lo que sepas; no hace falta nombre exacto Odoo:

- `product_text` — frase de la operaria o cliente
- `quantity` — unidades
- `sport` — futbol | baloncesto | voleibol | atletismo (opcional si está en el texto)
- `garment_type` — uniforme_completo | camiseta_sola | pantaloneta | medias | arquero
- `collar`, `sleeves`, `material` — si los mencionan
- `photo_description` o `visual_hints` — tras `ask_about_file`: "cuello polo", "manga larga", etc.

La tool devuelve:

- `interpretation_es` — qué entendió
- `match_name` / `odoo_template_id` — propuesta
- `match_confidence` — high | medium | low
- `clarifying_question` — si debe preguntar a la operaria
- `alternatives` — otras opciones cercanas

**Si confidence no es high:** presenta la propuesta y alternativas a la operaria; confirma antes de `complete_task`.

## Mínimo comercial

6 unidades del mismo producto/diseño (cualquier artículo del catálogo).

## Catálogo completo Odoo

Ver `kapso/catalog/life_catalog_semantic_v1.json` y `kapso/catalog_for_agent.md` para listado con precios.
