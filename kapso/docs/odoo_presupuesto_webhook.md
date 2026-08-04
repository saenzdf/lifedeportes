# Odoo → Kapso: etapa Proposition (ex Presupuesto)

Contrato vivo: [`docs/odoo/PRESUPUESTO_CRM_SO_WEBHOOK.md`](../../docs/odoo/PRESUPUESTO_CRM_SO_WEBHOOK.md).

Trigger: `crm.lead` → stage **Proposition** (id **3**).  
Etapa «Presupuesto» retirada (fold). Alias email Sales desactivado 2026-07-27.

## Qué hace `on-odoo-presupuesto`

1. Valida `X-Life-Webhook-Secret`.
2. Enriquece SO (Plantilla venta, línea Diseño $0, brief CRM → note si vacía, sin teléfono).
3. Si hay **Excel/Word/PDF FORMATO LIFE** de lista en adjuntos del SO → **organiza los datos** → escribe HTML de lista en `sale.order.note` (`formato_life_pdf_v1` para PDF con texto).
4. Crea/actualiza **líneas comerciales** (`sale.order.line`) desde la lista parseada o, si no hay filas útiles, desde el estimado del brief CRM/note. No modifica Diseño $0.
5. PDF solo-imagen → `needs_ocr`: staff `ask_about_file` + `parsear_lista_pdf_pedido` (`vision_text`).

Deploy:

```bash
node kapso/scripts/deploy_on_odoo_presupuesto.js
node kapso/scripts/deploy_on_odoo_presupuesto.js --invoke=3578,2790
```
