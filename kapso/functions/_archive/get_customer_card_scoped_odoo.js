async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const input = body?.input || {};
  const now = new Date().toISOString();
  const partnerId = Number(vars?.user?.partner_id || 0);

  if (!partnerId) {
    return deny("Sin identidad de cliente verificada.", now);
  }

  const ODOO_URL = env.ODOO_URL;
  const ODOO_DB = env.ODOO_DB;
  const ODOO_USERNAME = env.ODOO_USERNAME;
  const ODOO_PASSWORD = env.ODOO_PASSWORD;
  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
    return deny("Consulta no disponible en este momento.", now, 503);
  }

  const orderId = Number(input.order_id || vars?.order?.id || 0);
  const orderName = String(input.order_name || vars?.order?.name || "").trim();
  const taskId = Number(input.task_id || 0);
  const listMode = !orderId && !orderName && !taskId;

  try {
    const { uid, executeKw } = await odooClient(env);

    if (listMode) {
      const tasks = await findPartnerTasks(executeKw, uid, partnerId, 10);
      const active = (tasks || []).filter((t) => !isDoneStage(stageLabel(t)));
      const cards = active.map(mapCard);

      return ok({
        project_cards: cards,
        project: {
          active_card_count: cards.length,
          latest_card_name: cards[0]?.name || null,
          latest_stage: cards[0]?.stage || null,
        },
        service: serviceMeta("consultar_tarjeta_pedido", "ready", now, partnerId),
      });
    }

    const task = await resolveTask(executeKw, uid, { orderId, orderName, taskId, partnerId });
    if (!task) {
      return deny(
        "No encontramos una tarjeta de producción para ese pedido. Si acaba de cotizar, puede que aún no esté en taller.",
        now,
        404
      );
    }

    const scoped = await assertTaskBelongsToPartner(executeKw, uid, task, partnerId);
    if (!scoped.ok) return deny(scoped.message, now);

    const saleOrderId = saleOrderIdFromTask(task);
    let order = null;
    if (saleOrderId) {
      const rows = await executeKw(uid, "sale.order", "read", [[saleOrderId]], {
        fields: [
          "id",
          "name",
          "state",
          "amount_total",
          "amount_untaxed",
          "date_order",
          "invoice_status",
          "partner_id",
        ],
      });
      order = Array.isArray(rows) ? rows[0] : null;
      if (order) {
        const rowPartnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : order.partner_id;
        if (Number(rowPartnerId) !== partnerId) {
          return deny("Ese pedido no pertenece a su cuenta.", now);
        }
      }
    }

    const timeline = await buildTimeline(executeKw, uid, task, order);

    return ok({
      project_card: mapCard(task),
      order: order
        ? {
            id: order.id,
            name: order.name,
            status: order.state,
            amount_total: Number(order.amount_total || 0),
            amount_untaxed: Number(order.amount_untaxed || 0),
            date_order: order.date_order || null,
            invoice_status: order.invoice_status || null,
          }
        : null,
      order_timeline: timeline,
      service: serviceMeta("consultar_tarjeta_pedido", "ready", now, partnerId),
    });
  } catch (error) {
    return deny(`No pude consultar la tarjeta: ${String(error?.message || error)}`, now, 502);
  }
}

function isDoneStage(stage) {
  const s = String(stage || "").toLowerCase();
  return /hecho|done|entregad|finalizad|cancel/.test(s);
}

function stageLabel(task) {
  return Array.isArray(task?.stage_id) ? task.stage_id[1] : null;
}

function saleOrderIdFromTask(task) {
  return Array.isArray(task?.sale_order_id) ? task.sale_order_id[0] : task.sale_order_id || null;
}

function mapCard(task) {
  return {
    id: task.id,
    name: task.name,
    stage: stageLabel(task),
    project: Array.isArray(task.project_id) ? task.project_id[1] : null,
    sale_order_id: saleOrderIdFromTask(task),
    sale_order_name: Array.isArray(task.sale_order_id) ? task.sale_order_id[1] : null,
    updated_at: task.write_date || null,
  };
}

async function findPartnerTasks(executeKw, uid, partnerId, limit) {
  try {
    return await executeKw(uid, "project.task", "search_read", [[["partner_id", "=", partnerId]]], {
      fields: ["id", "name", "stage_id", "project_id", "sale_order_id", "write_date", "partner_id"],
      limit,
      order: "write_date desc",
    });
  } catch (_e) {
    const orders = await executeKw(
      uid,
      "sale.order",
      "search_read",
      [[["partner_id", "=", partnerId], ["state", "in", ["sale", "done"]]]],
      { fields: ["id"], limit: 10 }
    );
    const orderIds = (orders || []).map((o) => o.id);
    if (!orderIds.length) return [];
    return executeKw(uid, "project.task", "search_read", [[["sale_order_id", "in", orderIds]]], {
      fields: ["id", "name", "stage_id", "project_id", "sale_order_id", "write_date", "partner_id"],
      limit,
      order: "write_date desc",
    });
  }
}

async function resolveTask(executeKw, uid, { orderId, orderName, taskId, partnerId }) {
  if (taskId) {
    const rows = await executeKw(uid, "project.task", "read", [[taskId]], {
      fields: ["id", "name", "stage_id", "project_id", "sale_order_id", "write_date", "partner_id"],
    });
    return Array.isArray(rows) ? rows[0] : null;
  }

  let targetOrderId = orderId;
  if (!targetOrderId && orderName) {
    const found = await executeKw(uid, "sale.order", "search_read", [[["name", "=", orderName]]], {
      fields: ["id", "partner_id"],
      limit: 1,
    });
    const row = Array.isArray(found) ? found[0] : null;
    if (!row) return null;
    const pid = Array.isArray(row.partner_id) ? row.partner_id[0] : row.partner_id;
    if (Number(pid) !== partnerId) throw new Error("FORBIDDEN_ORDER");
    targetOrderId = row.id;
  }

  if (!targetOrderId) return null;

  const tasks = await executeKw(uid, "project.task", "search_read", [[["sale_order_id", "=", targetOrderId]]], {
    fields: ["id", "name", "stage_id", "project_id", "sale_order_id", "write_date", "partner_id"],
    limit: 1,
    order: "id desc",
  });
  return Array.isArray(tasks) && tasks[0] ? tasks[0] : null;
}

async function assertTaskBelongsToPartner(executeKw, uid, task, partnerId) {
  const taskPartner = Array.isArray(task.partner_id) ? task.partner_id[0] : task.partner_id;
  if (taskPartner && Number(taskPartner) === partnerId) return { ok: true };

  const saleOrderId = saleOrderIdFromTask(task);
  if (!saleOrderId) return { ok: false, message: "No pude verificar la titularidad de esa tarjeta." };

  const rows = await executeKw(uid, "sale.order", "read", [[saleOrderId]], { fields: ["partner_id"] });
  const row = Array.isArray(rows) ? rows[0] : null;
  const pid = Array.isArray(row?.partner_id) ? row.partner_id[0] : row?.partner_id;
  if (Number(pid) !== partnerId) return { ok: false, message: "Ese pedido no pertenece a su cuenta." };
  return { ok: true };
}

async function buildTimeline(executeKw, uid, task, order) {
  const timeline = [];

  timeline.push({
    type: "project_task",
    at: task.write_date || null,
    detail: `Tarjeta ${task.name} en etapa ${stageLabel(task) || "sin etapa"}.`,
  });

  if (order) {
    timeline.push({
      type: "order",
      at: order.date_order || order.write_date || null,
      detail: `Pedido ${order.name} en estado ${order.state}.`,
    });
    if (order.invoice_status) {
      timeline.push({
        type: "invoice_status",
        at: order.write_date || null,
        detail: `Estado de facturacion: ${order.invoice_status}.`,
      });
    }

    const pickings = await executeKw(
      uid,
      "stock.picking",
      "search_read",
      [[["origin", "=", order.name]]],
      { fields: ["name", "state", "scheduled_date", "date_done"], limit: 5, order: "id desc" }
    );
    for (const row of pickings || []) {
      timeline.push({
        type: "logistics",
        at: row.date_done || row.scheduled_date || null,
        detail: `Movimiento ${row.name} en estado ${row.state}.`,
      });
    }
  }

  try {
    const messages = await executeKw(
      uid,
      "mail.message",
      "search_read",
      [[["model", "=", "project.task"], ["res_id", "=", task.id]]],
      { fields: ["date", "body", "subtype_id", "author_id"], limit: 8, order: "date desc" }
    );
    for (const msg of messages || []) {
      const body = stripHtml(String(msg.body || "")).trim();
      if (!body) continue;
      timeline.push({
        type: "chatter",
        at: msg.date || null,
        detail: body.slice(0, 280),
      });
    }
  } catch (_e) {
    // mail.message may be restricted in some Odoo profiles.
  }

  return timeline.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
}

function stripHtml(text) {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

function serviceMeta(name, status, now, partnerId) {
  return {
    last_call_name: name,
    last_call_status: status,
    last_call_at: now,
    scoped_partner_id: partnerId,
    fallback_message: null,
  };
}

function ok(vars) {
  return new Response(JSON.stringify({ vars, status: "ready" }), {
    headers: { "Content-Type": "application/json" },
  });
}

function deny(message, now, status = 403) {
  return new Response(
    JSON.stringify({
      vars: {
        service: {
          last_call_name: "consultar_tarjeta_pedido",
          last_call_status: "denied",
          last_call_at: now,
          fallback_message: message,
        },
      },
      status: "denied",
      message,
    }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

async function odooClient(env) {
  const rpc = async (service, method, args) => {
    const resp = await fetch(`${env.ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args } }),
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
  if (!uid) throw new Error("Odoo authentication failed");
  const executeKw = (uid, model, method, positionalArgs = [], kw = {}) =>
    rpc("object", "execute_kw", [
      env.ODOO_DB,
      uid,
      env.ODOO_PASSWORD,
      model,
      method,
      positionalArgs,
      kw,
    ]);
  return { uid, executeKw };
}
