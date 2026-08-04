/**
 * crear-presupuesto-odoo — staff pide presupuesto desde WhatsApp.
 *
 * Ejemplos:
 *   «HAZ PRESUPUESTO de Emmanuelle»
 *   «crear presupuesto Daniel Tovar»
 *   «pasar a presupuesto opp 3607»
 *
 * Flujo (paridad Daniel Tovar / Proposition):
 * 1) Resuelve crm.lead (nombre / id / vars.lead)
 * 2) Crea o reusa sale.order draft ligado (Plantilla venta + Diseño $0)
 * 3) Copia adjuntos CRM → SO
 * 4) Si hay order_draft.commercial.resolved_lines → escribe líneas producto
 * 5) Note: lista HTML del draft o brief CRM
 * 6) Mueve opp a Proposition (3) si aún está en Asistente Kapso / Canal Ventas
 * 7) Invoca webhook on-odoo-presupuesto para organizar lista Excel/Word/PDF en note
 *
 * Secrets: ODOO_*, LIFE_DESIGN_PRODUCT_ID (default 504),
 *   LIFE_PRESUPUESTO_WEBHOOK_URL, LIFE_ODOO_WEBHOOK_SECRET (opcional)
 */

const STAGE_PROPOSITION = 3;
const STAGE_ASISTENTE = 6;
const STAGE_CANAL_VENTAS = 1;
const TEMPLATE_NAME = "Plantilla venta";
const DEFAULT_DESIGN_ID = 504;

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function stripOppPrefix(name) {
  return compact(name).replace(/^oportunidad\s+de\s+/i, "").trim();
}

function normalizeTeamKey(name) {
  return stripOppPrefix(name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function odooJsonRpc(env, service, method, args) {
  const url = String(env.ODOO_URL || "").replace(/\/$/, "");
  const resp = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
    }),
  });
  const jsonBody = await resp.json();
  if (jsonBody?.error) {
    throw new Error(
      String(jsonBody.error?.data?.message || jsonBody.error?.message || "odoo_error").slice(
        0,
        400
      )
    );
  }
  return jsonBody.result;
}

function extractTarget(body) {
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const msgs = body?.whatsapp_context?.messages || [];
  const texts = [];
  for (const m of [...msgs].reverse().slice(0, 10)) {
    const t =
      (typeof m?.text === "string" && m.text) ||
      m?.text?.body ||
      m?.kapso?.content ||
      "";
    if (t) texts.push(String(t));
  }
  const blob = [
    input.query,
    input.name,
    input.customer_name,
    vars?.staff?.last_inbound_text,
    vars?.staff_lane_reply,
    ...texts,
  ]
    .filter(Boolean)
    .join("\n");

  const idMatch = blob.match(
    /\b(?:opp|oportunidad|lead|crm)\s*#?\s*(\d{3,5})\b/i
  );
  const nameMatch = blob.match(
    /(?:(?:haz|has|hace|crear?|crea|subir|pasa(?:r)?|pasar)\s+(?:el\s+)?presupuesto(?:\s+(?:de|del|para))?|(?:presupuesto|propuesta)\s+(?:de|del|para)|retomar|completar)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s.&_-]{1,48})/i
  );

  return {
    lead_id:
      Number(
        input.lead_id ||
          input.opportunity_id ||
          vars?.lead?.id ||
          vars?.crm?.opportunity_id ||
          (idMatch && idMatch[1]) ||
          0
      ) || null,
    name: compact(
      input.name || input.customer_name || (nameMatch && nameMatch[1]) || ""
    ),
    phone: compact(input.phone || input.customer_phone || ""),
    query: compact(input.query || ""),
    force_proposition: input.move_to_proposition !== false,
  };
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function briefFromLead(description) {
  const plain = stripHtml(description)
    .replace(/LIFE_DOSSIER_v1[\s\S]*$/i, "")
    .replace(/kapso:conv=\S+/gi, "")
    .trim();
  return plain.slice(0, 4000);
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role && vars.user.role !== "staff") {
    return json({ ok: false, error: "staff_only" }, 403);
  }
  if (!env.ODOO_URL || !env.ODOO_DB || !env.ODOO_USERNAME || !env.ODOO_PASSWORD) {
    return json({ ok: false, error: "missing_odoo_secrets", message: "Faltan credenciales Odoo", vars: { staff: { ...(vars.staff || {}), write_status: "blocked", write_blocked_reason: "Faltan credenciales de Odoo en la configuración." } } }, 200);
  }

  const target = extractTarget(body);
  const designProductId =
    Number(env.LIFE_DESIGN_PRODUCT_ID || vars?.quote?.design_product_id || 0) ||
    DEFAULT_DESIGN_ID;

  try {
    const uid = await odooJsonRpc(env, "common", "authenticate", [
      env.ODOO_DB,
      env.ODOO_USERNAME,
      env.ODOO_PASSWORD,
      {},
    ]);
    if (!uid) return json({ ok: false, error: "odoo_auth_failed", message: "Fallo de autenticación Odoo", vars: { staff: { ...(vars.staff || {}), write_status: "blocked", write_blocked_reason: "Error de autenticación con Odoo." } } }, 200);

    const executeKw = (model, method, positionalArgs = [], kw = {}) =>
      odooJsonRpc(env, "object", "execute_kw", [
        env.ODOO_DB,
        uid,
        env.ODOO_PASSWORD,
        model,
        method,
        positionalArgs,
        kw,
      ]);

    const leadFields = [
      "id",
      "name",
      "phone",
      "partner_id",
      "stage_id",
      "expected_revenue",
      "description",
      "order_ids",
      "won_status",
    ];

    let hits = [];
    if (target.lead_id) {
      hits =
        (await executeKw(
          "crm.lead",
          "search_read",
          [[["id", "=", target.lead_id], ["type", "=", "opportunity"]]],
          { fields: leadFields, limit: 1, context: { active_test: false } }
        )) || [];
    }

    if (!hits.length && (target.name || target.phone || target.query)) {
      const needle = stripOppPrefix(target.name || target.query);
      const local10 = digitsOnly(target.phone).slice(-10);
      const domain = [
        ["type", "=", "opportunity"],
        ["active", "=", true],
        ["won_status", "=", "pending"],
      ];
      const or = [];
      if (needle) {
        or.push(["name", "ilike", needle]);
        or.push(["name", "ilike", `Oportunidad de ${needle}`]);
        or.push(["partner_id.name", "ilike", needle]);
      }
      if (local10) or.push(["phone", "ilike", local10]);
      if (or.length === 1) domain.push(or[0]);
      else if (or.length > 1) domain.push(...Array(or.length - 1).fill("|"), ...or);
      hits =
        (await executeKw("crm.lead", "search_read", [domain], {
          fields: leadFields,
          limit: 8,
          order: "write_date desc",
        })) || [];
      if (needle && hits.length > 1) {
        const key = normalizeTeamKey(needle);
        const exact = hits.filter((h) => normalizeTeamKey(h.name) === key);
        if (exact.length) hits = exact;
      }
    }

    if (!hits.length) {
      return json({
        ok: false,
        status: "not_found",
        message:
          "No encontré oportunidad abierta. Indique nombre (ej. Emmanuelle), opp id o cree la CRM primero.",
        target,
      });
    }

    const lead = hits[0];
    const leadId = lead.id;
    const teamName = stripOppPrefix(lead.name) || lead.name;
    const stageId = Array.isArray(lead.stage_id) ? lead.stage_id[0] : lead.stage_id;
    let partnerId = Array.isArray(lead.partner_id) ? lead.partner_id[0] : lead.partner_id;

    if (!partnerId) {
      const phone = compact(lead.phone);
      partnerId = await executeKw("res.partner", "create", [
        {
          name: teamName,
          phone: phone || false,
          type: "contact",
        },
      ]);
      await executeKw("crm.lead", "write", [[leadId], { partner_id: partnerId }]);
    }

    // Existing SO on this opportunity
    let orders =
      (await executeKw(
        "sale.order",
        "search_read",
        [[["opportunity_id", "=", leadId]]],
        {
          fields: ["id", "name", "state", "amount_total", "note", "partner_id"],
          limit: 5,
          order: "id desc",
        }
      )) || [];

    const confirmed = orders.find((o) => ["sale", "done"].includes(o.state));
    if (confirmed) {
      const odooUrl = String(env.ODOO_URL || "").replace(/\/$/, "");
      return json({
        ok: true,
        status: "already_confirmed",
        message: `Ya hay pedido confirmado ${confirmed.name}. Use corregir/retomar, no crear otro presupuesto.`,
        vars: {
          lead: { id: leadId, name: lead.name },
          crm: { opportunity_id: leadId, opportunity_name: lead.name },
          order: {
            id: confirmed.id,
            name: confirmed.name,
            state: confirmed.state,
            url: `${odooUrl}/odoo/sales/${confirmed.id}`,
          },
        },
      });
    }

    let order = orders.find((o) => ["draft", "sent"].includes(o.state)) || null;
    let created = false;

    const templates =
      (await executeKw(
        "sale.order.template",
        "search_read",
        [[["name", "ilike", TEMPLATE_NAME]]],
        { fields: ["id", "name"], limit: 1 }
      )) || [];
    const templateId = templates[0]?.id || 1;

    if (!order) {
      const vals = {
        partner_id: partnerId,
        opportunity_id: leadId,
        sale_order_template_id: templateId,
        note: briefFromLead(lead.description) || "",
      };
      // Studio field (prod)
      try {
        vals.x_studio_nombre_del_pedido = teamName;
      } catch (_) {
        /* optional */
      }
      const orderId = await executeKw("sale.order", "create", [vals]);
      // Apply template lines if method exists
      try {
        await executeKw("sale.order", "action_update_prices", [[orderId]]);
      } catch (_) {
        /* ignore */
      }
      try {
        // Some DBs expand template via write of template id already
        await executeKw("sale.order", "write", [
          [orderId],
          { sale_order_template_id: templateId },
        ]);
      } catch (_) {
        /* ignore */
      }
      created = true;
      const rows =
        (await executeKw(
          "sale.order",
          "search_read",
          [[["id", "=", orderId]]],
          {
            fields: ["id", "name", "state", "amount_total", "note", "partner_id"],
            limit: 1,
          }
        )) || [];
      order = rows[0];
      // Ensure studio name
      try {
        await executeKw("sale.order", "write", [
          [orderId],
          { x_studio_nombre_del_pedido: teamName },
        ]);
      } catch (_) {
        /* field may differ */
      }
    }

    const orderId = order.id;

    // Diseño $0 si falta
    const lines =
      (await executeKw(
        "sale.order.line",
        "search_read",
        [[["order_id", "=", orderId]]],
        { fields: ["id", "product_id", "product_uom_qty", "price_unit", "name"], limit: 80 }
      )) || [];
    const hasDesign = lines.some(
      (l) => Number(l.product_id?.[0] || l.product_id || 0) === designProductId
    );
    if (!hasDesign && designProductId) {
      await executeKw("sale.order.line", "create", [
        {
          order_id: orderId,
          product_id: designProductId,
          product_uom_qty: 1,
          price_unit: 0,
          name: "Diseño",
        },
      ]);
    }

    // Líneas comerciales desde order_draft (Kapso)
    const resolved =
      vars?.order_draft?.commercial?.resolved_lines ||
      vars?.order_draft?.resolved_lines ||
      body?.input?.lines ||
      [];
    const productLinesAdded = [];
    for (const row of Array.isArray(resolved) ? resolved : []) {
      const productId = Number(
        row.product_variant_id || row.product_id || row.product_tmpl_id || 0
      );
      const qty = Number(row.quantity || row.product_uom_qty || 0);
      if (!productId || !(qty > 0) || productId === designProductId) continue;
      const already = lines.some(
        (l) => Number(l.product_id?.[0] || l.product_id || 0) === productId
      );
      if (already) continue;
      const lineId = await executeKw("sale.order.line", "create", [
        {
          order_id: orderId,
          product_id: productId,
          product_uom_qty: qty,
          price_unit:
            row.price_unit != null
              ? Number(row.price_unit)
              : row.unit_cop != null
                ? Number(row.unit_cop)
                : undefined,
          name: compact(row.product_text || row.name || "") || undefined,
        },
      ]);
      productLinesAdded.push({ id: lineId, product_id: productId, qty });
    }

    // Fallback: una línea desde quote si no hay resolved y hay qty+estimación
    if (!productLinesAdded.length && !lines.some((l) => {
      const pid = Number(l.product_id?.[0] || l.product_id || 0);
      return pid && pid !== designProductId;
    })) {
      const qty = Number(vars?.quote?.quantity || 0);
      const unit = Number(vars?.quote?.unit_cop || 0);
      const productText = compact(vars?.quote?.product_text || "");
      if (qty >= 6 && productText) {
        const products =
          (await executeKw(
            "product.product",
            "search_read",
            [[["sale_ok", "=", true], ["name", "ilike", productText.split(/\s+/)[0]]]],
            { fields: ["id", "name", "list_price"], limit: 5 }
          )) || [];
        // Prefer uniforme baloncesto/fútbol known patterns
        let pick = products[0];
        if (/baloncesto/i.test(productText)) {
          pick =
            products.find((p) => /baloncesto/i.test(p.name)) ||
            (
              await executeKw(
                "product.product",
                "search_read",
                [[["name", "ilike", "Uniforme de baloncesto"], ["sale_ok", "=", true]]],
                { fields: ["id", "name", "list_price"], limit: 1 }
              )
            )?.[0];
        } else if (/f[uú]tbol|uniforme/i.test(productText)) {
          pick =
            products.find((p) => /uniforme/i.test(p.name) && /f[uú]tbol|dry/i.test(p.name)) ||
            pick;
        }
        if (pick?.id) {
          const lineId = await executeKw("sale.order.line", "create", [
            {
              order_id: orderId,
              product_id: pick.id,
              product_uom_qty: qty,
              price_unit: unit || pick.list_price || 0,
            },
          ]);
          productLinesAdded.push({
            id: lineId,
            product_id: pick.id,
            qty,
            from: "quote_fallback",
          });
        }
      }
    }

    // Note: prefer lista HTML del draft
    const draftNote =
      compact(vars?.order_draft?.note_html) ||
      compact(vars?.order_draft?.note) ||
      compact(vars?.order?.note);
    if (draftNote && draftNote.length > 40) {
      await executeKw("sale.order", "write", [[orderId], { note: draftNote }]);
    } else if (!compact(order.note) && lead.description) {
      await executeKw("sale.order", "write", [
        [orderId],
        { note: briefFromLead(lead.description) },
      ]);
    }

    // Copiar adjuntos CRM → SO (sin borrar CRM)
    const leadAtts =
      (await executeKw(
        "ir.attachment",
        "search_read",
        [[["res_model", "=", "crm.lead"], ["res_id", "=", leadId]]],
        { fields: ["id", "name", "datas", "mimetype", "type", "url"], limit: 40 }
      )) || [];
    const soAttNames = new Set(
      (
        (await executeKw(
          "ir.attachment",
          "search_read",
          [[["res_model", "=", "sale.order"], ["res_id", "=", orderId]]],
          { fields: ["name"], limit: 80 }
        )) || []
      ).map((a) => a.name)
    );
    let copiedAtts = 0;
    for (const att of leadAtts) {
      if (!att.name || soAttNames.has(att.name)) continue;
      await executeKw(
        "ir.attachment",
        "copy",
        [att.id],
        { default: { res_model: "sale.order", res_id: orderId } }
      );
      soAttNames.add(att.name);
      copiedAtts += 1;
    }

    // Staging Kapso attachments (URLs) — best effort create binary skipped; chatter note
    const staging = vars?.order_draft?.attachments || [];
    if (Array.isArray(staging) && staging.length && !copiedAtts) {
      try {
        await executeKw("sale.order", "message_post", [[orderId]], {
          body: `<p>Adjuntos en Kapso (staging): ${staging
            .map((a) => compact(a.filename || a.name || a.url))
            .filter(Boolean)
            .slice(0, 8)
            .join(", ")}</p>`,
          message_type: "comment",
        });
      } catch (_) {
        /* optional */
      }
    }

    // Mover a Proposition para pipeline (automation 26 puede reusar SO)
    let stageMoved = false;
    if (
      target.force_proposition &&
      [STAGE_ASISTENTE, STAGE_CANAL_VENTAS].includes(Number(stageId))
    ) {
      await executeKw("crm.lead", "write", [[leadId], { stage_id: STAGE_PROPOSITION }]);
      stageMoved = true;
    }

    // Webhook organizar lista
    let webhook = { skipped: true };
    const webhookUrl = compact(
      env.LIFE_PRESUPUESTO_WEBHOOK_URL || env.LIFE_KAPSO_PRESUPUESTO_WEBHOOK_URL || ""
    );
    const webhookSecret = compact(
      env.LIFE_ODOO_WEBHOOK_SECRET || env.LIFE_PRESUPUESTO_WEBHOOK_SECRET || ""
    );
    if (webhookUrl) {
      try {
        const wr = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(webhookSecret ? { "X-Life-Webhook-Secret": webhookSecret } : {}),
          },
          body: JSON.stringify({
            lead_id: leadId,
            order_id: orderId,
            order_name: order.name,
            event: "life.crm.proposition",
            source: "crear_presupuesto_odoo",
          }),
        });
        const wj = await wr.json().catch(() => ({}));
        webhook = { ok: wr.ok, status: wr.status, result: wj };
      } catch (err) {
        webhook = { ok: false, error: String(err?.message || err).slice(0, 200) };
      }
    }

    const refreshed =
      (
        await executeKw(
          "sale.order",
          "search_read",
          [[["id", "=", orderId]]],
          {
            fields: ["id", "name", "state", "amount_total", "note", "partner_id"],
            limit: 1,
          }
        )
      )?.[0] || order;

    const odooUrl = String(env.ODOO_URL || "").replace(/\/$/, "");
    const needsLista =
      productLinesAdded.length === 0 &&
      !(refreshed.note && /<table|nombre|talla/i.test(String(refreshed.note)));

    return json({
      ok: true,
      status: created ? "created" : "updated",
      message: needsLista
        ? `Presupuesto ${refreshed.name} listo (borrador). Falta lista tipificada o líneas: envíe Excel/PDF FORMATO LIFE o confirme productos.`
        : `Presupuesto ${refreshed.name} creado/actualizado en borrador.`,
      vars: {
        lead: { id: leadId, name: lead.name, url: `${odooUrl}/odoo/crm/${leadId}` },
        crm: {
          opportunity_id: leadId,
          opportunity_name: lead.name,
          stage_moved_to_proposition: stageMoved,
        },
        order: {
          id: refreshed.id,
          name: refreshed.name,
          state: refreshed.state,
          amount_total: refreshed.amount_total,
          url: `${odooUrl}/odoo/sales/${refreshed.id}`,
        },
        order_session: {
          order_id: refreshed.id,
          order_name: refreshed.name,
          customer_display_name: teamName,
          at: now,
        },
        quote: {
          ...(vars.quote || {}),
          customer_display_name: teamName,
          status: "presupuesto_draft",
        },
        staff: {
          ...(vars.staff || {}),
          write_mode: "sale_order",
          last_presupuesto_at: now,
          product_lines_added: productLinesAdded.length,
          attachments_copied: copiedAtts,
        },
        service: {
          last_call_name: "crear_presupuesto_odoo",
          last_call_status: "ready",
          last_call_at: now,
        },
      },
      meta: {
        product_lines_added: productLinesAdded,
        attachments_copied: copiedAtts,
        webhook,
        needs_lista: needsLista,
        team_name: teamName,
      },
    });
  } catch (err) {
    const errMsg = String(err?.message || err).slice(0, 400);
    return json(
      {
        ok: false,
        error: errMsg,
        message: ,
        vars: {
          staff: {
            ...(vars.staff || {}),
            write_status: blocked,
            write_blocked_reason: ,
          },
          service: {
            last_call_name: crear_presupuesto_odoo,
            last_call_status: error,
            last_call_at: now,
          },
        },
        target,
      },
      200
    );
  }
}

{ handler };
