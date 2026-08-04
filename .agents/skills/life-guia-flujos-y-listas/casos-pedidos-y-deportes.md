# Reglas de Productos, Deportes y Casos de Pedidos (Life Deportes)

Este manual define la matriz de decisión para interpretar correctamente las solicitudes de los clientes y seleccionar los productos y variantes exactos en **Odoo ERP**.

---

## 1. Mapeo de Lenguaje Cliente → Plantilla Odoo (`product.template`)

Cuando el cliente o la operaria nombran una prenda, aplica esta tabla de equivalencias canónicas:

| Expresión del Cliente | Concepto Canónico | Plantilla Odoo Ref. |
|-----------------------|-------------------|---------------------|
| **camiseta**, **camisa**, **camisetas** | Camiseta sola (Dry-fit) | **62** |
| **camiseta de fútbol** | Camiseta sola (Dry-fit) | **62** |
| **cuello polo** (camiseta) | Camiseta polo sin botones | **61** |
| **uniforme**, **kit**, **uniformes** | Uniforme completo según deporte | **115** (Fútbol), **23** (Baloncesto), **31** (Voleibol), **35** (Atletismo) |
| **uniforme polo** | Uniforme completo con cuello polo | **947** |
| **arquero**, **portero** | Conjunto de arquero | **178** |
| **buzo**, **hoodie**, **sudadera** | Sudaderas algodón / lycrado | **1811** |
| **microfútbol** | Uniforme de fútbol | **115** (o **1815** si es impermeable) |

> ⚠️ **REGLA IMPORTANTE DE INTERPRETACIÓN**:
> Si el cliente dice *"necesito 10 camisetas para mi equipo"*, se interpreta como **Camiseta Sola (62)**. **NO PREGUNTAR** *"¿te refieres a camisetas o uniformes?"*. Solo se aclara si el cliente no especificó la prenda o si hay contradicción directa en los adjuntos.

---

## 2. Matriz de Variantes y Restricciones por Deporte

Cada deporte tiene combinaciones de corte, cuello, manga y tela permitidas en Odoo:

### A. Fútbol (`product.template` 115)
- **Cortes/Mangas**: Manga corta, Manga larga.
- **Cuellos**: Cuello V, Cuello Redondo.
- **Tela**: Dry-fit.
- **REGLA DURA**: En la plantilla de fútbol (115) **NO EXISTE la variante Licra / Lycra**. Si piden licra, debe ofrecerse Voleibol (31).

### B. Voleibol (`product.template` 31)
- **Cortes/Mangas**: Manga corta (variante Corta ID 12202).
- **Tela**: Licra / Lycra.
- **REGLA DURA**: En la plantilla de Voleibol (31) **NO EXISTE la variante Manga Larga en Odoo**. Si el cliente insiste en manga larga para voleibol, se debe anotar como una excepción en la nota (`sale.order.note`) con recargo de $3.000 COP, pero no se debe forzar una variante inexistente.

### C. Baloncesto (`product.template` 23)
- **Cortes/Mangas**: Manga Sisa (sin mangas).
- **Cuellos**: V o Redondo.

### D. Arquero / Portero (`product.template` 178)
- Incluye acolchado/protecciones. Se cotiza como línea aparte del resto de los jugadores.

---

## 3. Casos Especiales de Pedidos Comprados

### Caso 1: Pedido Combinado (Jugadores + Arqueros)
- **Ejemplo**: 18 uniformes de campo + 2 uniformes de arquero.
- **Estructura en Odoo**:
  1. `sale.order.line`: Servicio Diseño ID 504 × 1 × $0.
  2. `sale.order.line`: Uniforme de Fútbol (115) variante seleccionada × 18 × $list_price.
  3. `sale.order.line`: Conjunto Arquero (178) × 2 × $list_price.

### Caso 2: Pedido con Combinación de Mangas (Corta + Larga)
- **Ejemplo**: 12 camisetas manga corta + 4 camisetas manga larga.
- **Estructura en Odoo**:
  - Si la manga cambia la variante (`product.product`), se crean **dos líneas de producto** distintas en el mismo presupuesto (una para la variante manga corta y otra para la variante manga larga).
  - En la nota HTML (`sale.order.note`), el resumen agrupará claramente las cantidades por tipo de manga.

### Caso 3: Arqueros con Colores Invertidos (Mismo Producto)
- Si el arquero usa la **misma tela y molde** que los jugadores pero solo cambian los colores del diseño, **NO** se requiere una línea de producto "arquero" en Odoo. Se incluye dentro del total de uniformes de campo y se coloca una anotación en la nota HTML: *"1 Uniforme Arquero (colores invertidos, sin cargo adicional)"*.

---

## 4. Regla de Mínimo Comercial y Precios

- **Mínimo Comercial**: Todas las cotizaciones requieren al menos **6 unidades** del mismo producto/diseño. Si la cantidad es menor a 6, se debe consultar con la operaria.
- **Precios**: Se toma por defecto el `list_price` retornado por Odoo para la variante `product.product`. Si el cliente o la operaria acordaron un precio especial en el chat, se respeta ese precio unitario en la línea del presupuesto.
