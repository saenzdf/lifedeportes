async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const orderId = Number(input.order_id || vars?.order?.id || 0);
  const orderName = String(input.order_name || vars?.order?.name || "").trim();
  const scopedPartnerId = Number(vars?.user?.partner_id || 0);
  const ODOO_URL = env.ODOO_URL;
  const ODOO_DB = env.ODOO_DB;
  const ODOO_USERNAME = env.ODOO_USERNAME;
  const ODOO_PASSWORD = env.ODOO_PASSWORD;

  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
    return errorResponse(500, "Missing Odoo credentials in function secrets.", now);
  }
  if (!orderId && !orderName) {
    return errorResponse(400, "Missing order_id/order_name.", now);
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

    let targetOrderId = orderId;
    if (!targetOrderId && orderName) {
      const found = await executeKw(uid, "sale.order", "search_read", [[["name", "=", orderName]]], {
        fields: ["id"],
        limit: 1,
      });
      targetOrderId = Array.isArray(found) && found[0]?.id ? found[0].id : 0;
    }
    if (!targetOrderId) {
      return errorResponse(404, "Order not found in Odoo.", now);
    }

    const rows = await executeKw(uid, "sale.order", "read", [[targetOrderId]], {
      fields: [
        "id",
        "name",
        "state",
        "amount_total",
        "amount_untaxed",
        "date_order",
        "partner_id",
        "invoice_status",
      ],
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return errorResponse(404, "Order not found in read().", now);

    const rowPartnerId = Array.isArray(row.partner_id) ? row.partner_id[0] : row.partner_id;
    if (Number(rowPartnerId) !== scopedPartnerId) {
      return errorResponse(403, "Ese pedido no pertenece a su cuenta.", now);
    }

    let tasks = [];
    try {
      tasks = await executeKw(uid, "project.task", "search_read", [[["sale_order_id", "=", targetOrderId]]], {
        fields: ["id", "name", "stage_id", "project_id", "write_date"],
        limit: 3,
        order: "id desc",
      });
    } catch (_e) {
      tasks = [];
    }
    const latestTask = Array.isArray(tasks) && tasks[0] ? tasks[0] : null;

    return new Response(
      JSON.stringify({
        vars: {
          order: {
            id: row.id,
            name: row.name,
            status: row.state,
            amount_total: Number(row.amount_total || 0),
            amount_untaxed: Number(row.amount_untaxed || 0),
            date_order: row.date_order || null,
            invoice_status: row.invoice_status || null,
            partner_name: Array.isArray(row.partner_id) ? row.partner_id[1] : null,
            linked_task_count: Array.isArray(tasks) ? tasks.length : 0,
            linked_task_name: latestTask?.name || null,
            linked_task_stage: Array.isArray(latestTask?.stage_id) ? latestTask.stage_id[1] : null,
            linked_project_name: Array.isArray(latestTask?.project_id) ? latestTask.project_id[1] : null,
          },
          service: {
            last_call_name: "get_order_status_odoo",
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
    return errorResponse(502, `Failed to fetch order status: ${String(error?.message || error)}`, now);
  }
}

function errorResponse(status, message, now) {
  return new Response(
    JSON.stringify({
      vars: {
        service: {
          last_call_name: "get_order_status_odoo",
          last_call_status: "error",
          last_call_at: now,
          fallback_message: "No pude traer el estado exacto en este momento; lo paso a revision.",
        },
      },
      status: "error",
      message,
    }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
