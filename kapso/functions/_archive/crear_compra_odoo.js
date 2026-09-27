// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: crear-compra-odoo  id: b07a0ccf-e310-4e6b-8fae-7fe30865c2ba
// ultimo deploy: 2026-08-04T17:25:08-04:00  status: deployed
// motivo: tool del agente staff, sin uso (0 invocaciones)
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

/**
 * Tool agente staff: crea purchase.order borrador en Odoo.
 * Nunca confirma PO, recibe inventario ni crea factura.
 *
 * Schema: purchase_draft_v1 (vars.purchase)
 */
function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const input = body?.input || body?.data || {};
  const now = new Date().toISOString();

  if (vars?.user?.role !== "staff") {
    return json({
      ok: false,
      error: "staff_only",
      vars: serviceVars("blocked", now, "Solo staff autorizado puede subir compras."),
    });
  }

  const ODOO_URL = env.ODOO_URL;
  const ODOO_DB = env.ODOO_DB;
  const ODOO_USERNAME = env.ODOO_USERNAME;
  const ODOO_PASSWORD = env.ODOO_PASSWORD;
  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
    return json({
      ok: false,
      error: "missing_odoo_secrets",
      vars: serviceVars("error", now, "Faltan credenciales Odoo en la function."),
    });
  }

  const confirmFlag =
    input.confirmed === true ||
    input.confirmed === "true" ||
    String(input.confirm_text || "").toUpperCase().includes("CONFIRMO") ||
    Boolean(vars?.purchase?.confirmed);

  if (!confirmFlag) {
    return json({
      ok: false,
      error: "needs_confirmation",
      vars: {
        purchase: {
          ...(vars.purchase || {}),
          status: "pending_confirmation",
          confirmed: false,
        },
        staff: {
          ...(vars.staff || {}),
          registration_type: "compra",
          write_status: "blocked",
          write_blocked_reason: "Escriba CONFIRMO COMPRA para crear el PO borrador.",
          lane: "staff_compra",
        },
        ...serviceVars("blocked", now, "Escriba CONFIRMO COMPRA para crear el PO borrador."),
      },
    });
  }

  const draft = buildPurchaseDraft(vars, input);
  if (!draft.partner_name && !draft.partner_id) {
    return json({
      ok: false,
      error: "missing_supplier",
      vars: serviceVars("blocked", now, "Falta proveedor (partner_name o partner_id)."),
    });
  }
  if (!draft.lines.length) {
    return json({
      ok: false,
      error: "missing_lines",
      vars: serviceVars("blocked", now, "Falta al menos una línea (product_text + quantity)."),
    });
  }

  const idempotencyKey =
    draft.idempotency_key ||
    `PO-${digitsOnly(draft.partner_name || draft.partner_id)}-${draft.lines
      .map((l) => `${l.product_text}:${l.quantity}`)
      .join("|")
      .slice(0, 80)}`;

  try {
    const rpc = makeRpc(ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD);
    const uid = await rpc.authenticate();
    const executeKw = (model, method, args, kwargs = {}) =>
      rpc.executeKw(uid, model, method, args, kwargs);

    let partnerId = draft.partner_id ? Number(draft.partner_id) : null;
    if (!partnerId) {
      const found = await executeKw(
        "res.partner",
        "search_read",
        [[["supplier_rank", ">", 0], ["name", "ilike", draft.partner_name]]],
        { fields: ["id", "name"], limit: 5 }
      );
      if (found?.length === 1) {
        partnerId = found[0].id;
      } else if (found?.length > 1) {
        partnerId = found[0].id;
      } else {
        partnerId = await executeKw("res.partner", "create", [
          {
            name: draft.partner_name,
            supplier_rank: 1,
            company_type: "company",
          },
        ]);
      }
    }

    const orderLines = [];
    const unresolved = [];
    for (const line of draft.lines) {
      let productId = line.product_id ? Number(line.product_id) : null;
      if (!productId && line.product_text) {
        const hits = await executeKw(
          "product.product",
          "search_read",
          [[["purchase_ok", "=", true], ["name", "ilike", line.product_text]]],
          { fields: ["id", "name", "uom_id"], limit: 5 }
        );
        if (hits?.length) productId = hits[0].id;
      }
      if (!productId) {
        unresolved.push(line.product_text || "(sin nombre)");
        continue;
      }
      const qty = Math.max(0.01, Number(line.quantity) || 1);
      const price = line.price_unit != null ? Number(line.price_unit) : undefined;
      const vals = {
        product_id: productId,
        name: line.product_text || false,
        product_qty: qty,
      };
      if (Number.isFinite(price)) vals.price_unit = price;
      orderLines.push([0, 0, vals]);
    }

    if (!orderLines.length) {
      return json({
        ok: false,
        error: "no_resolved_products",
        unresolved,
        vars: serviceVars(
          "blocked",
          now,
          `No pude resolver productos: ${unresolved.join(", ")}`
        ),
      });
    }

    const existing = await executeKw(
      "purchase.order",
      "search_read",
      [[["origin", "=", idempotencyKey], ["state", "=", "draft"]]],
      { fields: ["id", "name"], limit: 1 }
    );
    let poId;
    let poName;
    if (existing?.length) {
      poId = existing[0].id;
      poName = existing[0].name;
    } else {
      poId = await executeKw("purchase.order", "create", [
        {
          partner_id: partnerId,
          origin: idempotencyKey,
          notes: draft.notes || `Kapso staff compra ${now}`,
          order_line: orderLines,
        },
      ]);
      const read = await executeKw("purchase.order", "read", [[poId]], {
        fields: ["name"],
      });
      poName = read?.[0]?.name || `PO/${poId}`;
    }

    const base = String(ODOO_URL).replace(/\/$/, "");
    const poUrl = `${base}/odoo/purchase/${poId}`;

    return json({
      ok: true,
      status: "ready",
      message: `Compra borrador ${poName}`,
      purchase_order_id: poId,
      purchase_order_name: poName,
      purchase_order_url: poUrl,
      unresolved,
      vars: {
        purchase: {
          schema: "purchase_draft_v1",
          status: "draft_created",
          confirmed: true,
          partner_id: partnerId,
          partner_name: draft.partner_name,
          lines: draft.lines,
          notes: draft.notes || null,
          idempotency_key: idempotencyKey,
          odoo: {
            purchase_order_id: poId,
            purchase_order_name: poName,
            url: poUrl,
          },
          created_at: now,
        },
        staff: {
          ...(vars.staff || {}),
          registration_type: "compra",
          write_status: "done",
          write_blocked_reason: null,
          lane: "staff_compra",
        },
        ...serviceVars("ready", now, null),
      },
    });
  } catch (err) {
    const msg = String(err?.message || err);
    return json({
      ok: false,
      error: "odoo_write_failed",
      detail: msg.slice(0, 400),
      vars: serviceVars("error", now, `Error Odoo: ${msg.slice(0, 200)}`),
    });
  }
}

function buildPurchaseDraft(vars, input) {
  const fromVars = vars?.purchase || {};
  const linesRaw = input.lines || fromVars.lines || [];
  const lines = (Array.isArray(linesRaw) ? linesRaw : [])
    .map((l) => ({
      product_text: String(l.product_text || l.name || "").trim(),
      product_id: l.product_id || null,
      quantity: Number(l.quantity) || 1,
      price_unit: l.price_unit != null ? Number(l.price_unit) : null,
    }))
    .filter((l) => l.product_text || l.product_id);

  return {
    partner_name: String(input.partner_name || fromVars.partner_name || "").trim() || null,
    partner_id: input.partner_id || fromVars.partner_id || null,
    notes: String(input.notes || fromVars.notes || "").trim() || null,
    lines,
    idempotency_key: input.idempotency_key || fromVars.idempotency_key || null,
  };
}

function serviceVars(status, now, fallback) {
  return {
    service: {
      last_call_name: "crear_compra_odoo",
      last_call_status: status,
      last_call_at: now,
      fallback_message: fallback,
    },
  };
}

function makeRpc(url, db, username, password) {
  const base = String(url).replace(/\/$/, "");
  async function call(service, method, args) {
    const resp = await fetch(`${base}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service, method, args },
        id: Date.now(),
      }),
    });
    const data = await resp.json();
    if (data.error) {
      throw new Error(JSON.stringify(data.error).slice(0, 500));
    }
    return data.result;
  }
  return {
    authenticate: () => call("common", "authenticate", [db, username, password, {}]),
    executeKw: (uid, model, method, args, kwargs = {}) =>
      call("object", "execute_kw", [db, uid, password, model, method, args, kwargs]),
  };
}

function json(payload) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });
}
