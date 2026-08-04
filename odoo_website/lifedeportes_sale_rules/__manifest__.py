{
    "name": "Life Deportes — Reglas comerciales de venta",
    "summary": "Mínimo 6 uniformes como base; bloqueo de camisetas y extras sueltos.",
    "description": """
Valida pedidos de venta según reglas comerciales Life Deportes:
- Mínimo 6 uniformes completos como producto base.
- Camisetas, banderas, medias y pantalonetas solo como extras adicionales.
- Línea de diseño excluida del conteo.
""",
    "version": "1.0.0",
    "license": "LGPL-3",
    "author": "Life Deportes",
    "category": "Sales",
    "depends": ["sale"],
    "data": [
        "data/ir_config_parameter.xml",
        "views/product_template_views.xml",
    ],
    "installable": True,
    "application": False,
}
