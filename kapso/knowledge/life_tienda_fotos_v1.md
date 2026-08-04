# Tienda Odoo — fotos y enlaces para el agente vendedor

Guía cuando el cliente pide **fotos**, **referencias**, **catálogo** o **link de tienda**.

## Tienda oficial

- **Catálogo:** https://lifedeportes.odoo.com/shop
- Solo `is_published = true` tiene ficha/foto pública.
- Diseños 100 % personalizados pueden no estar publicados → di que la referencia exacta se arma en cotización; comparte el home de tienda.

### Pedido de “catálogo” (respuesta fija)

Si el cliente pide catálogo / ver productos / link tienda (sin nombrar un producto concreto):

> Puede ver el catálogo en https://lifedeportes.odoo.com/shop

Mismo dominio: **lifedeportes.odoo.com**. No digas que no hay catálogo ni inventes PDF. Luego `enter_waiting`.

### Alias rompevientos

**Rompevientos = Chaqueta Rompevientos (68)** → `/shop/chaqueta-rompevientos-68` (~$60.000).  
No es Chaqueta Lotto (1800) ni Sudadera Orión (66).

## Tool: `buscar_producto_odoo`

1. Llama con el producto mencionado **y** `include_shop_media: true` si pide fotos/catálogo. Pasa variantes (`collar`, `sleeves`, `material`) si las dijo.
2. Lee:
   - `vars.shop.page_url` / `image_url` / `shop_home_url`
   - `vars.shop_catalog` si pidió catálogo general
   - `status`: `shop_media_ready` | `shop_catalog_suggestions` | `shop_not_published`
3. **Nunca inventes** URLs ni fotos. Solo tool.
4. **Nunca cambies** producto/precio para “conseguir” una foto publicada.
5. No mandes precio en el mensaje de fotos salvo que también lo haya pedido.

### Cómo responde WhatsApp

- Con `image_url`: `send_media` + caption corto + `page_url`.
- Sin foto publicada: explica personalizado + `shop_home_url`.
- “Catálogo” genérico: **respuesta fija** con `https://lifedeportes.odoo.com/shop` (no hace falta tool). Opcional: tool solo si pide foto de un producto ya nombrado.
- Tras foto/link → `enter_waiting`.

## Catálogo publicado (prod 2026-07-19)

| Id | Producto | Precio | Path |
|----|----------|--------|------|
| 62 | Camiseta deportiva dry-fit | $30.000 | `/shop/camiseta-deportiva-dry-fit-62` |
| 61 | Camiseta tipo Polo | $35.000 | `/shop/camiseta-tipo-polo-61` |
| 685 | Camiseta Deportiva Dumonti | $35.000 | `/shop/camiseta-deportiva-dumonti-685` |
| 115 | Uniforme de Fútbol | $50.000 | `/shop/uniforme-de-futbol-115` |
| 23 | Uniforme de Baloncesto | $50.000 | `/shop/uniforme-de-baloncesto-23` |
| 31 | Uniforme de Voleibol | $50.000 | `/shop/uniforme-de-voleibol-31` |
| 35 | Uniforme de Atletismo | $50.000 | `/shop/uniforme-de-atletismo-35` |
| 1819 | Uniformes con bordado | $57.000 | `/shop/uniformes-con-bordado-1819` |
| 8 | Uniforme de Presentación (Fútbol polo) | $75.000 | `/shop/uniforme-de-presentacion-futbol-polo-8` |
| 1813 | Uniformes doble faz + pantaloneta | $85.000 | `/shop/uniformes-camiseta-doble-faz-y-pantaloneta-1813` |
| **68** | **Chaqueta Rompevientos** | **$60.000** | `/shop/chaqueta-rompevientos-68` |
| 1800 | Chaqueta Lotto | $60.000 | `/shop/chaqueta-lotto-1800` |
| 1795 | Busos con capota | $65.000 | `/shop/busos-con-capota-1795` |
| 66 | Sudadera Orión | $100.000 | `/shop/sudadera-chaqueta-y-pantalon-orion-66` |
| 1811 | Sudaderas algodón lycrado | $120.000 | `/shop/sudaderas-en-algodon-lycrado-con-bordados-1811` |
| 69 | Peto sublimado Life | $28.000 | `/shop/peto-sublimado-life-69` |
| 178 | Conjunto de arquero | $70.000 | `/shop/conjunto-de-arquero-178` |
| 1804 | Gorras con un bordado | $15.000 | `/shop/gorras-con-un-bordado-1804` |
| 70 | Tulas | $18.000 | `/shop/tulas-70` |
| 194 | Bandera | $60.000 | `/shop/bandera-194` |

URL = `https://lifedeportes.odoo.com` + path. Preferir siempre las URLs de la tool.

**Fuera de esta tabla** (lluvia, pantalón sudadera, peto malla, etc.): no inventar ficha; cotizar solo si la tool las encuentra.
