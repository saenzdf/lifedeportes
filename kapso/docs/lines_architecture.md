# Arquitectura de lineas — v5

## Staff — tres condiciones

| Condicion | Comando / ruta | Agente |
|-----------|----------------|--------|
| Consultas | saludo, preguntas | staff general |
| Subir pedido | `SUBIR PEDIDO` | grill-me upload (registration_type=pedido) |
| Subir nomina/compra | `SUBIR NOMINA`, `SUBIR COMPRA` | grill-me upload (nomina/compra) |

```
staff → detect-staff-command → route-staff-entry
  staff_consultation      → agent staff general
  staff_upload_pedido     → agent upload → SO Odoo
  staff_upload_registro   → agent upload → nomina stub o compra
```

## Cliente — dos agentes + handoff a vendedor

| Agente | Cuando | Rol |
|--------|--------|-----|
| **Agente vendedor** | Cliente nuevo o `start_new_sale` desde historial | Cotizar, buscar_producto_odoo |
| **Agente cliente historico** | existing_customer al entrar | Consultas scope; nuevo pedido → vendedor |

```
existing_customer → agente historico
  consultas → loop
  nuevo pedido → complete_task start_new_sale → agente vendedor

new_customer → agente vendedor
```

### Agente historico — seguridad
- partner_id solo desde vars del hilo (classify)
- Tools rechazan pedidos de otros clientes
- Sin buscar_producto_odoo ni writes
- Prompt anti-jailbreak

Ver `kapso/customer_history_agent_tools.yaml`
