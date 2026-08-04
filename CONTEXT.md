# Life Deportes

Lenguaje canónico para ventas, preparación e ingreso de pedidos personalizados de Life Deportes.

## Language

**Camiseta sola**:
Prenda superior deportiva vendible desde 6 unidades del mismo producto y diseño. Una mención sin calificadores de “camiseta” o “camisa” siempre significa camiseta sola.
_Avoid_: Camiseta extra, camiseta suelta

**Uniforme**:
Kit deportivo completo; incluye camiseta y las demás prendas definidas para el producto cotizado. Solo “uniforme” o “kit” expresa este concepto.
_Avoid_: Camiseta, camisa

**Borrador Odoo**:
Registro comercial aún no confirmado, reversible y sujeto a revisión. No representa una venta cerrada ni autoriza producción.
_Avoid_: Pedido confirmado, venta confirmada

**Alias regional**:
Palabra o expresión usada localmente por clientes para nombrar un término canónico sin cambiar su significado. Se normaliza al término canónico antes de interpretar el pedido.
_Avoid_: Producto distinto, variante implícita

**Formulario Life**:
Documento spreadsheet del borrador Odoo que abre el smart button del pedido (título tipo `S0xxxx Formulario pedido Life`). Contiene pestañas; no es una sola hoja de cálculo. Dueño del **fill de celdas**: Odoo (script/automatización), no Kapso. Kapso entrega un **Payload Formulario**; no pisa fórmulas nativas ni el vínculo ODOO.LIST.
_Avoid_: Calculadora de presupuestos, Calculadora, cotización

**Payload Formulario**:
JSON canónico que Kapso deja en el **Borrador Odoo** (Detalle de pedido + atributos tipados listos para pestañas). Es la fuente que Odoo consume para llenar el Formulario Life cuando el documento ya existe.
_Avoid_: Snapshot de celdas Kapso, spreadsheet_data escrito por Kapso, fill directo XML-RPC a celdas

**Confrontación Kapso↔Formulario**:
Comparación entre lo que Kapso propuso (Payload Formulario / Detalle) y lo que quedó (o debería quedar) en el Formulario Life nativo Odoo. Modo **híbrido**: siempre deja evidencia (score/diffs / `needs_review`); solo **bloquea** el write ante fallos graves (sin líneas, producto irresoluble, mínimo comercial incumplido sin confirmación staff). No sustituye el juicio del vendedor ante ambigüedad.
_Avoid_: Gate duro que bloquea casi todos los borradores; “match exacto de palabra” como única prueba; ignorar diffs de fidelidad

**Pestaña Aprobación**:
Pestaña del Formulario Life (título «…Aprobación nombres, tallas y numero»): una fila por unidad. Producto base, personalización, columnas principales de atributo, **Otros atributos**, **Comentario**.
_Avoid_: Formulario Life (el documento completo), Calculadora

**Pestaña Productos del pedido**:
Pestaña del Formulario Life (antes «Pedido»; Kapso la renombra en el fill): una fila por línea SO. Producto base, columnas principales, Otros atributos, Comentario.
_Avoid_: Pedido (a secas), Pestaña Pedido, Formulario Life

**Producto base**:
Nombre canónico del producto sin atributos de variante ni descripción ecommerce (ej. «Uniforme de Fútbol»). Es el único contenido permitido en la columna Producto del Formulario Life.
_Avoid_: Nombre completo Odoo, display name, variante

**Atributo de variante**:
Dimensión de configuración del producto. En el Formulario Life las **columnas principales** tienen columna propia; el resto tipado va a **Otros atributos**; lo no tipado o notas de persona van a **Comentario**.
_Avoid_: Variante (la combinación completa), opción suelta, feature, columnas dinámicas por producto

**Columnas principales (Formulario)**:
Atributos con columna propia: **Largo Manga**, **Género**, **Deportes**, **Cuello**. Personalización: Nombre, Número, Talla, Color medias, Producto base. Los demás attrs Odoo van a **Otros atributos**. Notas de persona van a **Comentario**.
_Avoid_: Unión completa de product.attribute como columnas visibles; mezclar attrs residuales con notas de persona

**Cuello (dato)**:
Atributo principal. Suele salir de la **conversación** o de cómo el cliente nombra el producto. Orden de llenado: (1) conversación / order_draft, (2) embebido en nombre de producto del cliente, (3) línea SO tipificada, (4) vacío — no inventar default. No es columna del Excel Formato Pedido Life.
_Avoid_: Inventar cuello por defecto sin mención del cliente

**Otros atributos**:
Columna del Formulario con attrs Odoo no principales, concatenados `Clave: valor · …` (ej. `Tela: Dry-fit · Medias: Semiprofesionales · Pantaloneta: Pantaloneta`). No repite Cuello, Largo Manga, Género ni Deportes.
_Avoid_: Comentario (notas de persona)

**Comentario**:
Texto libre de persona o producción (arquero, Excel K, excepciones). Columna distinta de **Otros atributos**.
_Avoid_: Atributo tipado, Otros atributos

**Formato Pedido Life**:
Plantilla Excel operativa (y copias). Pestaña `formato life`: nombre, talla, número (NUMERO o No.), manga, género (MAS/FEM), arquero, comentario; metadatos color de media y disciplina. Marcas Camiseta/Uniforme son solo validación pre-ingreso, no columnas del Formulario Life. Curso/pago en comentarios se conservan como registro. Una sola lógica de parseo: `parse_life_excel.js`. Contrato Excel↔Formulario **cerrado** (jul 2026): `kapso/docs/formato_life_column_correlation.md`.
_Avoid_: Formulario Life (el spreadsheet Odoo), cotización genérica

**Género (lista)**:
Marca MAS o FEM en el Formato Pedido Life: masculino o femenino. Alimenta el Detalle y, cuando el producto lo tipa, el Atributo de variante Género.
_Avoid_: Camiseta/Uniforme como sinonimo de género

**Detalle de pedido**:
Lista canónica de prendas individuales que especifica, por persona o pieza, datos de personalización como nombre, dorsal, talla, rol y observaciones. Complementa el pedido comercial, pero no cambia por sí sola el producto ni la cantidad cotizados.
_Avoid_: Cotización, línea comercial

## Kapso lane goals

Ver `kapso/docs/lane_goals.md`.

- **Ventas:** IA precalifica; interés claro → `notificar_interes_ventas` + waiting (sin handoff); handoff solo si piden humano. Preferir Compose en waiting.
- **Staff:** rutas predeterminadas para ingreso común; modo copiloto general cuando el formato no encaja; resume post-SO vuelve al agente salvo ack.
