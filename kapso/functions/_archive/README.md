# Legacy Kapso functions (archived)

Not part of **v10** workflow graph. Reference only.

## Staff v9 and earlier (2026-07-01)

- `detect_staff_upload_command.js` — v10: staff va directo al agente upload
- `route_staff_entry.js` — v10: sin decide de entrada staff
- `route_staff_post.js` — nunca en grafo v8_session
- `route_staff_registration.js` — v10: write ok → build directo
- `register_nomina_stub.js` — nómina retirada del canal

## Cliente / funnel legacy

- `get_customer_orders_scoped_odoo.js` (replaced by `get_customer_card_scoped_odoo.js`)
- `get_order_status_odoo.js` (replaced by `get_customer_card_scoped_odoo.js`)
- `get_order_timeline_odoo.js` (replaced by `get_customer_card_scoped_odoo.js`)
- `get_customer_project_cards_scoped_odoo.js` (replaced by `get_customer_card_scoped_odoo.js`)
- `get_customer_designs_scoped_odoo.js` (replaced by `get_customer_design_references_scoped_odoo.js`)
- `compose_price_cop.js`
- `design_approval_gate.js`
- `detect_quote_activation.js`
- `emit_quote_signal.js`
- `get_payment_assets.js`
- `media_intake_dispatcher.js`
- `normalize_input.js`
- `normalize_order_details.js`
- `odoo_get_quote_pdf.js`
- `order_commercial_rules.js` (logic inlined in `build_quote_payload.js` and `odoo_create_lead_and_so.js`)
- `prepare_payment_review.js`
- `print_qc_webhook_odoo.js`
- `resolve_tenant_context.js`
