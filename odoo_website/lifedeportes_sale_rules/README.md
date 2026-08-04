# Life Deportes — Reglas comerciales de venta

Módulo Odoo Online que valida pedidos de venta:

- Mínimo **6 uniformes completos** como producto base (`lifedeportes.uniform_base_min_qty`).
- Camisetas, banderas, medias y pantalonetas solo como **extras adicionales**.
- Campo `x_ld_commercial_role` en `product.template`.

## Instalación

1. Subir el módulo a Odoo Online (Apps → cargar módulo).
2. Instalar **Life Deportes — Reglas comerciales de venta**.
3. Etiquetar productos:

```bash
cd lifedeportes
python scripts/sync_product_commercial_roles.py --dry-run
python scripts/sync_product_commercial_roles.py
```

## Validación

Al guardar un `sale.order` con líneas, Odoo rechaza pedidos que no cumplan la regla comercial.
