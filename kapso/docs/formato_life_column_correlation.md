# Correlación: Formato Pedido Life ↔ Formulario Life ↔ otros procesos

> **Estado:** contrato Excel **cerrado** (2026-07-11). Cambios solo con decisión explícita.

Ancla operativa: Excel `FORMATO PEDIDO LIFE 1.xlsx` (y copias), pestaña **`formato life`**.  
**Una sola lógica de entendimiento del Excel:** `kapso/functions/lib/parse_life_excel.js`.  
Documento Odoo: **Formulario Life** → **Pestaña Aprobación** + **Pestaña Productos del pedido**.  
Atributos de producto: unión fija de `product.attribute` (ADR 0002).

Leyenda de destino:

| Destino | Significado |
|---------|-------------|
| **Aprobación** | Columna de personalización / persona en Pestaña Aprobación |
| **Atributo** | Columna de Atributo de variante (catálogo Odoo) |
| **Comentario** | Texto libre (no inventa columna) |
| **Validación** | Se lee del Excel para cruzar con el pedido **antes de subir**; no es columna Formulario |
| **Registro** | Se conserva en `order_draft` / `row.registro` para no perder info (curso, pago…) |
| **Ignorar** | No entra al flujo |

---

## 1. Metadatos de cabecera (`formato life`, filas 1–3)

| Campo Excel | ¿Atributo Formulario? | Destino | Otros procesos |
|-------------|----------------------|---------|----------------|
| **COLOR DE MEDIA** | No (≠ Tipo de Medias) | **Aprobación → Color medias** | QC / impresión medias |
| **DISCIPLINA** | Sí si aplica | **Atributo → Deportes** + match Producto base | Match comercial; nota HTML |

**Cuello** no viene del Excel: suele salir de la **conversación** / nombre de producto del cliente → columna Cuello del Formulario; si no hay mención, vacío (no inventar).

---

## 2. Columnas de fila

| Col | Excel | Destino Formulario Life | Otros procesos |
|-----|-------|-------------------------|----------------|
| A | **No.** | **Aprobación → Numero** si existe columna NUMERO, viene vacía y No. parece dorsal | Si layout es **CANTIDAD** (sin NUMERO), No. es índice — no dorsal |
| B | **NOMBRE EN UNIFORME** | **Aprobación → Nombre en camiseta** | Impresión; nota HTML; QC |
| C | **TALLA** | **Aprobación → Talla uniforme** (persona) | Corte; QC tallas |
| D | **NUMERO** *o* **CANTIDAD** | NUMERO → **Aprobación → Numero**; CANTIDAD → no columna Formulario | CANTIDAD = unidades de la fila; ver §2.1 |
| E | **Larga/Corta** | **Atributo → Largo Manga** (normalizado; mixtas en desglose) | Match variante; `manga_parts` para qty SO |
| F | **MAS** | **Atributo → Género** = masculino (si tipado) + Detalle `genero` | Nota HTML M/F |
| G | **FEM** | **Atributo → Género** = femenino + Detalle `genero` | Nota HTML M/F |
| H | **Camiseta** | **No columna Formulario** (fase actual) | **X** = tipo fila camiseta (validación / pista) |
| I | **Uniforme** | **No columna Formulario** (fase actual) | **X** = tipo fila uniforme (validación / pista) |
| J | **ARQUERO** | **Comentario** + flag `arquero` | Impresión especial; QC; nota HTML |
| K | **COMENTARIO** | **Comentario**; si trae curso/pago → también **Registro** | Excepciones producción; abonos/colegio sin perder dato |

Texto no-X en H/I (ej. `SOLO PANTALONETA`) → **Comentario** + pista `pantaloneta`.

### 2.1 CANTIDAD por fila (estándar)

Cuando D = **CANTIDAD** (ej. S02103 Patricia Blanco):

- Solo pestaña **`formato life`**.
- Filas con X en Uniforme / Camiseta tipan el producto de esa línea.
- `cantidad` + textos tipo `2 LARGA+1 CORTA` definen **unidades** (no confundir CANTIDAD con dorsal).
- Totales SO / resumen HTML = suma de unidades (`parseMangaUnitParts`).
- Detalle skill: `.agents/skills/life-odoo-lista-tarea/excel-formato-life.md`.

---

## 3. Atributos Odoo que el Excel casi no trae

Cuello, Tela, Tipo de Medias, Tipo de pantalon, Tipo de Manga, Forro, Bordado, Botones, Cremallera, Color, Tipo de camiseta, etc. → columnas fijas desde la **línea SO** / match; vacío si N/A; residual → Comentario.

---

## 4. Otras pestañas (`Hoja1` / `Hoja2`)

CURSO, PAGO, FORMA PAGO, PRODUCCION: **no** alimentan el Formulario. Si la misma info aparece en **comentarios** de `formato life`, se captura en **Registro**. No parsear Hoja1/Hoja2 como Detalle de impresión en esta fase.

---

## 5. Resumen

| Entra al Formulario tipado | Otros atributos (concat) | Comentario (persona) | Validación | Registro |
|----------------------------|--------------------------|----------------------|------------|----------|
| Nombre, Número, Talla, Color medias, Producto base, Largo Manga, Género, Deportes, Cuello | Tela, Tipo medias/pantalon, Forro, Bordado, extras tipados (`Clave: valor · …`) | Arquero, K Excel, SOLO PANTALONETA, notas | Camiseta/Uniforme vs cotización | Curso/pago en comentarios → registro |

---

## Referencias

- Parser único: `kapso/functions/lib/parse_life_excel.js`
- Skill columnas: `.agents/skills/life-odoo-lista-tarea/excel-formato-life.md`
- Variantes: `kapso/knowledge/life_variantes_odoo_v1.md`
- ADR: `docs/adr/0002-formulario-life-fixed-attribute-schema.md`
