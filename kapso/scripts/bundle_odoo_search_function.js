#!/usr/bin/env node
/**
 * Empaqueta motor de match + catálogo semántico + tienda Odoo en odoo_search_product_price.js.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const enginePath = path.join(root, "functions/lib/product_match_engine.js");
const policyPath = path.join(root, "functions/lib/commercial_policy.js");
const shopPath = path.join(root, "functions/lib/odoo_shop_media.js");
const catalogPath = path.join(root, "catalog/life_catalog_semantic_v1.json");
const outPath = path.join(root, "functions/odoo_search_product_price.js");

const stripExports = (src) =>
  src.replace(/^export function /gm, "function ").replace(/^export /gm, "");

const policyBody = stripExports(fs.readFileSync(policyPath, "utf8"));
const engineBody = stripExports(fs.readFileSync(enginePath, "utf8")).replace(
  /^import\s+\{[^}]+\}\s+from\s+["']\.\/commercial_policy\.js["'];?\s*/m,
  ""
);
const shopBody = stripExports(fs.readFileSync(shopPath, "utf8"));
const catalog = fs.readFileSync(catalogPath, "utf8").trim();

const handler = `
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const executionVars = body?.execution_context?.vars || body?.vars || {};

  const productText = String(
    input.product_text ||
      input.query ||
      executionVars?.quote?.product_text ||
      executionVars?.intent?.product_text ||
      ""
  ).trim();
  const variantNotes = String(input.variant_notes || "").trim();
  const combinedProductText = [productText, variantNotes].filter(Boolean).join(" ");
  const quantity = Math.max(
    1,
    Number(input.quantity || executionVars?.quote?.quantity || 1)
  );
  const wantsShopMedia = isShopPhotoRequest(productText, input);

  if (!productText && !(input.visual_hints || input.photo_description) && !wantsShopMedia) {
    return json({
      vars: {
        product: { found: false, match_confidence: "none" },
        pricing: null,
      },
      note: "Falta product_text o descripcion visual",
    });
  }

  const matchInput = {
    product_text: combinedProductText || String(input.photo_description || "referencia visual"),
    quantity,
    sport: input.sport || null,
    garment_type: input.garment_type || null,
    collar: input.collar || null,
    sleeves: input.sleeves || null,
    material: input.material || null,
    with_lining: input.with_lining || null,
    visual_hints: []
      .concat(input.visual_hints || [], input.photo_description || [], input.reference_notes || [])
      .filter(Boolean),
  };

  let local = matchProduct(matchInput, SEMANTIC_CATALOG);
  local = preferPublishedCatalogMatch(local, SEMANTIC_CATALOG, wantsShopMedia);

  if (local.sport_declined) {
    return json({
      status: "blocked",
      message: local.customer_reply_es || local.message_es,
      vars: {
        product: {
          found: false,
          match_confidence: "none",
          sport_declined: true,
          sport_detected: local.sport_detected || null,
          customer_reply_es: local.customer_reply_es || local.message_es,
          do_not_search: true,
          agent_hint_es: local.agent_hint_es || null,
        },
        service: serviceMeta("blocked", local.customer_reply_es || local.message_es),
      },
    });
  }

  let unit = local.unit_cop;
  let matchName = local.match_name;
  let matchId = local.odoo_template_id;
  let priceSource = "catalog_cache";
  let shop = null;
  let shopCatalog = [];

  const odooCreds = {
    ODOO_URL: env.ODOO_URL,
    ODOO_DB: env.ODOO_DB,
    ODOO_USERNAME: env.ODOO_USERNAME,
    ODOO_PASSWORD: env.ODOO_PASSWORD,
  };

  let variantExtras = [];

  if (odooCreds.ODOO_URL) {
    if (local.found && matchId) {
      const live = await fetchOdooTemplateLive(odooCreds, matchId, matchName);
      if (live) {
        shop = live;
        if (live.unit_cop) {
          unit = live.unit_cop;
          matchName = live.name || matchName;
          matchId = live.id || matchId;
          priceSource = "odoo_live";
        }
      }
      const wantsVariant =
        local.parsed &&
        (local.parsed.withLining === "con_forro" ||
          local.parsed.sleeves === "manga_larga" ||
          local.parsed.collar === "cuello_sport" ||
          local.parsed.material === "dumonti" ||
          ["impermeable", "bolsillos", "lycra"].includes(local.parsed.shortType));
      if (wantsVariant) {
        const extras = await fetchVariantExtras(odooCreds, matchId);
        variantExtras = matchRequestedExtras(extras, local.parsed);
        if (variantExtras.length && unit) {
          unit += variantExtras.reduce((s, e) => s + e.extra_cop, 0);
        }
      }
    }

    if (wantsShopMedia) {
      if (!local.found) {
        shopCatalog = await searchPublishedShopProducts(odooCreds, {
          query: productText,
          limit: Number(input.shop_catalog_limit || 5),
        });
      }
    }
  }

  const total = unit ? unit * quantity : null;
  let status = local.found ? "ready" : "needs_clarification";
  if (wantsShopMedia && shop?.is_published) status = "shop_media_ready";
  else if (wantsShopMedia && shopCatalog.length) status = "shop_catalog_suggestions";
  else if (wantsShopMedia && local.found)
    status = "shop_not_published";

  const shopPayload = compactShopPayload(shop?.is_published ? shop : null);
  const catalogPayload = shopCatalog.map((row) => compactShopPayload(row)).filter(Boolean);
  const shopBase = shopPublicBase(odooCreds);
  const unavailableShopPayload =
    wantsShopMedia && local.found && !shopPayload
      ? {
          odoo_template_id: matchId || null,
          name: matchName || null,
          is_published: false,
          page_url: null,
          image_url: null,
          shop_home_url: shopBase ? \`\${shopBase}/shop\` : null,
          unavailable_reason: "exact_product_not_published",
        }
      : null;

  return json({
    status,
    message:
      wantsShopMedia && shopPayload?.page_url
        ? \`Tienda: \${shopPayload.name} — \${shopPayload.page_url}\`
        : wantsShopMedia && local.found
          ? "El producto exacto no tiene una foto publicada en Odoo."
        : local.interpretation_es || (local.found ? matchName : "Sin match"),
    vars: {
      product: {
        found: Boolean(local.found),
        match_confidence: local.match_confidence,
        match_name: matchName || null,
        match_id: matchId || null,
        odoo_template_id: matchId || null,
        query_text: productText,
        interpretation_es: local.interpretation_es || null,
        clarifying_question: local.clarifying_question || null,
        missing_dimensions: local.missing_dimensions || [],
        candidates: local.candidates || [],
        parsed_intent: local.parsed || null,
        alternatives: local.alternatives || [],
        category: local.category || null,
        variant: local.variant || null,
        commercial_role: local.commercial_role || null,
        catalog_published: shop?.is_published ?? null,
      },
      shop: shopPayload || unavailableShopPayload,
      shop_catalog: catalogPayload,
      pricing: unit
        ? {
            unit_cop: unit,
            total_cop: total,
            quantity,
            price_source: priceSource,
            variant_extras: variantExtras,
          }
        : null,
      quote: local.found
        ? {
            product_text: matchName,
            quantity,
            unit_cop: unit,
            total_cop: total,
            odoo_product_id: matchId,
            match_confidence: local.match_confidence,
            price_source: priceSource,
          }
        : {
            product_text: productText,
            quantity,
            match_confidence: local.match_confidence,
          },
      service: serviceMeta(status),
    },
  });
}

function json(payload) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });
}

function serviceMeta(status, fallback = null) {
  return {
    last_call_name: "buscar_producto_odoo",
    last_call_status: status,
    last_call_at: new Date().toISOString(),
    fallback_message: fallback,
  };
}
`;

const bundled = `// AUTO-GENERATED by scripts/bundle_odoo_search_function.js — no editar a mano
// <<SEMANTIC_CATALOG_START>>
const SEMANTIC_CATALOG = ${catalog};
// <<SEMANTIC_CATALOG_END>>

// <<MATCH_ENGINE_START>>
${policyBody}

${engineBody}
// <<MATCH_ENGINE_END>>

// <<SHOP_MEDIA_START>>
${shopBody}
// <<SHOP_MEDIA_END>>

${handler.trim()}
`;

fs.writeFileSync(outPath, bundled);
console.log("Bundled", outPath);
