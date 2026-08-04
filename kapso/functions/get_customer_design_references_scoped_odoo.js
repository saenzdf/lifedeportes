/**
 * Referencias de diseños anteriores: tarjetas en etapa Hecho + adjuntos diseño/impresión.
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();
  const partnerId = Number(vars?.user?.partner_id || 0);
  const limit = Math.min(10, Math.max(1, Number(input.limit || 5)));

  if (!partnerId) {
    return deny("Sin identidad de cliente verificada.", now);
  }
  if (!env.ODOO_URL || !env.ODOO_DB || !env.ODOO_USERNAME || !env.ODOO_PASSWORD) {
    return deny("Consulta no disponible.", now, 503);
  }

  try {
    const { executeKw, uid } = await odooClient(env);
    const doneTasks = await findDoneTasks(executeKw, uid, partnerId, limit);
    const references = [];

    for (const task of doneTasks) {
      const card = {
        task_id: task.id,
        task_name: task.name,
        stage: Array.isArray(task.stage_id) ? task.stage_id[1] : null,
        order_id: Array.isArray(task.sale_order_id) ? task.sale_order_id[0] : task.sale_order_id || null,
        order_name: null,
      };

      if (card.order_id) {
        const orders = await executeKw(uid, "sale.order", "read", [[card.order_id]], {
          fields: ["name", "partner_id"],
        });
        const order = Array.isArray(orders) ? orders[0] : null;
        const orderPartner = Array.isArray(order?.partner_id) ? order.partner_id[0] : order?.partner_id;
        if (Number(orderPartner) !== partnerId) continue;
        card.order_name = order?.name || null;
      }

      const taskAttachments = await searchDesignAttachments(executeKw, uid, "project.task", task.id);
      for (const att of taskAttachments) {
        references.push({
          ...card,
          attachment_id: att.id,
          file_name: att.name,
          mimetype: att.mimetype,
          kind: classifyAttachment(att),
          created_at: att.create_date,
          source: "project_task",
        });
      }

      if (card.order_id) {
        const orderAttachments = await searchDesignAttachments(executeKw, uid, "sale.order", card.order_id);
        for (const att of orderAttachments) {
          references.push({
            ...card,
            attachment_id: att.id,
            file_name: att.name,
            mimetype: att.mimetype,
            kind: classifyAttachment(att),
            created_at: att.create_date,
            source: "sale_order",
          });
        }
      }
    }

    const deduped = dedupeReferences(references).slice(0, limit * 3);

    return new Response(
      JSON.stringify({
        vars: {
          customer_designs: deduped,
          design_reference_count: deduped.length,
          service: {
            last_call_name: "consultar_referencias_diseno",
            last_call_status: "ready",
            last_call_at: now,
            scoped_partner_id: partnerId,
            fallback_message: null,
          },
        },
        status: deduped.length ? "ready" : "empty",
        message: deduped.length
          ? `${deduped.length} referencia(s) de diseño o impresión en pedidos anteriores.`
          : "No hay referencias de diseño archivadas en pedidos terminados.",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return deny(`No pude consultar referencias: ${String(error?.message || error)}`, now, 502);
  }
}

function isDoneStage(stageName) {
  const s = String(stageName || "").toLowerCase();
  return /hecho|done|entregad|cerrad/.test(s);
}

async function findDoneTasks(executeKw, uid, partnerId, limit) {
  const taskFields = ["id", "name", "stage_id", "sale_order_id", "write_date"];
  let tasks = [];

  try {
    tasks = await executeKw(uid, "project.task", "search_read", [[["partner_id", "=", partnerId]]], {
      fields: taskFields,
      limit: 30,
      order: "write_date desc",
    });
  } catch (_e) {
    const orders = await executeKw(uid, "sale.order", "search_read", [[["partner_id", "=", partnerId]]], {
      fields: ["id"],
      limit: 20,
      order: "id desc",
    });
    const orderIds = (orders || []).map((o) => o.id);
    if (orderIds.length) {
      tasks = await executeKw(uid, "project.task", "search_read", [[["sale_order_id", "in", orderIds]]], {
        fields: taskFields,
        limit: 30,
        order: "write_date desc",
      });
    }
  }

  return (tasks || [])
    .filter((t) => isDoneStage(Array.isArray(t.stage_id) ? t.stage_id[1] : ""))
    .slice(0, limit);
}

async function searchDesignAttachments(executeKw, uid, resModel, resId) {
  const rows = await executeKw(uid, "ir.attachment", "search_read", [
    [
      ["res_model", "=", resModel],
      ["res_id", "=", resId],
      "|",
      ["mimetype", "ilike", "image"],
      ["mimetype", "ilike", "pdf"],
    ],
  ], {
    fields: ["id", "name", "mimetype", "create_date"],
    limit: 10,
    order: "create_date desc",
  });
  return rows || [];
}

function classifyAttachment(att) {
  const name = String(att.name || "").toLowerCase();
  const mime = String(att.mimetype || "").toLowerCase();
  if (/impres|print|pdf|plot/.test(name) || mime.includes("pdf")) return "print_file";
  if (/diseno|diseño|mock|arte|logo/.test(name) || mime.includes("image")) return "design_reference";
  return mime.includes("image") ? "design_reference" : "file";
}

function dedupeReferences(refs) {
  const seen = new Set();
  return refs.filter((r) => {
    const key = `${r.attachment_id}:${r.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    rpc("object", "execute_kw", [env.ODOO_DB, uid, env.ODOO_PASSWORD, model, method, positionalArgs, kw]);
  return { uid, executeKw };
}
