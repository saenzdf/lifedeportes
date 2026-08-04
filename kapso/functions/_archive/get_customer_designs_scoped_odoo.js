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

  const orderId = Number(input.order_id || vars?.order?.last_order_id || 0);

  try {
    const { uid, executeKw } = await odooClient(env);
    let orderIds = [];

    if (orderId) {
      await assertOrderBelongsToPartner(executeKw, uid, orderId, partnerId);
      orderIds = [orderId];
    } else {
      const orders = await executeKw(uid, "sale.order", "search_read", [
        [["partner_id", "=", partnerId]],
      ], { fields: ["id"], limit: 5, order: "id desc" });
      orderIds = (orders || []).map((o) => o.id);
    }

    const designs = [];
    for (const oid of orderIds) {
      const attachments = await executeKw(uid, "ir.attachment", "search_read", [
        [
          ["res_model", "=", "sale.order"],
          ["res_id", "=", oid],
          ["mimetype", "ilike", "image"],
        ],
      ], {
        fields: ["id", "name", "mimetype", "create_date"],
        limit: 5,
        order: "create_date desc",
      });
      for (const att of attachments || []) {
        designs.push({
          order_id: oid,
          name: att.name,
          created_at: att.create_date,
        });
      }
    }

    return new Response(
      JSON.stringify({
        vars: {
          customer_designs: designs,
          service: {
            last_call_name: "consultar_disenos_anteriores",
            last_call_status: "ready",
            last_call_at: now,
            scoped_partner_id: partnerId,
            fallback_message: null,
          },
        },
        status: "ready",
        design_count: designs.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = String(error?.message || error);
    if (msg === "FORBIDDEN_ORDER") {
      return deny("Ese pedido no pertenece a su cuenta.", now);
    }
    return deny(`No pude consultar diseños: ${msg}`, now, 502);
  }
}

async function assertOrderBelongsToPartner(executeKw, uid, orderId, partnerId) {
  const rows = await executeKw(uid, "sale.order", "read", [[orderId]], {
    fields: ["partner_id"],
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  const pid = Array.isArray(row?.partner_id) ? row.partner_id[0] : row?.partner_id;
  if (Number(pid) !== Number(partnerId)) throw new Error("FORBIDDEN_ORDER");
}

function deny(message, now, status = 403) {
  return new Response(
    JSON.stringify({
      vars: {
        service: {
          last_call_name: "consultar_disenos_anteriores",
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
