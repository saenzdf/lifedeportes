async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const input = body?.input || {};
  const now = new Date().toISOString();

  const partnerId = Number(vars?.user?.partner_id || 0);
  if (!partnerId) {
    return deny("Sin identidad de cliente verificada. Solo puedo consultar datos de su propia cuenta.", now);
  }

  const ODOO_URL = env.ODOO_URL;
  const ODOO_DB = env.ODOO_DB;
  const ODOO_USERNAME = env.ODOO_USERNAME;
  const ODOO_PASSWORD = env.ODOO_PASSWORD;
  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
    return deny("Consulta no disponible en este momento.", now, 503);
  }

  const limit = Math.min(10, Math.max(1, Number(input.limit || 5)));

  try {
    const { uid, executeKw } = await odooClient(env);
    const orders = await executeKw(uid, "sale.order", "search_read", [
      [["partner_id", "=", partnerId]],
    ], {
      fields: ["id", "name", "state", "date_order", "amount_total"],
      limit,
      order: "id desc",
    });

    return new Response(
      JSON.stringify({
        vars: {
          customer_orders: (orders || []).map((o) => ({
            id: o.id,
            name: o.name,
            state: o.state,
            date_order: o.date_order,
            amount_total: Number(o.amount_total || 0),
          })),
          service: {
            last_call_name: "consultar_mis_pedidos",
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
    return deny(`No pude listar sus pedidos: ${String(error?.message || error)}`, now, 502);
  }
}

function deny(message, now, status = 403) {
  return new Response(
    JSON.stringify({
      vars: {
        service: {
          last_call_name: "consultar_mis_pedidos",
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
