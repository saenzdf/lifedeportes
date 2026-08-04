/**
 * Schema purchase_draft_v1 — borrador de compra Life Deportes (Kapso staff).
 *
 * Escritura: purchase.order state=draft únicamente.
 * Prohibido: action_confirm, recepción, factura, pago.
 */

/**
 * @typedef {object} PurchaseDraftLine
 * @property {string} product_text
 * @property {number|null} [product_id]
 * @property {number} quantity
 * @property {number|null} [price_unit]
 */

/**
 * @typedef {object} PurchaseDraftV1
 * @property {"purchase_draft_v1"} schema
 * @property {"pending_confirmation"|"draft_created"|"blocked"} status
 * @property {boolean} confirmed
 * @property {string|null} partner_name
 * @property {number|null} partner_id
 * @property {PurchaseDraftLine[]} lines
 * @property {string|null} [notes]
 * @property {string|null} [idempotency_key]
 * @property {{ purchase_order_id: number, purchase_order_name: string, url: string }|null} [odoo]
 */
