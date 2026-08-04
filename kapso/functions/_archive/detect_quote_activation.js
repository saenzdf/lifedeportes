async function handler(request, env) {
  const body = await request.json();
  const text = (body?.vars?.reply_text || body?.reply_text || "").toString();
  const userText = (body?.vars?.intent?.raw_text || "").toString().toLowerCase();

  const closingHints = ["listo", "me interesa", "hagamoslo", "como pagamos", "cerrar pedido"];
  const shouldActivate = closingHints.some((k) => userText.includes(k)) || text.includes("ACTIVATE_QUOTE_SKILL");

  return new Response(
    JSON.stringify({
      vars: {
        quote: { should_activate: shouldActivate }
      }
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
