# Business Indexer v1 — Life Deportes

Documento interno: dimensiones comerciales → productos Odoo. El agente usa la sección **Lenguaje cliente**; el caché y `build_quote_payload` usan **Mapeo interno**.

Versión: trial v1 | Actualizar con `export_sellable_catalog.py` + revisión manual.

---

## Lenguaje cliente (inyectar en prompt del agente)

### Venta gradual (Life Deportes)

- **Norma:** saludos e ir lento — sin precios ni upsells al inicio.
- **Salvaguarda:** si pide precio **y** da producto **y** cantidad en el mismo mensaje → cotizar unitario + total de inmediato (aunque sea el primer turno).
- **Segunda respuesta (flujo lento):** ¿Ya tiene el diseño? + ¿Cuantos uniformes necesita?
- **Sin salvaguarda:** pide precio sin cantidad → no cotizar; pedir cantidad.
- **Cotizacion exacta:** cuando producto + cantidad + variante base esten claros.
- **Upsells:** de a uno (Dumonti, medias pro, camiseta extra…) despues de la base.
- **Entrega (informar):** 15 dias habiles desde aprobacion del diseño por arte; pedidos muy grandes pueden tomar mas. Nunca preguntar fecha de entrega al cliente.

### Palabras prohibidas al cliente

variante, variable, material (como jerga), schema, payload, Odoo, match, intent, handoff, dry_fit, falcao (como código), SKU, template.

### Cómo explicar opciones

| Interno | Decir al cliente |
|---|---|
| dry fit | tela dry fit (la estándar) |
| falcao / dumonti | tela Dumonti — si dicen Falcao: "ahora la manejamos como Dumonti, tela más resistente" |
| hidrotec | tela Hidrotec (opción premium) |
| lluvia | tela para lluvia |
| manga corta / larga | manga corta / manga larga |
| polo sin/con botones | cuello tipo polo sin botones / con botones |
| cuello V / redondo | cuello en V o redondo |
| pantaloneta lycra / impermeable / mariposa | short en lycra, short impermeable, short tipo mariposa |
| medias semi | medias semiprofesionales (incluidas en uniforme base) |
| medias pro | medias profesionales (+ diferencial por uniforme) |
| uniforme completo | camiseta + pantaloneta + medias |

**Pendiente confirmar:** corte de manga raglan vs normal (dimensión comercial; precios Odoo TBD).

---

### Familias de producto

| Familia | Qué es | Desde (COP) | Notas |
|---|---|---|---|
| Uniforme completo | Camiseta + pantaloneta + medias semi | $50.000 | **Pedido base mínimo: 6 unidades** |
| Camiseta sola | Solo parte de arriba | $30.000 | **Pedido base mínimo: 6 unidades del mismo producto/diseño** |
| Pantaloneta sola | Short deportivo | $25.000 | Solo como extra en pedido con 6+ uniformes |
| Medias | Par | Semi $7.500 / Pro $10.000 | Solo como extra en pedido con 6+ uniformes |

---

### Qué puede cambiar — Camiseta

| Opción | Alternativas | Impacto (camiseta sola) |
|---|---|---|
| Manga | Corta (estándar) / Larga | $30.000 → $33.000 (+$3.000) |
| Cuello | V o redondo / Polo sin botones / Polo con botones | $30.000 → $33.000 → $35.000 |
| Corte manga | Normal / Raglan | Pendiente precios |
| Tela | Dry fit / Dumonti / Hidrotec / Lluvia | Dry fit base; Dumonti ~$35.000; Hidrotec $45.000 |

**Frase Paola (camiseta ambigua — etapa 2, sin volcar precios):**
> Sumerce, la camiseta sola no la manejamos aparte; el pedido base es minimo 6 uniformes completos. Si necesita camisetas de repuesto, se pueden agregar encima del pedido. ¿Para que deporte es y cuantos uniformes completos necesita?

**Frase Paola (camiseta ambigua — etapa 3+, ya con pedido base):**
> Listo. La camiseta extra en dry fit queda en $30.000. ¿La prefiere manga corta o larga, y cuello en V o tipo polo?

---

### Qué puede cambiar — Uniforme completo

| Opción | Alternativas | Impacto (uniforme) |
|---|---|---|
| Manga | Corta / Larga | $50.000 → $53.000 (+$3.000) |
| Cuello | Deportivo (V) / Polo sin botones / Polo con botones | $50.000 → $53.000 → $55.000 |
| Tela camiseta | Dry fit / Dumonti / Lluvia / Hidrotec | Dry fit $50.000 → Dumonti manga corta $60.000 (+$10.000) |
| Pantaloneta | Estándar / Bolsillos / Lycra / Impermeable / Mariposa | Desde $50.000 hasta $65.000 según combo |
| Medias | Semi (incluidas) / Profesionales | Pro +$2.500/uniforme |

**Frase Paola (uniforme fútbol — etapa 1, presentacion Life Deportes):**
> Hola, mucho gusto! Soy Life Deportes 😊 Yo le ayudo con su pedido. Fabricamos uniformes 100% personalizados en sublimacion digital. El minimo es 6 uniformes completos (camiseta, pantaloneta y medias).

**Frase Paola (uniforme fútbol — etapa 2, diseno + cantidad):**
> ¿Ya tiene el diseño del uniforme o alguna referencia que le guste? ¿Cuántos uniformes necesita?

**Frase Paola (uniforme fútbol — etapa 3, listo para cotizar):**
> El uniforme de futbol completo en dry fit queda en $50.000 por uniforme. Con [cantidad] serian $[total]. ¿Le confirmo asi o prefiere ver otra tela?

**Frase Paola (upsell Dumonti — etapa 4, solo si ya cotizo base):**
> Si le interesa una tela mas resistente, tenemos Dumonti — la que muchos conocian como Falcao — en $60.000 por uniforme. ¿Le gustaria cotizarlo asi?

---

### Productos cercanos (upsell)

| Cliente dice | Ofrecer también |
|---|---|
| Camiseta / solo la camiseta | **No vender sola.** Redirigir a uniforme completo (mín. 6) y ofrecer camiseta extra encima |
| Solo bandera / medias / pantaloneta | **No vender sola.** Redirigir a uniforme completo (mín. 6) y ofrecer el extra encima |
| Polo / cuello polo | Camiseta polo $33k–$35k **y** uniforme con polo $53k–$55k |
| Uniforme | Dumonti, medias pro, manga larga |
| Falcao | Dumonti con explicación; nunca decir "variante falcao" |
| Baloncesto | Camiseta básica cuello V $30.000; polo o Dumonti si quiere más presencia |
| Arquero | Manga larga, colores distintos; buzo $31.000, conjunto $70.000 |

---

### Extras frecuentes

| Extra | Precio | Cuándo |
|---|---|---|
| Bordado adicional | +$7.000 | Logo bordado extra |
| Talla 2XL+ | +$5.000 | Tallas grandes |
| Talla 3XL+ | +$10.000 | Tallas grandes |
| Diseño personalizado | Incluido (mín. 6 uniformes) | Logos, nombres, números |

---

## Mapeo interno (backend — no decir al cliente)

| Dimensión | Campo caché | Valores |
|---|---|---|
| prenda_tipo | category | camiseta, uniforme, pantaloneta, medias, otros |
| manga | variant | manga_corta, manga_larga, base |
| cuello | variant + name | v_redondo, polo_sin_botones, polo_con_botones, polo |
| corte_manga | pendiente | normal, raglan |
| tela | material | dry_fit, dumonti, falcao, hidrotec, lluvia |
| pantaloneta_tipo | variant | base, lycra, impermeable, mariposa, bolsillos, dry_fit |
| medias_tipo | add-on | semi, pro |

**Pendiente v2:** corte_manga, diferencial medias pro comercial vs Odoo.
