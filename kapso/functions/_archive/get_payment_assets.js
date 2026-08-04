async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const now = new Date().toISOString();
  const requestType = String(input.request_type || "payment_info").trim();

  const paymentMessage =
    env.LIFE_PAYMENT_MESSAGE ||
    "Te compartimos los datos de pago para consignacion/transferencia cuando lo solicites.";
  const rutUrl = env.LIFE_RUT_URL || null;
  const bankCertUrl = env.LIFE_BANK_CERT_URL || null;
  const accountImages = String(env.LIFE_ACCOUNT_IMAGES || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const invoicePolicy =
    "Si no se requiere factura en este punto, se maneja cliente mostrador 2.2.2.2.2.2 y luego se regulariza segun proceso contable interno.";

  const payload =
    requestType === "invoice_policy"
      ? { invoice_policy_message: invoicePolicy }
      : {
          payment_message: paymentMessage,
          rut_url: rutUrl,
          bank_certification_url: bankCertUrl,
          account_images: accountImages,
        };

  return new Response(
    JSON.stringify({
      vars: {
        payment_assets: payload,
        service: {
          last_call_name: "get_payment_assets",
          last_call_status: "ready",
          last_call_at: now,
          fallback_message: null,
        },
      },
      status: "ready",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
