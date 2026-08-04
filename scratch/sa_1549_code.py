TEMPLATE_ID = 1
DESIGN_PRODUCT_ID = 504

ICP = env['ir.config_parameter'].sudo()
webhook_url = ICP.get_param('life.kapso.presupuesto_webhook_url') or ''
webhook_secret = ICP.get_param('life.kapso.presupuesto_webhook_secret') or ''

for lead in records:
    partner = lead.partner_id
    if not partner:
        log('CRM Presupuesto: lead %s sin partner — no SO' % lead.id)
        continue

    existing = env['sale.order'].search([
        ('opportunity_id', '=', lead.id),
        ('state', 'in', ['draft', 'sent']),
    ], order='id desc', limit=1)

    if existing:
        order = existing
        log('CRM Presupuesto: reusa SO %s para lead %s' % (order.name, lead.id))
    else:
        vals = {
            'partner_id': partner.id,
            'opportunity_id': lead.id,
            'sale_order_template_id': TEMPLATE_ID,
            'origin': lead.name or '',
        }
        note = lead.description or ''
        if note:
            vals['note'] = note
        order = env['sale.order'].create(vals)
        log('CRM Presupuesto: creado SO %s (lead %s)' % (order.name, lead.id))

    if not order.sale_order_template_id:
        order.write({'sale_order_template_id': TEMPLATE_ID})

    has_design = False
    for line in order.order_line:
        if line.product_id and line.product_id.id == DESIGN_PRODUCT_ID:
            has_design = True
            break
    if not has_design:
        env['sale.order.line'].create({
            'order_id': order.id,
            'product_id': DESIGN_PRODUCT_ID,
            'name': 'Diseño',
            'product_uom_qty': 1,
            'price_unit': 0,
        })

    if webhook_url:
        phone = lead.phone or ''
        if not phone and partner.phone:
            phone = partner.phone
        payload = {
            'event': 'crm.stage.presupuesto',
            'lead_id': lead.id,
            'so_id': order.id,
            'so_name': order.name,
            'partner_phone': phone or '',
            'partner_name': partner.name or '',
            'order_summary': lead.name or '',
        }
        headers = {
            'Content-Type': 'application/json',
            'X-Life-Webhook-Secret': webhook_secret or '',
        }
        resp = requests.post(webhook_url, json=payload, headers=headers, timeout=20)
        log('CRM Presupuesto: Kapso HTTP %s (SO %s)' % (resp.status_code, order.name))
