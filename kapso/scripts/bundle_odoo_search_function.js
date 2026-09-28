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

  // --- Jev Layer: Desambiguación de producto y sobrecostos de tallas ---
  const JEV_MODE = String(env?.LIFE_JEV_MODE || "off").toLowerCase().trim();
  const JEV_THRESHOLD = Number(env?.LIFE_JEV_THRESHOLD || 0.7);
  let jevShadow = null;
  let sizeSurcharges = [];

  if (JEV_MODE === "shadow" || JEV_MODE === "on") {
    const t0 = Date.now();
    const key = String(env?.OPENROUTER_API_KEY || "").trim();
    if (key) {
      const jevQuestions = {
        matched_template: {
          type: "choice",
          instructions: "De los templates del catálogo de Life Deportes, ¿cuál es el producto principal solicitado? 115 para Uniforme de Fútbol completo (camiseta+pantaloneta), 62 para Camiseta dry-fit sola, 23 para Baloncesto, 31 para Voleibol, 8 para Polo presentación, 68 para Rompevientos, 1800 para Chaqueta Lotto, 66 para Sudadera, 179 para Buzo arquero, 178 para Conjunto arquero, 69 para Peto.",
          criteria: {
            "115": "Uniforme de Fútbol completo (camiseta + pantaloneta + medias)",
            "62": "Camiseta deportiva dry-fit (solo camiseta)",
            "23": "Uniforme de baloncesto",
            "31": "Uniforme de voleibol",
            "8": "Uniforme de Presentación polo",
            "68": "Chaqueta rompevientos",
            "1800": "Chaqueta Lotto",
            "66": "Sudadera Chaqueta y Pantalón",
            "179": "Buzo de arquero",
            "178": "Conjunto de arquero",
            "69": "Peto sublimado",
            "other": "Otro producto o no especificado claramente"
          }
        },
        collar_type: {
          type: "choice",
          instructions: "¿El cliente solicita cuello polo o cuello sport (+ $3.000 COP)?",
          criteria: {
            "sport_polo": "Solicita cuello polo o cuello sport",
            "normal": "Cuello en V, redondo o normal",
            "unspecified": "No especifica cuello"
          }
        },
        has_plus_sizes: {
          type: "choice",
          instructions: "¿El pedido contiene prendas en tallas especiales (2XL / XXL o 3XL / XXXL)? Recuerda: 2XL y XXL son sinónimos exactos (+$5.000 COP); 3XL y XXXL son sinónimos exactos (+$10.000 COP).",
          criteria: {
            "none": "No hay tallas especiales o solo tallas estándar 2 a XL",
            "has_2xl": "Tiene talla 2XL o XXL",
            "has_3xl": "Tiene talla 3XL o XXXL",
            "has_both": "Tiene tanto 2XL/XXL como 3XL/XXXL"
          }
        },
        qty_2xl: {
          type: "choice",
          instructions: "¿Cuántas prendas en talla 2XL o XXL solicita el cliente? (2XL y XXL son sinónimos)",
          criteria: {
            "0": "Cero prendas en 2XL o XXL",
            "1": "Una prenda en 2XL o XXL",
            "2": "Dos prendas en 2XL o XXL",
            "3": "Tres prendas en 2XL o XXL",
            "4": "Cuatro prendas en 2XL o XXL",
            "5": "Cinco prendas en 2XL o XXL",
            "6": "Seis prendas en 2XL o XXL",
            "7": "Siete prendas en 2XL o XXL",
            "8": "Ocho prendas en 2XL o XXL",
            "9": "Nueve prendas en 2XL o XXL",
            "10": "Diez prendas en 2XL o XXL",
            "more_than_10": "Más de 10 prendas en 2XL o XXL"
          }
        },
        qty_3xl: {
          type: "choice",
          instructions: "¿Cuántas prendas en talla 3XL o XXXL solicita el cliente? (3XL y XXXL son sinónimos)",
          criteria: {
            "0": "Cero prendas en 3XL o XXXL",
            "1": "Una prenda en 3XL o XXXL",
            "2": "Dos prendas en 3XL o XXXL",
            "3": "Tres prendas en 3XL o XXXL",
            "4": "Cuatro prendas en 3XL o XXXL",
            "5": "Cinco prendas en 3XL o XXXL",
            "6": "Seis prendas en 3XL o XXXL",
            "7": "Siete prendas en 3XL o XXXL",
            "8": "Ocho prendas en 3XL o XXXL",
            "9": "Nueve prendas en 3XL o XXXL",
            "10": "Diez prendas en 3XL o XXXL",
            "more_than_10": "Más de 10 prendas en 3XL o XXXL"
          }
        }
      };

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const jevRes = await fetch("https://openrouter.ai/api/alpha/decisions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "typesafe/jev-1.13",
            state: {
              customer_text: combinedProductText,
              quantity,
              local_match: { id: matchId, name: matchName, score: local.score },
            },
            questions: jevQuestions,
          }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);

        if (jevRes.ok) {
          const jevJson = await jevRes.json();
          const ans = jevJson?.answers || {};
          const matchedChoice = ans.matched_template?.choice;
          const matchedConf = Number(ans.matched_template?.confidence || 0);
          const collarChoice = ans.collar_type?.choice;
          const qty2XL = parseInt(ans.qty_2xl?.choice || "0", 10) || 0;
          const qty3XL = parseInt(ans.qty_3xl?.choice || "0", 10) || 0;

          let jevApplied = false;

          // Sobrecostos de tallas
          if (qty2XL > 0) {
            sizeSurcharges.push({
              odoo_product_id: 1805,
              type: "size_2xl",
              name: "Sobrecosto Talla 2XL / XXL",
              unit_cop: 5000,
              quantity: qty2XL,
              total_cop: 5000 * qty2XL,
            });
          }
          if (qty3XL > 0) {
            sizeSurcharges.push({
              odoo_product_id: 1806,
              type: "size_3xl",
              name: "Sobrecosto Talla 3XL / XXXL",
              unit_cop: 10000,
              quantity: qty3XL,
              total_cop: 10000 * qty3XL,
            });
          }
          if (collarChoice === "sport_polo" && matchId !== 8 && matchId !== 61) {
            sizeSurcharges.push({
              type: "collar",
              name: "Sobrecosto Cuello Polo/Sport",
              unit_cop: 3000,
              quantity: quantity,
              total_cop: 3000 * quantity,
            });
          }

          if (JEV_MODE === "on" && matchedChoice && matchedChoice !== "other" && matchedConf >= JEV_THRESHOLD) {
            const tmplNum = Number(matchedChoice);
            if (Number.isFinite(tmplNum) && tmplNum > 0) {
              matchId = tmplNum;
              if (tmplNum === 115) { matchName = "Uniforme de Fútbol"; unit = 50000; }
              else if (tmplNum === 62) { matchName = "Camiseta deportiva dry-fit"; unit = 30000; }
              else if (tmplNum === 23) { matchName = "Uniforme de baloncesto"; unit = 50000; }
              else if (tmplNum === 31) { matchName = "Uniforme de voleibol"; unit = 50000; }
              else if (tmplNum === 66) { matchName = "Sudadera Chaqueta y Pantalón"; unit = 100000; }
              else if (tmplNum === 8) { matchName = "Uniforme de Presentación polo"; unit = 75000; }
              else if (tmplNum === 68) { matchName = "Chaqueta rompevientos"; unit = 60000; }
              else if (tmplNum === 1800) { matchName = "Chaqueta Lotto"; unit = 60000; }
              else if (tmplNum === 1795) { matchName = "Buso deportivo"; unit = 65000; }
            }
            const hasSinCapota = /\bsin\s+capota\b/i.test(combinedProductText);
            if (hasSinCapota && matchName) {
              matchName = matchName.replace(/\s*con\s+capota/i, "") + " (sin capota)";
            }
            jevApplied = true;
          }

          jevShadow = {
            enabled: true,
            mode: JEV_MODE,
            ok: true,
            matched_template: matchedChoice,
            confidence: matchedConf,
            collar: collarChoice,
            qty_2xl: qty2XL,
            qty_3xl: qty3XL,
            surcharges_count: sizeSurcharges.length,
            applied: JEV_MODE === "on",
            latency_ms: Date.now() - t0,
            cost_usd: jevJson?.usage?.cost || null,
          };
        } else {
          jevShadow = { enabled: true, mode: JEV_MODE, ok: false, reason: "http_" + jevRes.status };
        }
      } catch (err) {
        clearTimeout(timer);
        jevShadow = { enabled: true, mode: JEV_MODE, ok: false, reason: err?.name === "AbortError" ? "timeout" : "network" };
      }
    }
  }

  const surchargesTotal = (JEV_MODE === "on" ? sizeSurcharges : []).reduce((s, x) => s + x.total_cop, 0);
  const total = unit ? (unit * quantity) + surchargesTotal : null;

  // Resumen formateado para que el bot lo cite directamente
  let summaryForBot = "";
  if (unit) {
    const parts = [quantity + " × " + matchName + " ($" + Number(unit).toLocaleString("es-CO") + " c/u)"];
    if (sizeSurcharges.length > 0) {
      const extraList = sizeSurcharges
        .map(function(s) { return s.quantity + " u. " + s.name + " (+$" + Number(s.total_cop).toLocaleString("es-CO") + ")"; })
        .join(", ");
      parts.push("Sobrecostos: " + extraList);
    }
    parts.push("Total pedido: $" + Number(total).toLocaleString("es-CO") + " COP");
    summaryForBot = parts.join(". ") + ".";
  }

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
        : summaryForBot || local.interpretation_es || (local.found ? matchName : "Sin match"),
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
            base_subtotal: unit * quantity,
            quantity,
            price_source: priceSource,
            variant_extras: variantExtras,
            surcharges: sizeSurcharges,
            summary_es: summaryForBot,
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
            surcharges: sizeSurcharges,
            summary_es: summaryForBot,
          }
        : {
            product_text: productText,
            quantity,
            match_confidence: local.match_confidence,
          },
      jev_shadow: jevShadow,
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
