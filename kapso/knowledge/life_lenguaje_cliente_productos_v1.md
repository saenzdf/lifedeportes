# Cómo piden los productos los clientes (WhatsApp Life)

Guía de **interpretación** basada en conversaciones reales Kapso (jun 2026, ~100 chats, 263 mensajes con intención de producto). Usar junto con `buscar_producto_odoo` y KB de precios.

**Regla madre:** el cliente casi nunca usa nombres Odoo. Traduce primero; si hay ambigüedad, **una sola pregunta** antes de cotizar.

---

## 1. Formas de abrir la conversación (muy frecuentes)

| Lo que escribe el cliente | Interpretación | Acción |
|---------------------------|----------------|--------|
| `Hola, quiero cotizar uniformes de fútbol` | Uniforme completo fútbol (asumir dry-fit base) | Confirmar cantidad; deporte ya claro |
| `Hola, quiero cotizar uniformes de` (incompleto) | Quiere uniformes; falta deporte | Preguntar deporte y cantidad |
| `Hola, quiero cotizar uniformes` (sin deporte) | Uniforme completo; deporte pendiente | Preguntar deporte |
| `Hola, quiero cotizar uniformes de baloncesto/voleibol/voley` | Uniforme del deporte indicado | Cantidad + variante base |
| `Hola, quiero cotizar estos uniformes` + foto | Referencia visual; producto por imagen | `ask_about_file` / describir foto; no asumir deporte |
| `Buenos días` / `Buenas tardes` sin producto | Saludo; intención aún no clara | Saludo comercial + preguntar qué necesita |
| `¿Cotizan al por mayor?` + cantidad grande | Pedido mayorista del producto que mencione después | Tratar como cotización normal (mín. 6 u.) |
| `¿Tienen sede en Cali?` / logística | No es producto | KB reglas: envíos nacionales por cobrar; dirección Engativá si preguntan dónde están |
| `¿Hay descuento por 11 / 20?` | No es producto | Frase fija descuento (fabricantes); **no** tool |
| `¿Dónde están?` / dirección | No es producto | Frase fija dirección + mapa |
| `¿Cómo pago?` / transferencia | No es producto | Frase fija abono 50% |
| `Me manda el catálogo` | Tienda pública | Link `/shop` fijo |

**Patrón dominante:** ~40% de aperturas son variante de *"Hola, quiero cotizar uniformes de [deporte]"*.

---

## 2. Deporte — sinónimos y trampas

| Cliente dice | Deporte | Notas |
|--------------|---------|-------|
| fútbol, futbol, fútbol (con/sin tilde) | fútbol | Default si no dicen otro deporte en contexto de "uniformes" |
| microfútbol, microfutbol, futsal, futbol sala | fútbol | Short **impermeable** habitual; sigue siendo fútbol |
| baloncesto, basket, basketball | baloncesto | Short tipo **mariposa** habitual |
| voleibol, voley, volley | voleibol | Short **lycra** habitual; "voley" sin tilde es común |
| atletismo, pista, track | atletismo | Manga **sisa/china** habitual |
| tenis, natación, ciclismo, béisbol, hockey, patinaje, porras, equitación, motociclismo | **No fabricamos** | Respuesta fija KB reglas; **no** llamar `buscar_producto_odoo` |
| catálogo, ver catálogo, link tienda, “me manda el catálogo” | Tienda pública | Respuesta fija: https://lifedeportes.odoo.com/shop |
| `uniformes de Brasil` / `de Holanda` | Equipo/referencia estética | No es deporte; es diseño de camiseta famosa → aclarar producto y cantidad |
| `futbol femenino` / `femenino` | Mismo deporte | Puede implicar corte o manga china en algunas piezas |

Si solo dicen **"Futbol"** en un mensaje corto tras saludo → asumir están respondiendo tu pregunta de deporte, no un producto distinto.

---

## 3. Camiseta vs uniforme — regla Life

### Regla fija (no preguntar)

| Cliente dice | Interpretación | Acción |
|--------------|----------------|--------|
| **camiseta**, **camisa**, **camisetas** | Camiseta sola **dry-fit** | `garment_type: camiseta_sola` → Odoo 62 base |
| **camiseta de fútbol** / **camiseta futbol** | Camiseta sola dry-fit (deporte = fútbol) | `camiseta_sola` + `sport: futbol` → 62 |
| **uniforme**, **uniformes**, **kit**, **conjunto** | Uniforme completo | `uniforme_completo` + deporte |
| **solo camisa** / **solo la camiseta** | Refuerzo camiseta sola | Igual que camiseta |

**No preguntar** camiseta vs uniforme si dijeron explícitamente **camiseta** o **camiseta de fútbol**.

### Cuándo sí preguntar (ambigüedad real)

Solo si el mensaje sugiere equipo pero no define prenda:

- *"10 camisetas para el equipo"* sin "solo" ni "uniforme"
- *"necesito para 15 jugadores"* sin tipo de prenda
- Foto de diseño sin texto y no se ve short/pantaloneta

Pregunta única: *"¿Necesita solo la camiseta dry-fit o el uniforme completo (camiseta, pantaloneta y medias)?"*

**Copy al cliente:** di **pantaloneta**, nunca *pantalón*, al describir el uniforme de campo. El atributo Odoo “Tipo pantalón” es interno; en WhatsApp = pantaloneta.

### Señales de uniforme completo

| Señales | Ejemplo |
|---------|---------|
| Dice "uniforme", "kit" | "20 uniformes de fútbol" |
| Camisa + pantaloneta | "uniforme completo de camisa y pantalonetas" |
| Microfútbol con piezas | "10 uniformes con camiseta y pantaloneta" |

**Camisa vs camiseta:** intercambiables en Colombia. Misma regla: camiseta = sola dry-fit.

---

## 4. Cantidad — cómo la expresan

| Patrón | Ejemplo real | Interpretación |
|--------|--------------|----------------|
| Número + uniformes | "33 uniformes", "56 uniformes" | `quantity` = ese número |
| Campo + arquero | "20 de campo y 2 arqueros" | 20 uniformes jugador + 2 conjuntos arquero (cotizar por separado) |
| Colores mixtos | "5 de un color, 5 de otro, 2 arquero" | Mismo diseño base; varias líneas de cotización |
| "+ el del arquero" | "Son 17 más el del arquero" | 17 jugadores + 1 arquero |
| Docena | "la docena en dumonti" | 12 unidades |
| Una sola unidad | "para una sola unidad", "solo una camiseta" | **Bajo mínimo 6** → KB reglas, no cotizar |
| Petos / buzos aparte | "56 uniformes y 20 hoodies" | **Dos productos** → dos cotizaciones |

---

## 5. Variantes técnicas — lenguaje coloquial

### Manga

| Cliente | Traducción | Odoo voleibol (31) | Odoo fútbol (115) |
|---------|------------|--------------------|-------------------|
| manga corta, MC, manga normal | **manga corta** | **Corta** (ej. 12202 licra+V) | **Corta** |
| manga larga, ML | manga larga (+costo) | — no existe | Larga |
| manga sisa, siza | manga sisa (sin manga) | Siza | — |
| manga china | **manga china** (corte propio) | China | — |
| "2 manga china y las otras normal" | Mixto por jugador → tabla en nota, varias líneas SO | | |

**No confundir manga corta con manga china** — son cortes distintos (error frecuente en voleibol femenino).

### Cuello
| Cliente | Traducción |
|---------|------------|
| cuello normal | V o redondo (base) |
| polo, cuello polo | polo sin botones (salvo que digan botones) |
| cuello V, en V, redondo | según indicación |

### Tela / material
| Cliente | Traducción |
|---------|------------|
| dry fit, dryfit, drifit, "la dry fit" | dry fit (estándar): tela plana tipo 8000, secarápido |
| dumonti, dumonty, falcao | Dumonti (rombo/cuadros, fresca/liviana). Si dicen Falcao: "ahora manejamos Dumonti" |
| hidrotec, lafayette, "tela más premium", "mejor que dumonti" | Hidrotec — **solo** si el cliente lo pide; nunca proponer |
| "cotización con los 2 tipos de tela" | Dry fit **y** Dumonti (dos precios). No agregues Hidrotec solo |
| "qué material / qué tela trabajan" | Empezar por **dry-fit** (~98 %). Dumonti/Hidrotec solo si piden más opciones o mejor calidad |
| adidas, nike, puma, saeta, fss, logo de marca de ropa deportiva | **No** copiar. Frase fija KB reglas |
| logo empresa, escudo país, gallo francia, estrellas equipo | **Sí** se puede |

### Pantaloneta / short
| Cliente | Traducción |
|---------|------------|
| pantaloneta, short, pantalonetas | pieza inferior del uniforme de campo |
| “pantalón” (cliente hablando de uniforme fútbol/basket/vóley) | Interpretar como **pantaloneta**; al responder di pantaloneta, no pantalón largo |
| lycra, licra | short lycra (voleibol/atletismo) |
| impermeable, microfútbol | short impermeable |
| mariposa | short mariposa (baloncesto) |
| bolsillos | short con bolsillos |

### Medias
| Cliente | Traducción |
|---------|------------|
| medias semi, medias del uniforme | incluidas en uniforme fútbol base |
| medias pro, medias profesionales | upgrade (+costo por uniforme) |
| “solo medias”, “medias deportivas”, “quiero medias” | **No cotizar medias sueltas.** Redirigir a uniforme (mín. 6): semi van en el kit base; pro = upgrade. Life no vende medias como producto independiente. |

---

## 6. Arquero / portero

| Cliente dice | Producto |
|--------------|----------|
| arquero, portero, GK | conjunto de arquero (manga larga, otro color) |
| "2 arqueros" | 2 conjuntos arquero, no jugadores |
| "el arquero también" | sumar línea arquero a pedido de jugadores |
| "camisa árbitro" | **No es arquero** — puede ser producto especial o rechazo; confirmar |

Arquero casi siempre va **aparte** del uniforme de campo en cantidad y precio.

---

## 7. Otros productos (no son "uniforme de deporte")

| Cliente dice | Interpretación |
|--------------|----------------|
| rompeviento, rompevientos, chaqueta rompeviento, impermeable | **Chaqueta Rompevientos (68)** — no Lotto ni Orión; cotizar aparte del uniforme |
| chaqueta Lotto / algodón Lotto | Chaqueta Lotto (1800) — distinto de rompevientos |
| buzo, buso, sudadera, hoodie, chaqueta (genérico) | Preguntar si es rompevientos / Lotto / sudadera Orión si no queda claro |
| "Buzos solo. 6 unidades" | Solo buzos, no uniformes |
| "gramaje del hoodie" | Pregunta técnica buzo — KB precios / humano |
| peto, petos, pechera | Peto sublimado (69) ~$28k — sí fabricamos; no es uniforme |
| "¿Vende petos?" / fotos de petos | Producto peto; tool + tienda |
| gorra, bandera | extras catálogo publicados |
| uniforme de presentación, paseo | Uniforme Presentación polo (8) ~$75.000 en tienda |
| descuento, rebaja, “por 11”, “por cantidad mayor”, mayooreo | **No** descuento por volumen: fabricantes → precios mínimos. Responder ya; **no** posponer con “consultar con el equipo”. |
| adidas, nike, puma, saeta, fss / “póngame el logo de…” | Marca de ropa deportiva → **no**. Otros logos (empresa, país, etc.) → **sí**. KB reglas. |

Si mezclan en un mensaje (ej. uniformes + hoodies) → **dos cotizaciones**, no un solo precio.

---

## 8. Piden precio sin contexto

| Patrón | Ejemplo | Acción |
|--------|---------|--------|
| Precio directo | "¿Cuánto sale?", "¿Qué precio tienen?" | Dar "desde" KB + preguntar cantidad y producto |
| Precio + cantidad | "22 uniformes, ¿me regalas el precio?" | Si deporte/variante claros → Fase 3 + tool |
| Precio + foto | "La unidad de uno así, ¿qué precio?" + imagen | Describir foto primero |
| Comparar telas | "precio en dry fit y en dumonti" | Dos llamadas tool o tabla modular |
| Una unidad | "¿Pueden hacerla para una sola unidad?" | Mínimo 6 — KB reglas |

---

## 9. Referencia visual (foto, audio, diseño)

Ver KB **`life_flujo_audio_foto`** para el flujo completo audio + foto.

Resumen:
- **Audio:** leer `Transcript:` de Kapso; mismo pipeline que texto; responder siempre en **texto**.
- **Foto:** `ask_about_file` → cuello (polo vs V/redondo), manga, tipo prenda; luego `buscar_producto_odoo` con `visual_hints`.
- **Audio + foto:** transcript (cantidad/deporte) + foto (variante visual).

**Prioridad variantes (cuello / manga / tela / forro):**
1. Lo que el cliente/operaria **pide explícito** en el texto del pedido gana.
2. Si no lo especificó → completar desde la **foto** (`visual_hints` / `photo_description`).
3. Si texto y foto chocan en un atributo → texto.
4. Si chocan en tipo de prenda (camiseta vs uniforme) → preguntar.

---

## 10. Matriz rápida cliente → parámetros tool

Usar al llamar `buscar_producto_odoo`:

| Intención detectada | `sport` | `garment_type` | Pregunta si falta |
|--------------------|---------|----------------|-------------------|
| Uniforme fútbol estándar | futbol | uniforme_completo | cantidad |
| Microfútbol 10 u. camiseta+pantaloneta | futbol | uniforme_completo | medias (semi base) |
| Solo camiseta fútbol | futbol | camiseta_sola | — |
| Baloncesto uniforme | baloncesto | uniforme_completo | cantidad |
| Voleibol / voley | voleibol | uniforme_completo | cantidad |
| Atletismo | atletismo | uniforme_completo | manga sisa |
| 20 campo + 2 arquero | futbol | uniforme_completo + arquero | confirmar tela |
| Buzos / hoodies | — | sudadera_conjunto | cantidad, tela |
| Petos | — | (texto libre peto) | cantidad |
| Tenis / natación / etc. | declined | — | informar no fabricamos |

---

## 11. Errores comunes del agente (evitar)

1. **Asumir uniforme completo** cuando dijeron **"camiseta"** o **"camiseta de fútbol"** (es camiseta sola dry-fit).
2. **Preguntar camiseta vs uniforme** cuando ya dijeron camiseta explícitamente.
3. **Tratar "voley"** como deporte desconocido (es voleibol).
4. **Mezclar arquero** en el mismo precio unitario de jugadores.
5. **Cotizar tenis/natación** con producto fútbol.
6. **Un solo precio** cuando piden dry fit **y** Dumonti.
7. **Responder precio** sin cantidad cuando el mensaje es solo "¿cuánto cuesta?".

---

## Fuente y actualización

Generado desde `scratch/rule_classified.json` (historial completo por chat). Para repetir el análisis: `node scratch/analyze_kapso_product_phrases.js`.
