# Catálogo Life — guía staff (match producto / variante)

Referencia para `buscar_producto_odoo`. No inventar productos ni deportes fuera de esta guía.

## Deportes que SÍ fabricamos

Fútbol, baloncesto, voleibol, atletismo.

## Deportes que NO fabricamos

Natación, ciclismo, béisbol, hockey, patinaje, motocross, porras, equitación, etc. → informar a la operaria; no buscar producto.

## Cómo habla la operaria vs producto Odoo

| Dice la operaria / cliente | Producto Odoo probable | Notas |
|---------------------------|------------------------|-------|
| camiseta / camisa / camiseta de fútbol | **Camiseta dry-fit sola** (62) | No es uniforme completo; deporte solo contexto |
| chaqueta / chaquetas papás / rompevientos / impermeable | **Chaqueta Rompevientos (68)** | **Alias:** rompevientos = este producto. PRESEAS papás: **con forro** (+$5k ≈ $65k); sin forro $60k. No confundir con Chaqueta Lotto (1800) ni Orión (66) |
| chaqueta Lotto | Chaqueta Lotto (1800) | Distinto de rompevientos |
| camisetas papás / camiseta adulto / coach / profe | **Camiseta deportiva dry-fit** (62) | Camiseta sola; coach = misma prenda, sin dorsal, texto COACH |
| uniforme de fútbol / kit futbol | Uniforme de Fútbol dry-fit | Incluye camiseta + pantaloneta + medias semi |
| camiseta normal / camiseta dry fit | Camiseta deportiva dry-fit | Manga corta, cuello V/redondo |
| camiseta polo / foto con cuello polo | Camiseta tipo Polo (61, ~$35k tienda) **o** Uniforme Presentación polo (8, ~$75k tienda) | Camiseta sola vs uniforme completo |
| uniforme baloncesto | Uniforme de baloncesto | Short tipo mariposa habitual |
| uniforme voleibol | Uniforme de voleibol | Short lycra habitual |
| uniforme atletismo | Uniforme de atletismo | Camiseta manga sisa |
| uniforme presentación | Uniforme de presentación (8) | Precio tienda ~$75.000 (confirmar tool) |
| pantaloneta lycra | Pantalonetas en lycra | Atletismo / voleibol |
| pantaloneta impermeable | Pantalonetas impermeables (1809) o Uniforme fútbol 115 con variante pant. impermeable (+$8k) | Microfútbol |
| medias semi / medias pro | Medias semi / Medias profesionales | Semi van en uniforme fútbol base |
| conjunto arquero | Conjunto de arquero (178) | Manga larga, distinto color |
| gorras, banderas, sudaderas | Ver catálogo publicados | Mínimo 6 u. también aplica |
| voley / volei (sin tilde) | Uniforme de voleibol | Mismo que voleibol |
| microfútbol, futsal, futbol sala | Uniforme fútbol 115, variante pant. impermeable | Cliente dice "uniforme" o "camiseta y pantaloneta" |
| uniforme dumonti / falcao | Uniformes Deportivo Dumonti (1818) o 115 con Tela Dumonti (+$15k) | Tela premium; 1818 puede no estar en tienda |
| camiseta de lluvia / impermeable | Camiseta deportiva lluvia (1797) si tool la trae | Puede no estar publicada en `/shop` |
| camisa (sin "uniforme") | Camiseta sola dry-fit | = camiseta |
| solo camisa / solo la camiseta | Camiseta dry-fit (sola) | Confirmación explícita |
| camiseta y pantaloneta (sin medias) | Uniforme completo base | Medias semi incluidas en precio base fútbol |
| 20 de campo y 2 arqueros | Uniforme jugador + conjunto arquero | Dos líneas / dos búsquedas tool |
| buzo, buso, hoodie, sudadera | Buso capota (1795) / Orión (66) / lycrado (1811) | Distinto al uniforme; aclarar cuál |
| peto, petos, pechera | Peto sublimado (69) | No confundir con uniforme |
| uniformes de Brasil / Holanda | Referencia diseño | No es deporte; aclarar prenda y cantidad |
| cotizar uniformes de (incompleto) | Falta deporte | Preguntar deporte antes de buscar |

Ver KB `life_lenguaje_cliente_productos` para más frases reales y matriz de ambigüedades.

## Dimensiones de variante

Ver KB **`life_variantes_odoo`** para tabla completa de ids Odoo (voleibol 31 con Corta 12200–12203, fútbol 10219/10220, etc.).

- **Tipo prenda:** uniforme completo | camiseta sola | pantaloneta | medias | arquero
- **Cuello:** V/redondo (base) | polo sin botones | polo con botones | sport (+costo)
- **Manga:** corta (base) | larga (+$3k fútbol) | sisa (atletismo / voley sin manga) | china (corte distinto a corta) | ranglan
- **Tela:** dry fit (base) | Dumonti/Falcao (+costo)
- **Pantaloneta:** estándar | lycra | impermeable | mariposa | bolsillos

## Uso de `buscar_producto_odoo` (staff)

Pasa todo lo que sepas:

- `product_text`, `quantity`, `sport`, `garment_type`, `collar`, `sleeves`, `material`
- `photo_description` o `visual_hints` tras `ask_about_file`

La tool devuelve `interpretation_es`, `match_name`, `match_confidence`, `clarifying_question`, `alternatives`.

**Si confidence no es high:** presenta propuesta y alternativas; confirma antes de `complete_task`.

## Mínimo comercial

6 unidades del mismo producto/diseño.

## Precios de referencia

Ver KB `life_catalogo_precios` para listado con precios COP.
