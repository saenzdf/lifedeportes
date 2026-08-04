# Workflows v2 Spec - Life Deportes

## WF-A: `lifedeportes_sales_assist_v2`
### Purpose
Commercial advisory and quoting guidance aligned with playbook.

### Entry criteria
- Intent: `sales_assist`
- User always allowed.

### Required inputs
- `vars.quote.product_text`
- `vars.quote.quantity` (optional for exploratory stage)
- `vars.tenant.id`

### Validation rules
- If product family is uniform/camiseta and material undefined, ask Dry Fit vs Falcao.
- Never provide final price without Odoo lookup.

### Outputs
- `vars.reply_text`
- `vars.quote.should_activate` (optional when customer confirms purchase)

---

## WF-B: `lifedeportes_create_order_text_v2`
### Purpose
Capture and validate customer order from text messages.

### Entry criteria
- Intent: `create_order_text`
- `vars.user.is_allowed_for_transactions == true`

### Required inputs
- Product, quantity, material/variant.
- Customer identity and tenant.

### Validation rules
- Enforce playbook minimums and quote structure.
- Create formal quote only if required fields are complete.

### Outputs
- `vars.order.id`
- `vars.order.status`
- `vars.reply_text`

---

## WF-C: `lifedeportes_create_order_audio_v2`
### Purpose
Transcribe and normalize order information from audio.

### Entry criteria
- Intent: `create_order_audio`
- Allowed user.

### Required inputs
- Audio URL/file reference.
- Tenant and user context.

### Validation rules
- Confirm transcript-derived order summary with customer.
- Route to human handoff when confidence is below threshold.

### Outputs
- `vars.audio.transcript`
- `vars.order.normalized`
- `vars.reply_text`

---

## WF-D: `lifedeportes_record_purchase_receipt_v2`
### Purpose
Register purchase request by extracting data from receipt images.

### Entry criteria
- Intent: `record_purchase_from_receipt`
- Allowed user role (`internal_ops`/authorized).

### Required inputs
- Receipt image reference.
- Tenant context.

### Validation rules
- OCR confidence and mandatory fields: provider, amount, date.
- Ask for retake/reupload if image quality is insufficient.

### Outputs
- `vars.purchase.record_id`
- `vars.purchase.validation_status`
- `vars.reply_text`

---

## WF-E: `lifedeportes_handoff_human_v2`
### Purpose
Escalate conversation to a human operator with full context.

### Entry criteria
- Intent explicitly `handoff_human`, or risk trigger.

### Trigger conditions
- high ambiguity after 2 clarification loops.
- suspicious/security-risk request.
- policy-denied transactional request.
- low confidence in audio/receipt extraction.

### Outputs
- `vars.handoff.ticket_id`
- `vars.handoff.reason`
- `vars.handoff.context_packet`
- customer-facing acknowledgment.
