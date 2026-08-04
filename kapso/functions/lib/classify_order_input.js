/**
 * Clasificación de input staff (Excel / docx / imagen / texto / conversación).
 * Compartido por staff_allowlist_check y detect_staff_lane.
 */

export function classifyOrderInput(messages) {
  const inbound = [...(messages || [])]
    .reverse()
    .filter((message) => message?.direction === "inbound");
  const lastText = String(inbound[0]?.content || inbound[0]?.text?.body || "").trim();
  const evidence = inbound.slice(0, 12).flatMap((message) => {
    const url =
      message?.media_url ||
      message?.media?.url ||
      message?.document?.url ||
      message?.image?.url ||
      null;
    const filename = String(
      message?.media?.filename || message?.document?.filename || message?.filename || ""
    ).trim();
    const mime_type = String(message?.media?.mime_type || message?.mimetype || "").trim();
    return url || filename
      ? [{ url, filename: filename || null, mime_type: mime_type || null }]
      : [];
  });
  const names = evidence.map((item) => `${item.filename || ""} ${item.mime_type || ""}`).join(" ");

  // Contenido real > extensión sola
  if (/\.(xlsx|xlsm|xltx|xls|csv)\b|spreadsheet|excel/i.test(names)) {
    return {
      lane: "staff_pedido",
      format: "excel_unknown_layout",
      confidence: 0.7,
      parser: "parsear_lista_excel_pedido",
      mode: "deterministic_then_agent",
      evidence,
    };
  }
  if (/\.docx\b|wordprocessingml/i.test(names)) {
    return {
      lane: "staff_pedido",
      format: "docx_unknown_layout",
      confidence: 0.65,
      parser: "parsear_lista_excel_pedido",
      mode: "deterministic_then_agent",
      evidence,
    };
  }
  if (/\.(jpe?g|png|webp|pdf)\b|image\//i.test(names)) {
    return {
      lane: "staff_pedido",
      format: "image_or_pdf",
      confidence: 0.55,
      parser: "parsear_lista_imagen_pedido",
      mode: "deterministic_then_agent",
      evidence,
    };
  }
  if (
    /\b(talla|numero|número|dorsal|manga|uniforme|camiseta|arquero)\b/i.test(lastText) &&
    /(?:\n|,|;|\||#|\d)/.test(lastText)
  ) {
    return {
      lane: "staff_pedido",
      format: "structured_text",
      confidence: 0.75,
      parser: "parsear_lista_texto_pedido",
      mode: "deterministic",
      evidence,
    };
  }
  return {
    lane: "staff_pedido",
    format: lastText ? "unstructured_conversation" : "unknown",
    confidence: lastText ? 0.35 : 0.2,
    parser: null,
    mode: "agent_normalize",
    evidence,
  };
}
