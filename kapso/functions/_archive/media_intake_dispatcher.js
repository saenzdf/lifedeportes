async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};

  const mediaType = String(input.media_type || "").toLowerCase();
  const mediaUrl = String(input.media_url || "").trim();

  if (!mediaUrl || !["image", "audio"].includes(mediaType)) {
    return new Response(
      JSON.stringify({
        vars: {
          service: {
            last_call_name: "invocar_media_intake",
            last_call_status: "error",
            last_call_at: new Date().toISOString(),
            fallback_message:
              "No recibi bien el archivo. Mandame la foto o audio otra vez o dame los datos por texto.",
          },
        },
        status: "error",
        message: "Missing or invalid media_type/media_url.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      vars: {
        media: {
          type: mediaType,
          source_url: mediaUrl,
          transcript: "",
          confidence: 0,
        },
        service: {
          last_call_name: "invocar_media_intake",
          last_call_status: "stub",
          last_call_at: new Date().toISOString(),
          fallback_message:
            "Recibi tu archivo. Por ahora necesito que me confirmes los datos por chat; te ayudo a armar la lista.",
        },
      },
      status: "stub",
      message:
        "Stub: no se transcribe todavia. Reemplazar por llamada a Gemini 2.5 multimodal (image/audio) cuando este listo.",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
