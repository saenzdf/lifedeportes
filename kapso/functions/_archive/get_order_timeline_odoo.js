async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const orderId = Number(input.order_id || vars?.order?.id || 0);
  const scopedPartnerId = Number(vars?.user?.partner_id || 0);
  const ODOO_URL = env.ODOO_URL;
  const ODOO_DB = env.ODOO_DB;
  const ODOO_USERNAME = env.ODOO_USERNAME;
  const ODOO_PASSWORD = env.ODOO_PASSWORD;

  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
    return errorResponse(500, "Missing Odoo credentials in function secrets.", now);
  }
  if (!orderId) {
    return errorResponse(400, "Missing order_id.", now);
  }
  if (!scopedPartnerId) {
    return errorResponse(403, "Sin identidad de cliente verificada.", now);
  }

  const rpc = async (service, method, args) => {
    const resp = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args } }),
    });
    const json = await resp.json();
    if (json?.error) throw new Error(json.error?.message || "Odoo RPC error");
    return json.result;
  };
  const executeKw = async (uid, model, method, positionalArgs = [], kw = {}) =>
    rpc("object", "execute_kw", [ODOO_DB, uid, ODOO_PASSWORD, model, method, positionalArgs, kw]);

  try {
    const uid = await rpc("common", "authenticate", [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}]);
    if (!uid) throw new Error("Odoo authentication failed");

    const timeline = [];
    const orderRows = await executeKw(uid, "sale.order", "read", [[orderId]], {
      fields: ["name", "state", "date_order", "write_date", "invoice_status"],
    });
    const order = Array.isArray(orderRows) ? orderRows[0] : null;
    if (!order) return errorResponse(404, "Order not found.", now);

    const orderPartnerRows = await executeKw(uid, "sale.order", "read", [[orderId]], {
      fields: ["partner_id"],
    });
    const orderPartner = Array.isArray(orderPartnerRows?.[0]?.partner_id)
      ? orderPartnerRows[0].partner_id[0]
      : orderPartnerRows?.[0]?.partner_id;
    if (Number(orderPartner) !== scopedPartnerId) {
      return errorResponse(403, "Ese pedido no pertenece a su cuenta.", now);
    }

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

    try {
      const tasks = await executeKw(
        uid,
        "project.task",
        "search_read",
        [[["sale_order_id", "=", orderId]]],
        { fields: ["name", "stage_id", "write_date", "project_id"], limit: 5, order: "id desc" }
      );
      for (const task of tasks || []) {
        timeline.push({
          type: "project_task",
          at: task.write_date || null,
          detail: `Tarea ${task.name} en ${Array.isArray(task.stage_id) ? task.stage_id[1] : "sin etapa"} (${Array.isArray(task.project_id) ? task.project_id[1] : "sin proyecto"}).`,
        });
      }
    } catch (_error) {
      // Some Odoo environments may not expose sale_order_id on tasks.
    }

    return new Response(
      JSON.stringify({
        vars: {
          order: {
            id: orderId,
            name: order.name,
          },
          order_timeline: timeline,
          service: {
            last_call_name: "get_order_timeline_odoo",
            last_call_status: "ready",
            last_call_at: now,
            fallback_message: null,
          },
        },
        status: "ready",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return errorResponse(502, `Failed to fetch order timeline: ${String(error?.message || error)}`, now);
  }
}

function errorResponse(status, message, now) {
  return new Response(
    JSON.stringify({
      vars: {
        service: {
          last_call_name: "get_order_timeline_odoo",
          last_call_status: "error",
          last_call_at: now,
          fallback_message: "No pude traer la linea de tiempo en este momento; lo paso a revision.",
        },
      },
      status: "error",
      message,
    }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
