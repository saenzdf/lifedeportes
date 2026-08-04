async function handler(request, env) {
  const body = await request.json();
  const unit = Number(body?.vars?.pricing?.unit_cop || 0);
  const total = Number(body?.vars?.pricing?.total_cop || 0);
  const quantity = Number(body?.vars?.intent?.quantity || 1);
  const name = body?.vars?.product?.match_name || "producto";
  const formatCOP = (value) =>
    `$${Math.round(Number(value || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

  const reply = `Claro, ${name} te queda en ${formatCOP(unit)} por unidad. Para ${quantity} unidad(es), el total es ${formatCOP(total)}.`;
  return new Response(
    JSON.stringify({
      vars: {
        reply_text: reply
      }
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
