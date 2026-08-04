async function handler(request, env) {
  const body = await request.json();
  const phone = body?.vars?.customer?.phone;
  const matchId = body?.vars?.product?.match_id;
  const quantity = body?.vars?.intent?.quantity;

  // En un flujo real, esto podria disparar un webhook o mensaje a otro workflow
  console.log(`EMITTING QUOTE SIGNAL for ${phone}: ProductID=${matchId}, Qty=${quantity}`);

  return new Response(
    JSON.stringify({ 
      vars: { 
        quote: { signal_sent: true } 
      } 
    }), 
    { headers: { "Content-Type": "application/json" } }
  );
}
