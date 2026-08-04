# Esquema fijo de atributos en Formulario Life

El Formulario Life usa un **esquema fijo** (no columnas dinámicas por producto). **Superseded in scope by ADR 0003:** las columnas visibles de atributo se limitan a las principales del Formato Pedido Life; el resto de `product.attribute` va a Comentario concatenado. Se rechazó crear columnas al vuelo por pedido porque rompería template, filtros y parseo Kapso.
