const UNIFORM_BASE_MIN_QTY = 6;

function inferCommercialRoleFromLine(line) {
  if (line?.commercial_role) return line.commercial_role;
  const category = String(line?.category || "").toLowerCase();
  const name = String(line?.name || "").toLowerCase();
  if (name.includes("diseno") || name.includes("diseño")) return "design";
  if (category === "uniforme") return "base_uniform";
  if (["camiseta", "pantaloneta", "medias", "otros"].includes(category)) return "extra";
  return "extra";
}

function normalizeCommercialLine(line) {
  return {
    category: String(line?.category || "").toLowerCase(),
    commercial_role: inferCommercialRoleFromLine(line),
    quantity: Math.max(0, Number(line?.quantity || 0)),
    name: String(line?.name || ""),
    product_text: String(line?.product_text || line?.name || ""),
  };
}

function validateCommercialOrder({ lines, uniformBaseMinQty = UNIFORM_BASE_MIN_QTY }) {
  const normalized = (lines || [])
    .map(normalizeCommercialLine)
    .filter((line) => line.commercial_role !== "design" && line.quantity > 0);

  let baseUniformQty = 0;
  let extrasQty = 0;
  for (const line of normalized) {
    if (line.commercial_role === "base_uniform") {
      baseUniformQty += line.quantity;
      continue;
    }
    if (line.commercial_role === "extra") {
      extrasQty += line.quantity;
    }
  }

  if (baseUniformQty === 0 && extrasQty === 0) {
    return {
      ok: false,
      code: "NO_COMMERCIAL_LINES",
      message_es: "El pedido no tiene líneas comerciales.",
      base_uniform_qty: 0,
      extras_qty: 0,
    };
  }

  if (baseUniformQty === 0 && extrasQty > 0) {
    const belowMinimum = normalized.find((line) => line.quantity < uniformBaseMinQty);
    if (belowMinimum) {
      return {
        ok: false,
        code: "STANDALONE_BELOW_MINIMUM",
        message_es: `El pedido mínimo es ${uniformBaseMinQty} unidades del mismo producto/diseño. ${belowMinimum.name || belowMinimum.product_text} tiene ${belowMinimum.quantity}.`,
        base_uniform_qty: 0,
        extras_qty: extrasQty,
      };
    }
    return {
      ok: true,
      code: null,
      message_es: null,
      base_uniform_qty: 0,
      extras_qty: extrasQty,
    };
  }

  if (baseUniformQty > 0 && baseUniformQty < uniformBaseMinQty) {
    return {
      ok: false,
      code: "BASE_BELOW_MINIMUM",
      message_es: `Sumerce, el pedido mínimo es ${uniformBaseMinQty} uniformes completos por diseño. Con ${baseUniformQty} no alcanzamos; ¿los hacemos en ${uniformBaseMinQty}?`,
      base_uniform_qty: baseUniformQty,
      extras_qty: extrasQty,
    };
  }

  return {
    ok: true,
    code: null,
    message_es: null,
    base_uniform_qty: baseUniformQty,
    extras_qty: extrasQty,
  };
}

function resolveCatalogProduct(catalogCache, productText) {
  const products = catalogCache?.products || [];
  const needle = normalizeText(productText);
  if (!needle) return null;
  const exact = products.find((p) => normalizeText(p.name) === needle);
  if (exact) return exact;
  return (
    products.find((p) => {
      const name = normalizeText(p.name);
      return name.includes(needle) || needle.includes(name);
    }) || null
  );
}

function buildCommercialLineFromInput(inputLine, catalogCache) {
  const productText = String(inputLine?.product_text || inputLine?.name || "").trim();
  const quantity = Math.max(1, Number(inputLine?.quantity || 1));
  const matched = resolveCatalogProduct(catalogCache, productText);
  if (matched) {
    return {
      category: matched.category,
      commercial_role: matched.commercial_role || inferCommercialRoleFromLine(matched),
      quantity,
      name: matched.name,
      product_text: productText || matched.name,
      odoo_product_id: matched.odoo_id || null,
      unit_cop: matched.list_price_cop,
    };
  }
  const category = String(inputLine?.category || "").toLowerCase() || null;
  const name = productText || String(inputLine?.name || "");
  return {
    category,
    commercial_role: inferCommercialRoleFromLine({ category, name }),
    quantity,
    name,
    product_text: productText || name,
    odoo_product_id: inputLine?.odoo_product_id || null,
    unit_cop: Number(inputLine?.unit_cop || inputLine?.unit_price || 0) || null,
  };
}

function buildOrderLinesFromDraft(draftPayload, matchedProduct, catalogCache) {
  const lines = [];
  const mainQty = Math.max(1, Number(draftPayload?.quantity || 1));
  const mainText = String(draftPayload?.product_text || draftPayload?.matched_product_name || "").trim();
  if (mainText || matchedProduct) {
    lines.push(
      buildCommercialLineFromInput(
        {
          product_text: mainText || matchedProduct?.name,
          quantity: mainQty,
          category: matchedProduct?.category,
          name: matchedProduct?.name || mainText,
          odoo_product_id: draftPayload?.odoo_product_id || matchedProduct?.odoo_id,
          unit_cop: draftPayload?.unit_cop || matchedProduct?.list_price_cop,
        },
        catalogCache
      )
    );
  }

  const extraSources = [];
  if (Array.isArray(draftPayload?.extra_lines)) extraSources.push(...draftPayload.extra_lines);
  if (Array.isArray(draftPayload?.rows)) {
    for (const row of draftPayload.rows) {
      extraSources.push({
        product_text: row.name || row.product_text,
        quantity: row.quantity || row.product_uom_qty,
        odoo_product_id: row.product_id || row.odoo_product_id,
        unit_cop: row.unit_price ?? row.price_unit,
        category: row.category,
      });
    }
  }

  for (const extra of extraSources) {
    const built = buildCommercialLineFromInput(extra, catalogCache);
    const duplicateMain =
      lines.length === 1 &&
      built.name &&
      lines[0].name &&
      built.name.toLowerCase() === lines[0].name.toLowerCase();
    if (!duplicateMain) lines.push(built);
  }

  return lines;
}

function buildDraftRowsFromLines(lines) {
  return (lines || [])
    .filter((line) => line.commercial_role !== "design")
    .map((line) => ({
      name: line.name,
      product_text: line.product_text || line.name,
      quantity: line.quantity,
      product_id: line.odoo_product_id || null,
      category: line.category,
      commercial_role: line.commercial_role,
      unit_price: line.unit_cop ?? 0,
      price_unit: line.unit_cop ?? 0,
    }));
}

function getUniformBaseMinQty(catalogCache) {
  return Number(catalogCache?.commercial_rules?.uniform_base_min_qty || UNIFORM_BASE_MIN_QTY);
}
