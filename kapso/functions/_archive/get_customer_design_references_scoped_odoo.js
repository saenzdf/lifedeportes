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
    return deny("Consulta no disponible.", now, 503);
  }

  const limit = Math.min(15, Math.max(1, Number(input.limit || 8)));

  try {
    const { uid, executeKw } = await odooClient(env);
    const tasks = await findPartnerTasks(executeKw, uid, partnerId, 20);
    const doneTasks = (tasks || []).filter((t) => isDoneStage(stageLabel(t)));

    const references = [];
    for (const task of doneTasks) {
      if (references.length >= limit) break;

      const attachments = await executeKw(uid, "ir.attachment", "search_read", [
        [
          ["res_model", "=", "project.task"],
          ["res_id", "=", task.id],
        ],
      ], {
        fields: ["id", "name", "mimetype", "create_date"],
        limit: 10,
        order: "create_date desc",
      });

      for (const att of attachments || []) {
        if (references.length >= limit) break;
        if (!isDesignAttachment(att)) continue;

        references.push({
          task_id: task.id,
          task_name: task.name,
          stage: stageLabel(task),
          sale_order_id: saleOrderIdFromTask(task),
          sale_order_name: Array.isArray(task.sale_order_id) ? task.sale_order_id[1] : null,
          attachment_id: att.id,
          file_name: att.name,
          mimetype: att.mimetype || null,
          created_at: att.create_date || null,
        });
      }
    }

    return new Response(
      JSON.stringify({
        vars: {
          design_references: references,
          customer_designs: references,
          service: {
            last_call_name: "consultar_referencias_diseno",
            last_call_status: "ready",
            last_call_at: now,
            scoped_partner_id: partnerId,
            fallback_message: null,
          },
        },
        status: "ready",
        reference_count: references.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return deny(`No pude consultar referencias de diseño: ${String(error?.message || error)}`, now, 502);
  }
}

function isDoneStage(stage) {
  const s = String(stage || "").toLowerCase();
  return /hecho|done|entregad|finalizad/.test(s);
}

function stageLabel(task) {
  return Array.isArray(task?.stage_id) ? task.stage_id[1] : null;
}

function saleOrderIdFromTask(task) {
  return Array.isArray(task?.sale_order_id) ? task.sale_order_id[0] : task.sale_order_id || null;
}

function isDesignAttachment(att) {
  const mime = String(att?.mimetype || "").toLowerCase();
  const name = String(att?.name || "").toLowerCase();
  if (mime.startsWith("image/") || mime === "application/pdf") return true;
  return /diseñ|diseno|impresi|design|mockup|arte/.test(name);
}

async function findPartnerTasks(executeKw, uid, partnerId, limit) {
  try {
    return await executeKw(uid, "project.task", "search_read", [[["partner_id", "=", partnerId]]], {
      fields: ["id", "name", "stage_id", "sale_order_id", "write_date"],
      limit,
      order: "write_date desc",
    });
  } catch (_e) {
    const orders = await executeKw(
      uid,
      "sale.order",
      "search_read",
      [[["partner_id", "=", partnerId], ["state", "in", ["sale", "done"]]]],
      { fields: ["id"], limit: 15 }
    );
    const orderIds = (orders || []).map((o) => o.id);
    if (!orderIds.length) return [];
    return executeKw(uid, "project.task", "search_read", [[["sale_order_id", "in", orderIds]]], {
      fields: ["id", "name", "stage_id", "sale_order_id", "write_date"],
      limit,
      order: "write_date desc",
    });
  }
}

function deny(message, now, status = 403) {
  return new Response(
    JSON.stringify({
      vars: {
        service: {
          last_call_name: "consultar_referencias_diseno",
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
