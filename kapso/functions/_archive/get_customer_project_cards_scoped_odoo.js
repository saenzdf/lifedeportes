async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
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

  try {
    const { uid, executeKw } = await odooClient(env);
    let tasks = [];

    try {
      tasks = await executeKw(uid, "project.task", "search_read", [
        [["partner_id", "=", partnerId]],
      ], {
        fields: ["id", "name", "stage_id", "project_id", "sale_order_id", "write_date"],
        limit: 10,
        order: "write_date desc",
      });
    } catch (_e) {
      const orders = await executeKw(uid, "sale.order", "search_read", [
        [["partner_id", "=", partnerId], ["state", "in", ["sale", "done"]]],
      ], { fields: ["id"], limit: 10 });
      const orderIds = (orders || []).map((o) => o.id);
      if (orderIds.length) {
        tasks = await executeKw(uid, "project.task", "search_read", [
          [["sale_order_id", "in", orderIds]],
        ], {
          fields: ["id", "name", "stage_id", "project_id", "sale_order_id", "write_date"],
          limit: 10,
          order: "write_date desc",
        });
      }
    }

    const cards = (tasks || []).map((t) => ({
      id: t.id,
      name: t.name,
      stage: Array.isArray(t.stage_id) ? t.stage_id[1] : null,
      project: Array.isArray(t.project_id) ? t.project_id[1] : null,
      sale_order_id: Array.isArray(t.sale_order_id) ? t.sale_order_id[0] : t.sale_order_id || null,
      updated_at: t.write_date || null,
    }));

    return new Response(
      JSON.stringify({
        vars: {
          project_cards: cards,
          project: {
            active_card_count: cards.length,
            latest_card_name: cards[0]?.name || null,
            latest_stage: cards[0]?.stage || null,
          },
          service: {
            last_call_name: "consultar_tarjetas_proyecto",
            last_call_status: "ready",
            last_call_at: now,
            scoped_partner_id: partnerId,
            fallback_message: null,
          },
        },
        status: "ready",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return deny(`No pude consultar tarjetas: ${String(error?.message || error)}`, now, 502);
  }
}

function deny(message, now, status = 403) {
  return new Response(
    JSON.stringify({
      vars: {
        service: {
          last_call_name: "consultar_tarjetas_proyecto",
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
