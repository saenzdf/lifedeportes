/**
/**
 * Detección y cálculo de sobrecostos de precio por talla en Life Deportes Odoo.
 *
 * Reglas comerciales:
 * - Talla 2XL (XXL): +$5.000 COP -> Producto Odoo ID 1805 ("Incrementos de precio: a partir de la 2xl:")
 * - Talla 3XL (XXXL) y superiores (4XL, 5XL, etc.): +$10.000 COP -> Producto Odoo ID 1806 ("Incrementos de precio: a partir de la 3xl")
 */

const PRODUCT_ID_2XL = 1805;
const PRODUCT_NAME_2XL = "Incrementos de precio: a partir de la 2xl:";
const PRICE_2XL = 5000;

const PRODUCT_ID_3XL = 1806;
const PRODUCT_NAME_3XL = "Incrementos de precio: a partir de la 3xl";
const PRICE_3XL = 10000;

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function classifySizeSurcharge(tallaStr) {
  const t = compact(tallaStr).toUpperCase().replace(/\s+/g, "");
  if (!t) return null;

  // 2XL / XXL
  if (/^(2XL|XXL|2-XL|XX-L|TALLA2XL|TALLAXXL)$/.test(t) || /^2XL\b/.test(t) || /^XXL\b/.test(t)) {
    return "2xl";
  }

  // 3XL / XXXL / 4XL / 5XL etc.
  if (
    /^(3XL|XXXL|4XL|XXXXL|5XL|6XL|3-XL|4-XL|5-XL)$/.test(t) ||
    /^[3-9]XL\b/.test(t) ||
    /^X{3,}L\b/.test(t)
  ) {
    return "3xl_plus";
  }

  return null;
}

function computeSizeSurcharges(rows = []) {
  const detailRows = Array.isArray(rows) ? rows : [];
  let count2xl = 0;
  let count3xlPlus = 0;

  for (const row of detailRows) {
    const size = compact(row?.talla || row?.size || row?.TALLA);
    const cat = classifySizeSurcharge(size);
    if (cat === "2xl") {
      count2xl += 1;
    } else if (cat === "3xl_plus") {
      count3xlPlus += 1;
    }
  }

  const surcharges = [];

  if (count2xl > 0) {
    surcharges.push({
      product_id: PRODUCT_ID_2XL,
      product_variant_id: PRODUCT_ID_2XL,
      product_text: PRODUCT_NAME_2XL,
      name: PRODUCT_NAME_2XL,
      quantity: count2xl,
      unit_price: PRICE_2XL,
      unit_cop: PRICE_2XL,
      price_unit: PRICE_2XL,
      total_cop: count2xl * PRICE_2XL,
      category: "otros",
      commercial_role: "extra",
      is_surcharge: true,
      size_category: "2xl",
    });
  }

  if (count3xlPlus > 0) {
    surcharges.push({
      product_id: PRODUCT_ID_3XL,
      product_variant_id: PRODUCT_ID_3XL,
      product_text: PRODUCT_NAME_3XL,
      name: PRODUCT_NAME_3XL,
      quantity: count3xlPlus,
      unit_price: PRICE_3XL,
      unit_cop: PRICE_3XL,
      price_unit: PRICE_3XL,
      total_cop: count3xlPlus * PRICE_3XL,
      category: "otros",
      commercial_role: "extra",
      is_surcharge: true,
      size_category: "3xl_plus",
    });
  }

  return {
    count_2xl: count2xl,
    count_3xl_plus: count3xlPlus,
    total_surcharge_cop: count2xl * PRICE_2XL + count3xlPlus * PRICE_3XL,
    surcharges,
  };
}

module.exports = {
  PRODUCT_ID_2XL,
  PRODUCT_NAME_2XL,
  PRICE_2XL,
  PRODUCT_ID_3XL,
  PRODUCT_NAME_3XL,
  PRICE_3XL,
  classifySizeSurcharge,
  computeSizeSurcharges,
};
