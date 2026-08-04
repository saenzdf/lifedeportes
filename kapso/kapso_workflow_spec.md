# Kapso Workflow Spec - Life Deportes

## Objetivo
Definir el workflow nuevo de WhatsApp en Kapso con paridad funcional del runtime Python:
- exploracion comercial,
- cotizacion inmediata con Odoo,
- deteccion de cierre y activacion de cotizacion,
- reglas de seguridad equivalentes a `mcp_firewall.py`.

## Fuente de verdad funcional
- `sales_logic.md`
- `tips_operativos.md`
- `prompts/sales_agent_v2.md`

## Variables de estado (execution context `vars`)
- `customer.phone`
- `intent.type` (`greeting`, `quote`, `info`, `closing`, `post_sale`)
- `intent.product_text`
- `intent.quantity`
- `intent.variant`
- `intent.material`
- `product.match_name`
- `product.match_id`
- `pricing.unit_cop`
- `pricing.total_cop`
- `quote.should_activate` (bool)
- `firewall.call_count`
- `firewall.last_block_reason`

## Workflow 1: `lifedeportes_sales_inbound_v1`
Nodos:
1. `start` (trigger inbound WhatsApp)
2. `normalize_input`
3. `policy_guard_input`
4. `intent_classifier`
5. `needs_disambiguation` (decide)
6. `disambiguation_reply`
7. `odoo_product_search`
8. `price_composer`
9. `sales_reply_agent`
10. `closing_detector`
11. `activate_quote_signal` (si aplica)
12. `send_reply`
13. `error_fallback`

## Workflow 2: `lifedeportes_quote_activation_v1`
Nodos:
1. `start` (trigger por señal interna)
2. `validate_quote_payload`
3. `create_or_update_lead`
4. `create_sale_order`
5. `reply_quote_confirmed`
6. `error_fallback`

## Politicas de seguridad (paridad firewall)
- Sanitizacion de prompt injection antes de cualquier decision.
- Whitelist de modelos/metodos Odoo:
  - `product.template`: `search_read`
  - `product.product`: `search_read`
  - `res.partner`: `search_read`, `create`
  - `crm.lead`: `search_read`, `create`
  - `sale.order`: `search_read`, `read`, `create` — **sin** `action_confirm` (confirmación solo manual en Odoo por operaria)
  - `sale.order.line`: `search_read`, `read`, `create`
  - `ir.attachment`: `search_read`, `read`, `create`
  - `project.task`: `search_read`, `read`, `write`
- Limite de llamadas MCP por ejecucion: `30`.
- Bloqueo de patrones peligrosos en salida del LLM.

## Regla comercial critica (material)
- Dry Fit y Falcao se tratan como productos/materiales distintos.
- Si el cliente no define material, preguntar antes de cotizar total.

## Formato de precios
- COP sin decimales.
- Separador de miles con punto.
- Si hay producto + cantidad: precio unitario + total en la misma respuesta.
