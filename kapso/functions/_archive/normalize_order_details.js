function compactString(value) {
  const text = value == null ? "" : String(value);
  return text.replace(/\s+/g, " ").trim();
}

function normalizeBoolean(value) {
  const text = compactString(value).toLowerCase();
  return ["1", "true", "si", "sí", "x", "ok", "yes"].includes(text);
}

function parseLine(line) {
  const raw = compactString(line);
  if (!raw) return null;

  const parts = raw
    .split(/\s*(?:,|;|\||\/| - | – | — )\s*/)
    .map(compactString)
    .filter(Boolean);

  const parsed = {
    nombre_uniforme: parts[0] || raw,
    talla: null,
    numero: null,
    manga: null,
    genero: null,
    camiseta: false,
    uniforme: true,
    arquero: false,
    comentario: null,
    raw_text: raw,
  };

  for (const part of parts.slice(1)) {
    const lower = part.toLowerCase();
    if (!parsed.talla && /^(xs|s|m|l|xl|2xl|3xl|4xl|\d{1,2})$/i.test(part)) {
      parsed.talla = part.toUpperCase();
      continue;
    }
    if (!parsed.numero && /^#?\d{1,3}$/.test(part)) {
      parsed.numero = part.replace("#", "");
      continue;
    }
    if (!parsed.manga && /(larga|corta)/i.test(part)) {
      parsed.manga = lower.includes("larga") ? "larga" : "corta";
      continue;
    }
    if (!parsed.genero && /(masculino|hombre|mas\b|femenino|mujer|fem\b)/i.test(part)) {
      parsed.genero = /(femenino|mujer|fem\b)/i.test(part) ? "femenino" : "masculino";
      continue;
    }
    if (/(arquero|portero)/i.test(part)) {
      parsed.arquero = true;
      parsed.uniforme = true;
      continue;
    }
    if (/camiseta/i.test(part)) {
      parsed.camiseta = true;
      parsed.uniforme = false;
      continue;
    }
    if (/uniforme/i.test(part)) {
      parsed.uniforme = true;
      continue;
    }
    parsed.comentario = parsed.comentario ? `${parsed.comentario}; ${part}` : part;
  }

  return parsed;
}

function normalizeRow(row) {
  if (!row || typeof row !== "object") return null;
  const nombre = compactString(
    row.nombre_uniforme || row.nombre || row.name || row["NOMBRE EN UNIFORME"] || row.NOMBRE
  );
  if (!nombre) return null;

  const generoRaw = compactString(row.genero || row.GENERO || "");
  const mas = normalizeBoolean(row.mas || row.MAS);
  const fem = normalizeBoolean(row.fem || row.FEM);

  return {
    nombre_uniforme: nombre,
    talla: compactString(row.talla || row.TALLA || "") || null,
    numero: compactString(row.numero || row.NUMERO || "") || null,
    manga: compactString(row.manga || row["Larga/Corta"] || row.MANGA || "") || null,
    genero:
      generoRaw.toLowerCase() ||
      (fem ? "femenino" : mas ? "masculino" : null),
    camiseta: normalizeBoolean(row.camiseta || row.Camiseta || row.CAMISETA),
    uniforme:
      row.uniforme == null && row.Uniforme == null && row.UNIFORME == null
        ? true
        : normalizeBoolean(row.uniforme || row.Uniforme || row.UNIFORME),
    arquero: normalizeBoolean(row.arquero || row.ARQUERO),
    comentario: compactString(row.comentario || row.COMENTARIO || "") || null,
  };
}

function extractFlowResponse(body, vars) {
  const context = body.execution_context?.context || {};
  const interactive = context.message?.interactive || body.context?.message?.interactive;
  const nfmReply = interactive?.nfm_reply;
  if (nfmReply?.response_json) {
    try {
      return JSON.parse(nfmReply.response_json);
    } catch (error) {
      return { lines_detail: nfmReply.response_json };
    }
  }

  const flowEvent = Array.isArray(body.flow_events)
    ? body.flow_events.find((event) => event?.payload?.response_json || event?.payload?.data)
    : null;
  return (
    body.input?.flow_response ||
    body.input?.response_json ||
    flowEvent?.payload?.data ||
    flowEvent?.payload?.response_json ||
    vars.flow?.last_response ||
    null
  );
}

function buildLines(input, body, vars) {
  if (Array.isArray(input.rows)) {
    return input.rows.map(normalizeRow).filter(Boolean);
  }

  const flowResponse = extractFlowResponse(body, vars);
  const flowData = typeof flowResponse === "string" ? { lines_detail: flowResponse } : flowResponse || {};
  if (Array.isArray(flowData.lines)) {
    return flowData.lines.map(normalizeRow).filter(Boolean);
  }
  if (Array.isArray(flowData.rows)) {
    return flowData.rows.map(normalizeRow).filter(Boolean);
  }

  const text = input.text || input.lines_detail || flowData.lines_detail || vars.intent?.raw_text || "";
  if (!text) return [];
  return String(text)
    .split(/\n+/)
    .flatMap((line) => line.split(/\s{2,}/))
    .map(parseLine)
    .filter(Boolean);
}

function completenessFor(lines, baseMissing) {
  const missing = [...baseMissing];
  if (!lines.length) missing.push("lines");
  lines.forEach((line, index) => {
    if (!line.nombre_uniforme) missing.push(`lines[${index}].nombre_uniforme`);
    if (!line.talla) missing.push(`lines[${index}].talla`);
    if (!line.numero) missing.push(`lines[${index}].numero`);
  });

  const uniqueMissing = [...new Set(missing)];
  const completeness = uniqueMissing.length === 0 ? "complete" : "incomplete";
  return { completeness, missing_fields: uniqueMissing };
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body.input || {};
  const executionContext = body.execution_context || {};
  const vars = executionContext.vars || {};
  const now = new Date().toISOString();

  const source = compactString(input.source || vars.order_details?.source || "text").toLowerCase();
  const flowResponse = extractFlowResponse(body, vars);
  const flowData = typeof flowResponse === "string" ? { lines_detail: flowResponse } : flowResponse || {};
  const lines = buildLines(input, body, vars);
  const colorMedia = compactString(input.color_media || flowData.color_media || vars.order_details?.color_media || "") || null;
  const disciplina = compactString(input.disciplina || flowData.disciplina || vars.order_details?.disciplina || vars.quote?.product_text || "") || null;
  const baseMissing = [];

  if (!disciplina) baseMissing.push("disciplina");
  const complete = completenessFor(lines, baseMissing);
  const confidence = complete.completeness === "complete" ? 0.9 : lines.length ? 0.65 : 0.3;
  const finalCompleteness = confidence < 0.5 ? "needs_human_review" : complete.completeness;

  const orderDetails = {
    partial: vars.order_details?.partial || {},
    designer_schema_version: "life_designer_order_v1",
    color_media: colorMedia,
    disciplina: disciplina,
    lines,
    attachments: input.attachments || vars.order_details?.attachments || [],
    source,
    completeness: finalCompleteness,
    missing_fields: complete.missing_fields,
    confidence,
    updated_at: now,
  };

  return new Response(
    JSON.stringify({
      vars: {
        funnel: {
          stage: finalCompleteness === "complete" ? "posventa" : vars.funnel?.stage || "posventa",
          stage_reason: finalCompleteness === "complete" ? "order_details_complete" : "order_details_incomplete",
          updated_at: now,
        },
        order_details: orderDetails,
        production_order: {
          ready_for_design:
            vars.payment?.verification_status === "approved" && finalCompleteness === "complete",
          ready_for_production: vars.design?.approval_status === "approved",
          notes_for_designers: lines
            .map((line) => `${line.nombre_uniforme} - ${line.talla || "sin talla"} - ${line.numero || "sin numero"}`)
            .join("\n"),
        },
        flow: flowResponse
          ? {
              last_name: input.flow_name || flowData.flow || vars.flow?.last_name || "order_details_v1",
              last_response: flowResponse,
              last_response_at: now,
              last_parse_status: finalCompleteness === "complete" ? "parsed" : "incomplete",
            }
          : vars.flow,
        service: {
          last_call_name: "normalize_order_details",
          last_call_status: "ready",
          last_call_at: now,
          fallback_message: null,
        },
      },
      status: "ready",
      completeness: finalCompleteness,
      missing_fields: complete.missing_fields,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
