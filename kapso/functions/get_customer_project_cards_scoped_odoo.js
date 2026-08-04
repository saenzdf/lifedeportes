/**
 * Consulta unificada: tarjeta project.task + pedido + timeline.
 * Si no hay tarjeta para el pedido/cliente → no existe (not_found).
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const partnerId = Number(vars?.user?.partner_id || 0);
  const orderId = Number(input.order_id || vars?.order?.id || 0);
  const orderName = String(input.order_name || vars?.order?.name || vars?.order?.last_order_name || "").trim();
  const taskId = Number(input.task_id || 0);

  if (!partnerId) {
    return deny("Sin identidad de cliente verificada.", now);
  }
  if (!env.ODOO_URL || !env.ODOO_DB || !env.ODOO_USERNAME || !env.ODOO_PASSWORD) {
    return deny("Consulta no disponible en este momento.", now, 503);
  }

  try {
    const { executeKw, uid } = await odooClient(env);
    let order = null;
    let targetOrderId = orderId;

    if (!targetOrderId && orderName) {
      const found = await executeKw(uid, "sale.order", "search_read", [[["name", "=", orderName]]], {
        fields: ["id", "name", "state", "amount_total", "date_order", "invoice_status", "partner_id"],
        limit: 1,
      });
      order = Array.isArray(found) ? found[0] : null;
      targetOrderId = order?.id || 0;
    }

    if (targetOrderId && !order) {
      const rows = await executeKw(uid, "sale.order", "read", [[targetOrderId]], {
        fields: ["id", "name", "state", "amount_total", "date_order", "invoice_status", "partner_id", "write_date"],
      });
      order = Array.isArray(rows) ? rows[0] : null;
    }

    if (order) {
      const orderPartnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : order.partner_id;
      if (Number(orderPartnerId) !== partnerId) {
        return deny("Ese pedido no pertenece a su cuenta.", now);
      }
    }

    const taskFields = ["id", "name", "stage_id", "project_id", "sale_order_id", "write_date", "date_deadline"];
    let task = null;

    if (taskId) {
      const rows = await executeKw(uid, "project.task", "read", [[taskId]], { fields: taskFields });
      task = Array.isArray(rows) ? rows[0] : null;
    } else if (targetOrderId) {
      const tasks = await executeKw(uid, "project.task", "search_read", [[["sale_order_id", "=", targetOrderId]]], {
        fields: taskFields,
        limit: 1,
        order: "id desc",
      });
      task = Array.isArray(tasks) ? tasks[0] : null;
    } else {
      task = await findLatestActiveTask(executeKw, uid, partnerId, taskFields);
      if (task) {
        const linkedOrderId = Array.isArray(task.sale_order_id) ? task.sale_order_id[0] : task.sale_order_id;
        if (linkedOrderId && !order) {
          const rows = await executeKw(uid, "sale.order", "read", [[linkedOrderId]], {
            fields: ["id", "name", "state", "amount_total", "date_order", "invoice_status", "partner_id", "write_date"],
          });
          order = Array.isArray(rows) ? rows[0] : null;
          targetOrderId = linkedOrderId;
        }
      }
    }

    if (!task) {
      return notFound(
        orderName || order?.name
          ? `No encontramos tarjeta de producción para el pedido ${orderName || order?.name}.`
          : "No encontramos un pedido en curso con tarjeta activa en taller o diseño.",
        now
      );
    }

    if (!order && task) {
      const linkedOrderId = Array.isArray(task.sale_order_id) ? task.sale_order_id[0] : task.sale_order_id;
      if (linkedOrderId) {
        const rows = await executeKw(uid, "sale.order", "read", [[linkedOrderId]], {
          fields: ["id", "name", "state", "amount_total", "date_order", "invoice_status", "partner_id", "write_date"],
        });
        order = Array.isArray(rows) ? rows[0] : null;
        if (order) {
          const orderPartnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : order.partner_id;
          if (Number(orderPartnerId) !== partnerId) {
            return deny("Esa tarjeta no pertenece a su cuenta.", now);
          }
        }
      }
    }

    const card = mapTask(task);
    const timeline = await buildTimeline(executeKw, uid, order, task);

    return new Response(
      JSON.stringify({
        vars: {
          order: order
            ? {
                id: order.id,
                name: order.name,
                status: order.state,
                amount_total: Number(order.amount_total || 0),
                date_order: order.date_order || null,
                invoice_status: order.invoice_status || null,
              }
            : {
                id: targetOrderId || null,
                name: orderName || null,
                status: null,
              },
          project: {
            card_id: card.id,
            card_name: card.name,
            latest_card_name: card.name,
            latest_stage: card.stage,
            project_name: card.project,
            updated_at: card.updated_at,
          },
          order_timeline: timeline,
          service: {
            last_call_name: "consultar_tarjeta_pedido",
            last_call_status: "ready",
            last_call_at: now,
            scoped_partner_id: partnerId,
            fallback_message: null,
          },
        },
        status: "ready",
        summary_for_agent: buildSummary(card, order, timeline),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return deny(`No pude consultar la tarjeta: ${String(error?.message || error)}`, now, 502);
  }
}

function mapTask(task) {
  return {
    id: task.id,
    name: task.name,
    stage: Array.isArray(task.stage_id) ? task.stage_id[1] : null,
    project: Array.isArray(task.project_id) ? task.project_id[1] : null,
    sale_order_id: Array.isArray(task.sale_order_id) ? task.sale_order_id[0] : task.sale_order_id || null,
    updated_at: task.write_date || null,
    deadline: task.date_deadline || null,
  };
}

function isDoneStage(stageName) {
  const s = String(stageName || "").toLowerCase();
  return /hecho|done|entregad|cerrad|cancel/.test(s);
}

async function findLatestActiveTask(executeKw, uid, partnerId, taskFields) {
  let tasks = [];
  try {
    tasks = await executeKw(uid, "project.task", "search_read", [[["partner_id", "=", partnerId]]], {
      fields: taskFields,
      limit: 15,
      order: "write_date desc",
    });
  } catch (_e) {
    const orders = await executeKw(uid, "sale.order", "search_read", [
      [["partner_id", "=", partnerId], ["state", "in", ["sale", "done"]]],
    ], { fields: ["id"], limit: 10, order: "id desc" });
    const orderIds = (orders || []).map((o) => o.id);
    if (orderIds.length) {
      tasks = await executeKw(uid, "project.task", "search_read", [[["sale_order_id", "in", orderIds]]], {
        fields: taskFields,
        limit: 15,
        order: "write_date desc",
      });
    }
  }
  const active = (tasks || []).find((t) => !isDoneStage(Array.isArray(t.stage_id) ? t.stage_id[1] : ""));
  return active || (tasks || [])[0] || null;
}

async function buildTimeline(executeKw, uid, order, task) {
  const timeline = [];
  const card = mapTask(task);

  timeline.push({
    type: "project_card",
    at: card.updated_at,
    detail: `Tarjeta «${card.name}» en etapa ${card.stage || "sin etapa"}${card.project ? ` (${card.project})` : ""}.`,
  });

  if (order) {
    timeline.push({
      type: "order",
      at: order.date_order || order.write_date || null,
      detail: `Pedido ${order.name} en estado ${order.state}.`,
    });
    if (order.invoice_status) {
      timeline.push({
        type: "invoice",
        at: order.write_date || null,
        detail: `Facturación: ${order.invoice_status}.`,
      });
    }
    try {
      const pickings = await executeKw(uid, "stock.picking", "search_read", [[["origin", "=", order.name]]], {
        fields: ["name", "state", "scheduled_date", "date_done"],
        limit: 5,
        order: "id desc",
      });
      for (const row of pickings || []) {
        timeline.push({
          type: "logistics",
          at: row.date_done || row.scheduled_date || null,
          detail: `Despacho ${row.name}: ${row.state}.`,
        });
      }
    } catch (_e) {
      /* optional */
    }
  }

  try {
    const messages = await executeKw(uid, "mail.message", "search_read", [
      [
        ["model", "=", "project.task"],
        ["res_id", "=", task.id],
      ],
    ], {
      fields: ["date", "body", "subtype_id"],
      limit: 8,
      order: "date desc",
    });
    for (const msg of messages || []) {
      const text = stripHtml(msg.body || "").slice(0, 200);
      if (!text) continue;
      timeline.push({
        type: "card_note",
        at: msg.date || null,
        detail: text,
      });
    }
  } catch (_e) {
    /* optional */
  }

  return timeline.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
}

function stripHtml(html) {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSummary(card, order, timeline) {
  const parts = [];
  if (order?.name) parts.push(`Pedido ${order.name} (${order.state})`);
  parts.push(`Etapa: ${card.stage || "sin etapa"}`);
  if (timeline.length > 1) parts.push(`${timeline.length} eventos recientes`);
  return parts.join(" · ");
}

function notFound(message, now) {
  return new Response(
    JSON.stringify({
      vars: {
        service: {
          last_call_name: "consultar_tarjeta_pedido",
          last_call_status: "not_found",
          last_call_at: now,
          fallback_message: message,
        },
      },
      status: "not_found",
      message,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
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
    rpc("object", "execute_kw", [env.ODOO_DB, uid, env.ODOO_PASSWORD, model, method, positionalArgs, kw]);
  return { uid, executeKw };
}
