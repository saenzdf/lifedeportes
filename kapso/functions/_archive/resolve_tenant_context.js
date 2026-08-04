async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const whatsappContext = body?.whatsapp_context || {};
  const conversation = whatsappContext.conversation || {};
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};

  const phoneNumberId =
    conversation.whatsapp_config_id ||
    vars?.tenant?.phone_number_id ||
    env?.DEFAULT_PHONE_NUMBER_ID ||
    "1095603153637786";

  const TENANT_REGISTRY = {
    life_main: {
      id: "life_main",
      name: "Life Deportes Principal",
      policy_set: "sales_default_v1",
      secret_prefix: "TENANT_LIFE_MAIN",
      allowed_phone_number_ids: ["1095603153637786"],
    },
    life_sandbox: {
      id: "life_sandbox",
      name: "Life Deportes Sandbox",
      policy_set: "sales_default_v1",
      secret_prefix: "TENANT_LIFE_SANDBOX",
      allowed_phone_number_ids: ["597907523413541"],
    },
  };

  let tenant = TENANT_REGISTRY.life_main;
  for (const t of Object.values(TENANT_REGISTRY)) {
    if (t.allowed_phone_number_ids.includes(String(phoneNumberId))) {
      tenant = t;
      break;
    }
  }

  return new Response(
    JSON.stringify({
      vars: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          policy_set: tenant.policy_set,
          secret_prefix: tenant.secret_prefix,
          phone_number_id: String(phoneNumberId),
        },
        service: {
          last_call_name: "resolve_tenant_context",
          last_call_status: "ready",
          last_call_at: new Date().toISOString(),
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
