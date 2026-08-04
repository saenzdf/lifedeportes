/**
 * compile_staff_order_draft — resuelve commercial.lines → resolved_lines con atributos.
 * Usa product_match_engine + catálogo; opcionalmente Odoo en vivo para variante exacta.
 */
import { matchProduct } from "./lib/product_match_engine.js";
import {
  buildOrderLifecycle,
  buildResolvedLine,
  evaluateStaffWriteReadiness,
  normalizeAttributes,
  splitProductDisplayName,
  stableFingerprint,
} from "./lib/staff_order_contract.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadCatalog() {
  try {
    const p = path.resolve(__dirname, "../catalog_cache.json");
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return { products: [] };
  }
}

function loadSemantic() {
  try {
    // Prefer embedded semantic from odoo_search if present as sibling JSON
    const p = path.resolve(__dirname, "../knowledge/life_catalog_semantic_v1.json");
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function buildCatalogForMatch() {
  const cache = loadCatalog();
  const semantic = loadSemantic();
  return {
    ...(semantic || {}),
    products: cache.products || semantic?.products || [],
    synced_at: cache.synced_at || semantic?.synced_at || null,
  };
}

async function resolveVariantLive(env, templateId, attributes = {}) {
  if (!env?.ODOO_URL || !templateId) return null;
  const rpc = async (service, method, args) => {
    const resp = await fetch(`${env.ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service, method, args },
      }),
    });
    const json = await resp.json();
    if (json?.error) throw new Error(json.error?.message || "Odoo RPC error");
    return json.result;
  };
  const uid = await rpc("common", "authenticate", [
    env.ODOO_DB,
    env.ODOO_USERNAME,
    env.ODOO_PASSWORD,
    {},
  ]);
  if (!uid) return null;
  const executeKw = (model, method, positionalArgs = [], kw = {}) =>
    rpc("object", "execute_kw", [
      env.ODOO_DB,
      uid,
      env.ODOO_PASSWORD,
      model,
      method,
      positionalArgs,
      kw,
    ]);

  const variants = await executeKw(
    "product.product",
    "search_read",
    [[["product_tmpl_id", "=", templateId], ["sale_ok", "=", true]]],
    {
      fields: [
        "id",
        "display_name",
        "list_price",
        "product_template_attribute_value_ids",
        "product_tmpl_id",
      ],
      limit: 80,
    }
  );
  if (!Array.isArray(variants) || !variants.length) return null;

  const want = normalizeAttributes(attributes);
  const wantTokens = Object.values(want)
    .filter(Boolean)
    .map((v) =>
      String(v)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    );

  let best = variants[0];
  let bestScore = -1;
  for (const v of variants) {
    const name = String(v.display_name || "").toLowerCase();
    let score = 0;
    for (const token of wantTokens) {
      if (token && name.includes(token.replace(/_/g, " "))) score += 10;
      if (token && name.includes(token)) score += 8;
    }
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }

  let ptavs = [];
  if (best.product_template_attribute_value_ids?.length) {
    ptavs = await executeKw(
      "product.template.attribute.value",
      "read",
      [best.product_template_attribute_value_ids],
      { fields: ["id", "name", "attribute_id"] }
    );
  }

  return {
    product_variant_id: best.id,
    product_tmpl_id: templateId,
    display_name: best.display_name,
    unit_cop: Number(best.list_price || 0) || null,
    ptavs: Array.isArray(ptavs) ? ptavs : [],
  };
}

function attributesFromMatch(match) {
  const parsed = match?.parsed || {};
  return normalizeAttributes({
    cuello: parsed.collar,
    collar: parsed.collar,
    tela: parsed.material,
    material: parsed.material,
    manga: parsed.sleeves,
    sleeves: parsed.sleeves,
    tipo_pantalon: parsed.shortType,
    forro: parsed.withLining,
    deporte: parsed.sport,
  });
}

export async function compileStaffOrderDraft(vars = {}, env = {}) {
  const orderDraft = vars.order_draft || {};
  const quote = vars.quote || {};
  const catalog = buildCatalogForMatch();

  let requested = Array.isArray(orderDraft.commercial?.lines)
    ? orderDraft.commercial.lines
    : [];
  if (!requested.length && quote.product_text) {
    requested = [
      {
        product_text: quote.product_text,
        quantity: quote.quantity || 1,
        category: /uniforme/i.test(quote.product_text) ? "uniforme" : null,
        variant_notes: [quote.variant, quote.material].filter(Boolean).join(", "),
      },
    ];
  }

  const resolved_lines = [];
  const questions = [];

  for (let i = 0; i < requested.length; i++) {
    const line = requested[i];
    const productText = String(line.product_text || line.name || "").trim();
    const quantity = Math.max(0, Number(line.quantity || 0));
    if (!productText || quantity < 1) continue;

    // Prefer already-resolved ids
    if (Number(line.product_variant_id || line.odoo_product_id || 0)) {
      const split = splitProductDisplayName(line.display_name || productText);
      resolved_lines.push(
        buildResolvedLine(
          {
            ...line,
            product_text: productText,
            product_base: split.product_base || productText,
            product_variant_id: line.product_variant_id || line.odoo_product_id,
            confidence: line.confidence || line.match_confidence || "high",
            attributes: {
              ...split.embedded_attrs,
              ...normalizeAttributes(line.attributes || {}),
            },
            comments: line.comments || line.variant_notes || "",
          },
          i
        )
      );
      continue;
    }

    const match = matchProduct(
      {
        product_text: [productText, line.variant_notes || ""].filter(Boolean).join(" "),
        quantity,
        garment_type: line.garment_type,
        sport: line.sport,
      },
      catalog
    );

    const attrs = {
      ...attributesFromMatch(match),
      ...normalizeAttributes(line.attributes || {}),
    };

    let live = null;
    if (match?.odoo_template_id && env.ODOO_URL) {
      try {
        live = await resolveVariantLive(env, match.odoo_template_id, attrs);
      } catch {
        live = null;
      }
    }

    const split = splitProductDisplayName(live?.display_name || match?.match_name || productText);
    if (match?.clarifying_question) questions.push(match.clarifying_question);

    resolved_lines.push(
      buildResolvedLine(
        {
          product_text: productText,
          product_base: split.product_base || match?.match_name || productText,
          product_tmpl_id: match?.odoo_template_id || live?.product_tmpl_id || null,
          product_variant_id: live?.product_variant_id || match?.odoo_template_id || null,
          quantity,
          unit_cop: live?.unit_cop || match?.unit_cop || null,
          confidence: match?.match_confidence || "none",
          category: line.category || match?.category || null,
          commercial_role: match?.commercial_role || line.commercial_role || null,
          attributes: attrs,
          comments: line.variant_notes || line.comments || "",
          alternatives: match?.alternatives || [],
          clarifying_question: match?.clarifying_question || null,
          display_name: live?.display_name || match?.match_name,
        },
        i
      )
    );
  }

  const fingerprint = stableFingerprint({
    resolved_lines,
    detail: orderDraft.detail,
    partner_key:
      quote.customer_wa_id ||
      quote.customer_display_name ||
      quote.order_or_team_name_for_billing ||
      "",
  });

  const nextDraft = {
    ...orderDraft,
    commercial: {
      ...(orderDraft.commercial || {}),
      requested_lines: requested,
      lines: requested,
      resolved_lines,
    },
    write: {
      ...(orderDraft.write || {}),
      fingerprint,
      compiled_at: new Date().toISOString(),
    },
  };

  const readiness = evaluateStaffWriteReadiness({
    ...vars,
    order_draft: nextDraft,
  });
  const lifecycle = buildOrderLifecycle(
    { ...vars, order_draft: nextDraft },
    resolved_lines,
    readiness.cross_check
  );

  return {
    order_draft: {
      ...nextDraft,
      lifecycle,
      write: {
        ...nextDraft.write,
        status: readiness.status,
        code: readiness.code,
      },
      spreadsheet: {
        ...(orderDraft.spreadsheet || {}),
        cross_check: readiness.cross_check,
        status: readiness.cross_check?.status || "empty",
      },
    },
    clarifying_question: questions[0] || null,
    readiness,
  };
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role !== "staff") {
    return new Response(JSON.stringify({ ok: false, error: "staff_only" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const compiled = await compileStaffOrderDraft(vars, env || {});
  const presupuestoIntent = /\b(HAZ|HAS|HACE|CREA|CREAR)(?:\s+\w+){0,3}\s+PRESUPUESTO\b/i.test(
    [
      vars.staff_lane_reply,
      vars?.staff?.lane_reply,
      vars?.staff?.last_user_text,
      vars?.last_user_input,
      vars?.intent?.raw_text,
    ]
      .map((t) => String(t || ""))
      .join("\n")
  );
  const writeMode =
    presupuestoIntent || String(vars?.staff?.write_mode || "").toLowerCase() === "sale_order"
      ? "sale_order"
      : String(vars?.staff?.write_mode || "").toLowerCase() === "opportunity_only"
        ? "opportunity_only"
        : vars?.user?.role === "staff"
          ? "opportunity_only"
          : "sale_order";

  return new Response(
    JSON.stringify({
      ok: true,
      status: compiled.readiness.status,
      clarifying_question: compiled.clarifying_question,
      resolved_count: compiled.order_draft.commercial.resolved_lines.length,
      vars: {
        order_draft: {
          ...compiled.order_draft,
          write: {
            ...(compiled.order_draft.write || {}),
            mode: writeMode,
          },
        },
        staff: {
          ...(vars.staff || {}),
          write_mode: writeMode,
          write_status:
            compiled.readiness.status === "ready"
              ? "ok"
              : compiled.readiness.status === "needs_staff_confirmation"
                ? "needs_confirmation"
                : "blocked",
          write_code: compiled.readiness.code,
          write_blocked_reason: compiled.readiness.message,
        },
        service: {
          last_call_name: "compile_staff_order_draft",
          last_call_status: "ready",
          last_call_at: now,
          fallback_message: compiled.readiness.message,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

export { handler };
