# Catálogo y precios Life Deportes (cliente)

**Marco de verdad (orden):**

1. Tool `buscar_producto_odoo` en vivo (`price_source: odoo_live`) — **gana siempre**.
2. Tienda pública https://lifedeportes.odoo.com/shop — productos publicados con foto/ficha.
3. Esta KB — referencia rápida; si difiere de 1 o 2, gana la tool/tienda.

**Somos fabricantes:** los precios de catálogo/tool ya son **mínimos**. No hay descuento por cantidad (11, 20, etc.).

**Camiseta** (sin “uniforme”) → camiseta sola dry-fit (62), no uniforme completo. Lenguaje cliente → KB `life_lenguaje_cliente_productos`.

---

## Alias crítico: rompevientos

| Cliente dice | Producto Odoo | Id | Precio tienda | Ficha |
|--------------|---------------|-----|---------------|--------|
| rompeviento(s), chaqueta rompevientos, impermeable, chompa lluvia | **Chaqueta Rompevientos** | **68** | **$60.000** | `/shop/chaqueta-rompevientos-68` |
| chaqueta Lotto / algodón Lotto | Chaqueta Lotto | 1800 | $60.000 | `/shop/chaqueta-lotto-1800` |
| sudadera / Orión / chaqueta y pantalón | Sudadera Orión (conjunto) | 66 | $100.000 | `/shop/sudadera-chaqueta-y-pantalon-orion-66` |

**No confundir** rompevientos (68) con Chaqueta Lotto (1800) ni con Sudadera Orión (66).  
Forro en rompevientos (PRESEAS papás): +$5.000 → ~$65.000 (atributo; confirmar con tool).

---

## Cómo consulta el agente (`buscar_producto_odoo`)

1. Traduce el lenguaje del cliente (esta KB + `life_lenguaje_cliente_productos`).
2. Llama la tool con `product_text` + variantes si las hay (`collar`, `sleeves`, `material`, `sport`, `garment_type`).
3. Si pide fotos/catálogo: `include_shop_media: true` → usa `vars.shop.page_url` / `image_url` (KB `life_tienda_fotos`).
4. Match: motor semántico en la function (aliases: *rompevientos* → chaqueta 68; *peto* → peto; *camiseta* sin uniforme → 62).
5. **Nunca inventes** precio ni URL: solo tool o ficha publicada.

---

## Telas y calidades (solo si preguntan — sin upsell)

**Dry-fit = ~98 % de los pedidos.** Es la tela por defecto. **Prohibido** que el agente proponga Dumonti o Hidrotec “por si acaso”, compare calidades sin que lo pidan, o haga upsell de tela. El upgrade **solo** si el cliente lo pide.

Cuando pregunten *qué tela* / *material* / *calidad*: habla primero de **dry-fit**. Dumonti solo si piden algo mejor. Hidrotec aún más raro: solo si piden aún más premium que Dumonti. **No promociones Hidrotec ni Dumonti.**

| Tela | Cómo es | Cuándo hablar de ella |
|------|---------|------------------------|
| **Dry-fit** (estándar, ~98 %) | Tela **plana** (parecida a la 8000) con tratamiento **secado rápido**. | Default. Si preguntan por tela → explica dry-fit. Asumir dry-fit si no especifican. |
| **Dumonti** (si dicen Falcao: “ahora manejamos Dumonti”) | Textura en **rombo o pequeños cuadros**; muy **fresca**, **liviana** y con **excelente caída**. | **Solo** si el cliente pide mejor calidad / Dumonti / Falcao / “las dos telas”. Sobreprecio vs dry-fit (uniforme ≈ +$15k; confirmar tool). |
| **Hidrotec** (Lafayette) | Construcción tipo **malla**; ideal clima cálido. La más **premium**. | **Muy raro.** Solo si pide algo **mejor que Dumonti**, Lafayette o nombra Hidrotec. **Mayor sobreprecio.** Nunca de oficio. |

**Respuestas guía (cortas):**
- *¿Qué tela usan / qué material?* → “Trabajamos dry-fit: tela plana, parecida a la 8000, con secado rápido; es la que usamos en casi todos los pedidos.” (No listes Dumonti/Hidrotec a menos que pregunten por más opciones.)
- *¿Hay algo mejor / Dumonti?* → Entonces sí: textura rombo/cuadros, fresca y liviana (+sobreprecio).
- *¿Aún más premium / Hidrotec?* → Lafayette tipo malla, clima cálido, mayor sobreprecio. Cotizar con tool.

Precio exacto → `buscar_producto_odoo` (no inventes el sobreprecio de Hidrotec).

---

## Lenguaje cliente → sobrecostos (mín. 6 u.)

- dry fit → tela base · falcao/dumonti → Dumonti · hidrotec → solo bajo demanda (no promocionar)  
- manga corta / “normal” → corta · manga larga → +$3.000 · sisa/siza → sin manga · china ≠ corta · ranglan → ránglan  
- cuello V/redondo → base · sport/personalizado → +$3.000 · polo → producto polo / presentación  
- pantaloneta licra → +$5.000 (voley/atletismo) · impermeable → +$8.000 (fútbol/micro) · bolsillos → +$5.000  
- medias semi → incluidas en uniforme fútbol base · medias pro → +$7.000  
- uniforme completo → camiseta + pantaloneta + medias (según producto)

---

## Catálogo publicado (tienda prod, 2026-07-19)

Fuente: scrape de https://lifedeportes.odoo.com/shop (20 fichas). Precios “desde”.

### Camisetas

| Id | Producto | Precio | Ficha |
|----|----------|--------|--------|
| 62 | Camiseta deportiva dry-fit | $30.000 | `/shop/camiseta-deportiva-dry-fit-62` |
| 61 | Camiseta tipo Polo | $35.000 | `/shop/camiseta-tipo-polo-61` |
| 685 | Camiseta Deportiva Dumonti | $35.000 | `/shop/camiseta-deportiva-dumonti-685` |

Sobrecostos camiseta sola (dry-fit 62): manga larga +$3k · cuello sport +$3k · bordado +$7k.

### Uniformes completos

| Id | Producto | Precio | Ficha |
|----|----------|--------|--------|
| 115 | Uniforme de Fútbol | $50.000 | `/shop/uniforme-de-futbol-115` |
| 23 | Uniforme de Baloncesto | $50.000 | `/shop/uniforme-de-baloncesto-23` |
| 31 | Uniforme de Voleibol | $50.000 | `/shop/uniforme-de-voleibol-31` |
| 35 | Uniforme de Atletismo | $50.000 | `/shop/uniforme-de-atletismo-35` |
| 1819 | Uniformes con bordado | $57.000 | `/shop/uniformes-con-bordado-1819` |
| 8 | Uniforme de Presentación (Fútbol polo) | **$75.000** | `/shop/uniforme-de-presentacion-futbol-polo-8` |
| 1813 | Uniformes camiseta doble faz y pantaloneta | $85.000 | `/shop/uniformes-camiseta-doble-faz-y-pantaloneta-1813` |

Uniforme fútbol 115 (base): medias semi incluidas. Extras: manga larga +$3k · cuello sport +$3k · pantaloneta impermeable +$8k · bolsillos +$5k · Dumonti +$15k · medias pro +$7k.  
Dumonti como template aparte (1818) puede no estar publicado — cotizar con tool.

### Chaquetas / buzos / sudaderas

| Id | Producto | Precio | Ficha |
|----|----------|--------|--------|
| **68** | **Chaqueta Rompevientos** (= “rompevientos”) | **$60.000** | `/shop/chaqueta-rompevientos-68` |
| 1800 | Chaqueta Lotto | $60.000 | `/shop/chaqueta-lotto-1800` |
| 1795 | Busos con capota | $65.000 | `/shop/busos-con-capota-1795` |
| 66 | Sudadera Chaqueta y Pantalón Orión | $100.000 | `/shop/sudadera-chaqueta-y-pantalon-orion-66` |
| 1811 | Sudaderas algodón lycrado con bordados | $120.000 | `/shop/sudaderas-en-algodon-lycrado-con-bordados-1811` |

### Petos / arquero / accesorios

| Id | Producto | Precio | Ficha |
|----|----------|--------|--------|
| 69 | Peto sublimado Life | $28.000 | `/shop/peto-sublimado-life-69` |
| 178 | Conjunto de arquero | $70.000 | `/shop/conjunto-de-arquero-178` |
| 1804 | Gorras con un bordado | $15.000 | `/shop/gorras-con-un-bordado-1804` |
| 70 | Tulas | $18.000 | `/shop/tulas-70` |
| 194 | Bandera | $60.000 | `/shop/bandera-194` |

Petos en malla (~$25.000) / pantalonetas o medias sueltas / camiseta lluvia: pueden existir en Odoo **sin** ficha publicada — **solo cotizar vía tool**; no inventar link de tienda.

---

## Extras Odoo frecuentes (confirmar con tool)

Bordado adicional +$7k · 2XL +$5k · 3XL +$10k · diseño especial &lt;6 u. +$35k · cremallera por lado +$5k · rompevientos con forro +$5k.

Arquero por piezas (si tool las trae): buzo ~$31k · pantalón ~$45k · conjunto publicado 178 = $70k.

---

## Respuestas comerciales frecuentes

- **Descuento / cantidad:** “Somos fabricantes: el precio ya es el mínimo de catálogo; no manejamos descuento adicional por cantidad.” Responder ya (política clara); no posponer.
- **Logos:** restricción solo a marcas de **ropa deportiva** (Nike, Adidas, Puma, Saeta, FSS…). Sí se pueden logos de empresa del cliente, escudos de país, gallo de Francia, estrellas de equipo, etc. Ver `life_reglas_comerciales`.
- **¿Rompevientos?** “Sí: es nuestra **chaqueta rompevientos** (~$60.000), personalizada, desde 6 unidades.” Tool + ficha 68. **No** digas Lotto salvo que pidan Lotto.
- **¿Petos?** “Sí: peto sublimado (~$28.000), desde 6.” Tool + ficha 69.
- **Qué incluye el uniforme (campo):** camiseta + **pantaloneta** (+ medias en fútbol). Di pantaloneta, no *pantalón*.
- **Dirección / pago / envíos / catálogo / deporte fuera:** frases fijas en `life_reglas_comerciales` (índice FAQ). Responder ya.
- Referencias visuales: tool + `include_shop_media` / tienda general.
- Arquero: mismo diseño, color distinto, manga larga.
- Logos: PDF o imagen clara por el chat.
