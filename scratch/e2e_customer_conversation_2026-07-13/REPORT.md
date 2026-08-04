# E2E conversation lane 2026-07-13

**3/3** OK

| ID | Slug | OK | Notes |
|----|------|----|-------|
| C1 | gradual_venta | ✓ | gradual + precio; aún empuja a registrar |
| C2 | rafaga_tres_msgs | ✓ | ráfaga→1 reply tras silencio ✓ |
| C3 | camiseta_abono_sin_cerrar | ✓ | camiseta $30k + abono 50% sin "anotado" |

## Entregado

- Debounce 30s (`wait_customer_burst`)
- Historial solo inquiry pedido
- Prompt v7 + KBs tono corto
- Semántica: `buscar_producto_odoo` + KB lenguaje (aliases regionales aún no wire)

