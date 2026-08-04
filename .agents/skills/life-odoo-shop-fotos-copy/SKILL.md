---
name: life-odoo-shop-fotos-copy
description: >-
  Crear fotos de variantes y organizar copies de la tienda Odoo Life Deportes
  (description_ecommerce + website_description). Usar al publicar productos,
  corregir imágenes por variante, o auditar la shop en producción.
---

# Tienda Odoo Life — Fotos y Copy

## Cuándo usar

- Publicar o corregir productos en `https://lifedeportes.odoo.com` / tienda web.
- La imagen de variante no coincide con los atributos seleccionados (cuello, manga, pantalón).
- Duplicación de texto en la ficha del producto.
- Reordenar destacados de la tienda por ventas.

## Instancia y scripts

| Recurso | Ubicación |
|---------|-----------|
| Credenciales prod | `lifedeportes/.env` → `ODOO_LIFEDEPORTES_PROD_*` |
| Sync copy / SEO tienda | `lifedeportes/scripts/sync_product_shop_copy.py` |
| SEO tienda + landing + quitar galería | `lifedeportes/scripts/configure_odoo_shop_seo.py` |
| Fix imágenes + orden ventas | `lifedeportes/scripts/fix_shop_product_images.py` |
| Variantes camiseta 62/685 | `lifedeportes/scripts/upload_camiseta_variant_images.py` |
| Assets locales | `lifedeportes/assets/product_photos/` y workspace `assets/` |
| Galería trabajos reales (Odoo) | [lifedeportes.odoo.com/gallery](https://lifedeportes.odoo.com/gallery) — fotos Facebook en `assets/gallery_social/` |
| Galería SEO marketing | [lifedeportes.com/galeria.html](https://lifedeportes.com/galeria.html) — webps; **no** reemplaza la galería Odoo |

**MCP `odoo` apunta a test.** Para producción usar scripts con RPC y `.env`.

## Patrón de copy (evitar duplicación)

| Campo Odoo | Contenido | Dónde se ve |
|------------|-----------|-------------|
| `description_sale` | **1 línea corta** para presupuesto/cotización y listado tienda | Cotizaciones, SO, catálogo |
| `description_ecommerce` | **1 o 2 párrafos cortos** (2 si hay info suficiente) | Ficha del producto en la tienda |
| `website_description` | **Vacío** en la mayoría; **bloque ampliado** (galería + secciones) solo en top 5 y uniformes deporte | Debajo de variantes en ficha |

**Nunca** duplicar el párrafo de `description_ecommerce` en `website_description`.

```bash
cd lifedeportes && source .env
.venv/bin/python scripts/sync_product_shop_copy.py --apply
.venv/bin/python scripts/sync_product_website_footer.py --apply   # sección ampliada abajo
```

## Terminología Life (variantes)

### Cuellos (catálogo de mercado)

| Término | Qué es en el mercado | Cómo se ve en foto |
|---------|----------------------|--------------------|
| **Cuello redondo** | Crew neck / cuello O | Rib circular cerrado, un color |
| **Cuello en V (sencillo)** | V-neck estándar | V plano de **un solo color**, sin solapa ni botones |
| **Cuello sport** | Polo / Johnny collar **sin botones** (open collar) | Solapa tipo polo que se abre en V, **sin botonadura ni placket con botones**. Parecido al polo pero sin botones. **No** confundir con producto **61** (camiseta polo completa) |
| **Cuello personalizado** | Cualquier cuello a medida fuera de redondo / V sencillo / sport | Ej.: V **bicolor** (escocés izq/der), paneles, inserts, formas especiales sublimadas |

**PTAV Odoo** en dry-fit (62), Dumonti (685) y fútbol (115): un solo valor **«Cuello Personalizado o Sport»** (+extra).

**Fotos (importante):** no crear `product.image` extra por cada variante — Odoo las acumula en la galería y se duplican. Para ese PTAV usar **una sola** `image_variant_1920` = **cuello sport** (solapa tipo polo sin botones). El look personalizado (V bicolor) queda documentado en assets locales por si más adelante se separa el atributo en Odoo.

| Término cliente | Significado visual |
|-----------------|-------------------|
| **Manga sisa** | Tank sin mangas (baloncesto, voley, atletismo) |
| **Manga china** | Cap sleeve femenino; ≠ manga corta fútbol |
| **Manga corta** | Manga corta estilo fútbol |
| **Licra** | Shorts/spandex ajustado (voley/atletismo) |
| **Pantaloneta** | Short holgado deportivo |
| **Tela Lotto** | Nombre interno del proveedor para **algodón sublimable** (mate/opaco). **No** es la marca Lotto ni lleva su logo |

## Crear fotos de producto

### Estilo

- Fondo gris claro de estudio, vista frontal o flat lay.
- Diseño geométrico / motivos sublimables (navy, cian, rojo, blanco, etc.) + logo **LIFE** (nunca NY ni marcas ajenas).
- La foto debe reflejar **exactamente** la variante: cuello, manga, pantalón, forro, botones.
- **Tela Lotto (algodón sublimable):** mockup con textura de algodón/franela mate, colores ligeramente opacos; no usar acabado brillante de poliéster dry-fit.
- **Prohibido logo Lotto:** "Lotto" es solo el nombre de la tela ante proveedores. En fotos y mockups usar **únicamente logo LIFE**; nunca el isotipo/wordmark de la marca Lotto ni otras marcas deportivas ajenas.
- **Logo LIFE:** wordmark y/o monograma L sólida en círculo. **Prohibido** isotipo de tres barras en montaña (parecido Adidas). Sin logos de Nike/Puma/UA u otras marcas.
- **Medias planas:** si el kit lleva medias, deben ser **un solo color sólido** (cuerpo, puntera, talón y puño). Sin rayas, bandas de contraste ni patrones en la media. Estándar wiki: `wiki/concepts/life-tienda-fotos-producto.md`.

### Nomenclatura de archivos

```
futbol-kit-{v-simple|escoces|redondo}-115.png          # manga corta, kit completo
futbol-kit-larga-{v|escoces|redondo}-115.png           # manga larga × cuello
polo-61_{con|sin}_{corta|larga}.png                 # tela no afecta la foto
baloncesto-sisa-{v|redondo}-23.png
voley-redondo-licra-31.png
camiseta-{62|685}_{manga}_{cuello}_normal.png          # solo *_normal (ver bordado abajo)
chaqueta-lotto-{sin-forro|con-forro}-1800.png
buso-capota-lotto-1795.png
tulas-70.png
camiseta-lluvia-1797.png
uniforme-doble-faz-{corta|larga}-1813.png
```

### Atributos que NO requieren foto nueva

Estos atributos **no cambian** la prenda visible en el mockup de catálogo. Reutilizar la misma imagen:

| Atributo | Regla |
|----------|--------|
| **Bordado** (Normal / Con bordado) | Misma foto `*_normal.png` |
| **Tela** (Dry-fit / Dumonti) | Misma foto; no generar variantes por tela |

- No crear `*_bordado.png` ni duplicar por Dumonti vs Dry-fit.
- `upload_camiseta_variant_images.py` siempre resuelve a `{manga}_{cuello}_normal.png`.
- Polo (61): solo **4 fotos** (botones × manga); tela compartida.
- Fútbol (115), voleibol (31), bordado (1819): el mapeo ignora Tela.

### Generación

1. Generar o fotografiar mockup por **combinación visible en tienda** (no por talla ni género).
2. Guardar en `assets/product_photos/` (repo) y workspace `assets/`.
3. Comprimir antes de subir: `sips -s format jpeg -Z 1200 imagen.png --out imagen.jpg` (evita `BrokenPipe` en RPC).

### Prioridad de mapeo variante → imagen

**Voleibol (31)** — el cuello gana sobre el pantalón:

1. China → 2. Siza → 3. Escocés/Sport → 4. **Redondo** (+ licra o pantaloneta) → 5. Licra (solo V) → 6. Default V corta

**Fútbol (115)** — kit completo (camiseta + pantaloneta + medias); manga larga **× cuello**:

1. Si manga **Larga**: `larga-v` / `larga-escoces` / `larga-redondo`
2. Si manga corta: escocés → redondo → V sencillo

**Baloncesto (23)**: siempre manga **sisa**; diferenciar solo cuello V vs redondo.

**Polo (61)**: 4 combos (botones × manga); tela no duplica fotos.

**Rompevientos (68)**: capota + tela repelente; variantes sin/con forro.

## Subir imágenes a Odoo

```bash
cd lifedeportes && source .env
.venv/bin/python scripts/fix_shop_product_images.py          # dry-run
.venv/bin/python scripts/fix_shop_product_images.py --apply  # templates + variantes + orden
.venv/bin/python scripts/upload_camiseta_variant_images.py --apply
```

- `image_1920` en `product.template` = portada del producto.
- `image_variant_1920` en `product.product` = foto al elegir variante.

## Intercambios frecuentes

| Error | Corrección |
|-------|------------|
| Presentación (8) muestra buzo Orión | Portada = polo + bermuda; Orión (66) = tracksuit chaqueta+pantalón |
| Rompevientos sin capota | Usar asset con **capota**; no confundir con sudadera Orión |
| Gorra bordado NY | Bordado **LIFE** únicamente |
| Logo Lotto en mockups | Solo nombre de tela; **nunca** logo de la marca Lotto |

## Destacados / orden en tienda

Campo `website_sequence`: **menor número = más arriba** en el catálogo.

Ordenar por ventas históricas (`sale.report` agrupado por `product_tmpl_id`):

```bash
.venv/bin/python scripts/fix_shop_product_images.py --sequence-only --apply
```

Secuencia actual (mayor → menor ventas): 115, 62, 23, 61, 31, 685, 66, 68, 8, 69, 67, 35, 194, 178, 1804, 1811, 1819.

## Referencias visuales

- Galería por deporte (**trabajos reales**): Odoo [https://lifedeportes.odoo.com/gallery](https://lifedeportes.odoo.com/gallery) desde Facebook → `assets/gallery_social/` + `team_curation.json` (**máx. 2 fotos por equipo**) + `update_odoo_gallery_from_social.py --from-assets`. **No** pushear `gallery_page.xml` ni `--remove-gallery` (wiki `life-galeria-trabajos-reales`).
- Galería SEO estática: solo lifedeportes.com `/galeria.html` (webps). Distinta de la Odoo.
- Catálogo variantes interno: `.agents/skills/life-odoo-ingreso-pedidos/catalogo.md`
- Overrides de foto portada: `lifedeportes/scripts/match_product_photos.py` → `PRODUCT_PHOTO_OVERRIDES`

## Checklist auditoría tienda

1. [ ] `description_sale` + `description_ecommerce` vía `sync_product_shop_copy.py`; footer vía `sync_product_website_footer.py` si aplica.
2. [ ] Portada del template correcta (no mezclar productos).
3. [ ] Cada variante visible cambia la imagen al seleccionar atributos.
4. [ ] Cuello V sencillo ≠ cuello sport (solapa sin botones) ≠ cuello personalizado (bicolor/custom).
5. [ ] En 62/115 con «Personalizado o Sport»: una sola foto de variante = cuello sport (polo sin botones). No duplicar `product.image`.
5. [ ] Baloncesto = manga sisa en foto y copy.
6. [ ] Rompevientos = capota + repelente al agua.
7. [ ] `website_sequence` refleja ventas si el cliente pide destacados por volumen.
8. [ ] Bordado y tela no duplican fotos (camisetas, polo, fútbol, voleibol).
