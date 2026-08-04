async function handler(request, env) {
  const body = await request.json();
  const text = (body?.text || "").toString().trim();
  const phone = (body?.phone || "").toString().trim();

  const quantityMatch = text.match(/\b(\d+)\b/);
  const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : null;

  const lower = text.toLowerCase();
  const material = lower.includes("falcao")
    ? "falcao"
    : lower.includes("dry fit") || lower.includes("dryfit")
      ? "dry_fit"
      : null;

  return new Response(
    JSON.stringify({
      vars: {
        customer: { phone },
        intent: {
          raw_text: text,
          quantity,
          material,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
