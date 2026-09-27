/**
 * Utilidades compartidas — parse lista pedido staff (tools internas agente).
 */

const FIXED_IMAGE_LIST_QUESTION =
  "Extrae SOLO un JSON array de objetos con keys: numero, nombre, talla, manga, genero (masculino|femenino), arquero (true|false). Sin markdown ni texto extra.";

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Quita prefijo Odoo/CRM «Oportunidad de X» → X (para SO, note, partner). */
function stripOppPrefix(name) {
  return compact(name).replace(/^oportunidad\s+de\s+/i, "").trim();
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeBoolean(value) {
  const text = compact(value).toLowerCase();
  return ["1", "true", "si", "sí", "x", "ok", "yes"].includes(text);
}

/** Marca de casilla Excel (X). Texto libre en la celda no cuenta como marca. */
function isCheckboxMarkValue(value) {
  const t = compact(value).toUpperCase();
  if (!t) return false;
  if (/^\d{2,}$/.test(t)) return false;
  return t === "X" || t === "SI" || t === "SÍ" || t === "1" || t === "TRUE";
}

/** Texto en celda de producto (Camiseta/Uniforme) que no es casilla X. */
function cellInlineNote(value) {
  const t = compact(value);
  if (!t || isCheckboxMarkValue(t)) return "";
  return t;
}

/** Solo pantaloneta / short — no camiseta ni uniforme completo. */
function isPantalonetaOnlyText(...parts) {
  const joined = parts.filter(Boolean).map(compact).join(" ").toLowerCase();
  if (!joined) return false;
  if (
    /solo\s*pantalon|s[oó]lo\s*pantalon|pantaloneta\s*sol|sol[oa]\s+pantaloneta|solo\s+pantaloneta/.test(
      joined
    )
  ) {
    return true;
  }
  if (/\bpantaloneta\b/.test(joined) && /\b(solo|sólo|solamente)\b/.test(joined)) return true;
  return false;
}

function inferAttachmentRole(filename, mimeType = "", contextText = "") {
  const name = compact(filename).toLowerCase();
  const mime = compact(mimeType).toLowerCase();
  const text = compact(contextText).toLowerCase();

  // Detección de comprobante de pago / transferencia bancaria (Bancolombia, Davivienda, Nequi, etc.)
  if (
    /comprobante|consigna|transfer|nequi|daviplata|bancolombia|davivienda|bre-?b|soporte.*pago|recibo.*pago|abono|anticipo|\bpago\b/i.test(name) ||
    /comprobante|consigna|transfer|nequi|daviplata|bancolombia|davivienda|bre-?b|soporte\s*(del?)?\s*pago|recibo\s*(del?)?\s*pago|ya\s*(te\s*)?(pagu[eé]|abon[eé]|transfer[ií]|consign[eé])|adjunto\s*(el?)?\s*(pago|comprobante|soporte)/i.test(text)
  ) {
    return "payment_receipt";
  }

  if (/\.(xlsx|xlsm|xltx|xls|csv)$/i.test(name) || mime.includes("spreadsheet") || mime.includes("excel")) {
    return "detail_list";
  }
  if (/\.docx$/i.test(name) || mime.includes("wordprocessingml")) {
    return "detail_list";
  }
  if (
    /lista|tallas|formato|pedido|nomin|jugador|alumno|roster|plantel/i.test(name) ||
    /lista|tallas|dorsal|planilla|nombres.*tallas/i.test(text)
  ) {
    return "detail_list";
  }
  if (/referencia|diseno|diseño|mockup|logo|arte|wildcat|hub|escudo/i.test(name) ||
      /diseño|diseno|referencia|boceto|logo|modelo|escudo/i.test(text)) {
    return "design_reference";
  }
  if (/\.(jpe?g|png|webp|gif)$/i.test(name) || mime.startsWith("image/")) {
    return "design_reference";
  }
  if (/\.pdf$/i.test(name) || mime === "application/pdf") {
    return "detail_list";
  }
  return "other";
}

function pickMediaFromContext(body) {
  const input = body?.input || body?.data || {};
  const vars = body?.execution_context?.vars || body?.vars || {};
  const ctx = body?.whatsapp_context || {};
  const messages = Array.isArray(ctx.messages) ? ctx.messages : [];

  const inbound = [...messages].reverse().filter((m) => m.direction === "inbound");
  const lastCustomerText = compact(
    input.text ||
    input.message ||
    input.context_text ||
    inbound[0]?.content ||
    inbound[0]?.body ||
    inbound[0]?.text ||
    ""
  );

  const mediaFromMessages = [];
  for (const msg of inbound.slice(0, 12)) {
    const url =
      msg?.media_url ||
      msg?.media?.url ||
      msg?.document?.url ||
      msg?.image?.url ||
      null;
    if (!url || !String(url).startsWith("http")) continue;
    const filename =
      compact(msg?.media?.filename || msg?.document?.filename || msg?.filename) ||
      filenameFromUrl(url);
    const mime = compact(msg?.media?.mime_type || msg?.mimetype || "");
    const caption = compact(msg?.caption || msg?.content || msg?.body || "");
    const contextText = [caption, lastCustomerText].filter(Boolean).join(" ");
    mediaFromMessages.push({
      url,
      filename,
      mime_type: mime,
      caption,
      role: inferAttachmentRole(filename, mime, contextText),
    });
  }

  const candidates = [
    input.file_url,
    input.media_url,
    input.url,
    vars?.media?.source_url,
    vars?.media?.url,
    ctx?.media_data?.url,
    ctx?.last_media_url,
  ];

  let primaryUrl = null;
  for (const c of candidates) {
    const url = compact(c);
    if (url.startsWith("http")) {
      primaryUrl = url;
      break;
    }
  }

  if (primaryUrl && !mediaFromMessages.some((m) => m.url === primaryUrl)) {
    const filename = compact(input.filename) || filenameFromUrl(primaryUrl);
    const mime = compact(input.mime_type || ctx?.media_data?.mime_type || "");
    const caption = compact(input.caption || input.description || lastCustomerText);
    mediaFromMessages.unshift({
      url: primaryUrl,
      filename,
      mime_type: mime,
      caption,
      role: inferAttachmentRole(filename, mime, caption),
    });
  }

  return { primaryUrl, mediaFromMessages };
}

function filenameFromUrl(fileUrl) {
  try {
    const base = new URL(fileUrl).pathname.split("/").pop();
    return base ? decodeURIComponent(base) : "archivo";
  } catch {
    return "archivo";
  }
}

/**
 * Fila canónica para order_draft.detail.rows (compatible build_odoo_order_note).
 */
function toDetailRow(raw) {
  if (!raw || typeof raw !== "object") return null;

  const numero = compact(raw.numero || raw.number || raw.dorsal || raw.n);
  const arqueroFromRaw =
    normalizeBoolean(raw.arquero || raw.ARQUERO) ||
    (!raw.pantaloneta && /arquer|porter/i.test(compact(raw.rol || raw.comentario || "")));

  let nombre = compact(raw.nombre || raw.name || raw.nombre_uniforme);
  const tallaEarly = compact(raw.talla || raw.size || raw.TALLA);
  const isUniformeRow =
    !normalizeBoolean(raw.pantaloneta) &&
    !normalizeBoolean(raw.camiseta) &&
    (normalizeBoolean(raw.uniforme) || raw.uniforme !== false);
  const intentionalBlankName = normalizeBoolean(raw.nombre_vacio_impresion);

  if (!nombre && arqueroFromRaw && numero) nombre = `Arquero #${numero}`;
  if (!nombre && arqueroFromRaw) nombre = "Arquero";
  if (!nombre && numero && normalizeBoolean(raw.camiseta)) nombre = `Camiseta #${numero}`;
  if (!nombre && intentionalBlankName && isUniformeRow && (numero || tallaEarly)) {
    nombre = "";
  }
  if (!nombre && !numero && !tallaEarly) return null;

  const talla = compact(raw.talla || raw.size || raw.TALLA);
  const manga = compact(raw.manga || raw.sleeve || raw["Larga/Corta"] || raw.manga_variante);
  const cantidadRaw = Number(raw.cantidad ?? raw.quantity ?? raw.qty ?? 1);
  const cantidad =
    Number.isFinite(cantidadRaw) && cantidadRaw > 0 ? Math.max(1, Math.round(cantidadRaw)) : 1;
  const manga_parts = Array.isArray(raw.manga_parts)
    ? raw.manga_parts
        .map((p) => ({
          manga: compact(p?.manga || "").toLowerCase() || "otra",
          qty: Math.max(1, Math.round(Number(p?.qty || 1))),
          raw: compact(p?.raw || "") || undefined,
        }))
        .filter((p) => p.qty > 0)
    : null;

  let grupo = compact(raw.grupo || raw.genero || raw.gender || raw.GENERO).toLowerCase();
  if (/fem|mujer/.test(grupo)) grupo = "femenino";
  else if (/masc|hombre|varon/.test(grupo)) grupo = "masculino";
  else if (!grupo && normalizeBoolean(raw.fem || raw.FEM)) grupo = "femenino";
  else if (!grupo && normalizeBoolean(raw.mas || raw.MAS)) grupo = "masculino";
  else if (!grupo) grupo = "general";

  const comentario = compact(raw.comentario || "");
  const pantaloneta =
    normalizeBoolean(raw.pantaloneta) ||
    isPantalonetaOnlyText(comentario, raw.rol, raw.nota_celda);

  let rol = compact(
    raw.rol || raw.role || raw.variante || raw.curso_equipo || raw.equipo || raw.grupo_detalle
  );
  if (pantaloneta) {
    const notes = comentario
      .split(" · ")
      .map((s) => s.trim())
      .filter((s) => s && !/^solo\s*pantaloneta$/i.test(s));
    const unique = [...new Set(notes)];
    rol = unique.length ? `Pantaloneta · ${unique.join(" · ")}` : "Pantaloneta";
  } else if (!rol) {
    const parts = [];
    if (normalizeBoolean(raw.camiseta)) parts.push("Camiseta");
    else if (normalizeBoolean(raw.uniforme) || raw.uniforme === undefined) {
      if (raw.uniforme !== false) parts.push("Uniforme");
    }
    if (cantidad > 1) parts.push(`×${cantidad}`);
    if (manga && /\d+\s*(LARGA|CORTA)/i.test(manga)) parts.push(manga);
    if (comentario) parts.push(comentario);
    rol = parts.join(" · ");
  } else if (comentario && !rol.includes(comentario)) {
    rol = `${rol} · ${comentario}`;
  }

  const arquero =
    !pantaloneta && (arqueroFromRaw || /arquer|porter/i.test(rol));

  return {
    person_id: compact(raw.person_id || raw.personId || "") || null,
    numero: numero || "",
    nombre,
    talla: talla || "",
    grupo,
    rol: rol || "",
    manga: manga || "",
    cantidad,
    manga_parts,
    arquero,
    camiseta: pantaloneta ? false : normalizeBoolean(raw.camiseta),
    uniforme: pantaloneta ? false : raw.uniforme !== false && !normalizeBoolean(raw.camiseta),
    pantaloneta,
    comentario,
    product_choice_hint: compact(raw.product_choice_hint || "") || null,
    registro:
      raw.registro && typeof raw.registro === "object" && Object.keys(raw.registro).length
        ? raw.registro
        : null,
    nombre_vacio_impresion: intentionalBlankName && !nombre,
    impresion_delantera: compact(raw.impresion_delantera || "") || null,
    impresion_trasera: compact(raw.impresion_trasera || "") || null,
    product_line_key: compact(raw.product_line_key || raw.section_key || "") || null,
    product_text: compact(raw.product_text || "") || null,
    garment_type: compact(raw.garment_type || "") || null,
    category: compact(raw.category || "") || null,
    variant_notes: compact(raw.variant_notes || "") || null,
  };
}

function componentTypeFromRow(row) {
  if (row.pantaloneta) return "pantaloneta";
  if (row.camiseta) return "camiseta";
  if (row.uniforme) return "uniforme_completo";
  return row.garment_type || "prenda";
}

function detailRowsToPeople(rows) {
  const people = [];
  const byId = new Map();
  (Array.isArray(rows) ? rows : []).forEach((raw, index) => {
    const row = toDetailRow(raw);
    if (!row) return;
    const personId = row.person_id || `row-${index + 1}`;
    let person = byId.get(personId);
    if (!person) {
      person = {
        person_id: personId,
        identity: {
          display_name: row.nombre || null,
          print_name: row.nombre || null,
          number: row.numero || null,
          group: row.grupo || "general",
        },
        components: [],
        comments: [],
      };
      byId.set(personId, person);
      people.push(person);
    }
    person.components.push({
      type: componentTypeFromRow(row),
      size: row.talla || null,
      sleeve: row.manga || null,
      goalkeeper: Boolean(row.arquero),
      product_line_key: row.product_line_key,
      product_text: row.product_text,
      garment_type: row.garment_type,
      category: row.category,
      variant_notes: row.variant_notes,
      printing: {
        front: row.impresion_delantera,
        back: row.impresion_trasera,
      },
      comment: row.comentario || null,
    });
    if (row.comentario && !person.comments.includes(row.comentario)) {
      person.comments.push(row.comentario);
    }
  });
  return people;
}

function peopleToDetailRows(people) {
  const rows = [];
  for (const person of Array.isArray(people) ? people : []) {
    const identity = person?.identity || {};
    const components = Array.isArray(person?.components) ? person.components : [];
    for (const component of components) {
      const type = compact(component?.type).toLowerCase();
      rows.push(
        toDetailRow({
          person_id: compact(person.person_id) || null,
          nombre: identity.print_name ?? identity.display_name,
          numero: identity.number,
          genero: identity.group,
          talla: component?.size,
          manga: component?.sleeve,
          arquero: component?.goalkeeper,
          camiseta: type === "camiseta" || type === "camiseta_sola",
          uniforme: type === "uniforme" || type === "uniforme_completo",
          pantaloneta: type === "pantaloneta",
          comentario: component?.comment || (person.comments || []).join(" · "),
          impresion_delantera: component?.printing?.front,
          impresion_trasera: component?.printing?.back,
          product_line_key: component?.product_line_key,
          product_text: component?.product_text,
          garment_type: component?.garment_type || type,
          category: component?.category,
          variant_notes: component?.variant_notes,
        })
      );
    }
  }
  return rows.filter(Boolean);
}

function buildDetailSummary(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return "Sin filas de lista organizadas.";
  }
  const masc = rows.filter((r) => r.grupo === "masculino").length;
  const fem = rows.filter((r) => r.grupo === "femenino").length;
  const general = rows.length - masc - fem;
  const parts = [`${rows.length} filas`];
  if (masc) parts.push(`${masc} M`);
  if (fem) parts.push(`${fem} F`);
  if (general) parts.push(`${general} general`);
  const missingTalla = rows.filter((r) => !r.talla).length;
  const missingNum = rows.filter((r) => !r.numero).length;
  if (missingTalla) parts.push(`${missingTalla} sin talla`);
  if (missingNum) parts.push(`${missingNum} sin número`);
  return parts.join(" · ");
}

function mergeAttachments(existing, incoming) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(out.map((a) => `${a.url}|${a.filename}`));
  for (const att of incoming || []) {
    const url = compact(att?.url);
    if (!url.startsWith("http")) continue;
    const key = `${url}|${compact(att.filename)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const caption = compact(att.caption || "");
    out.push({
      url,
      filename: compact(att.filename) || filenameFromUrl(url),
      mime_type: compact(att.mime_type) || null,
      caption: caption || undefined,
      role: att.role || inferAttachmentRole(att.filename, att.mime_type, caption),
      is_payment_proof: Boolean(att.is_payment_proof),
    });
  }
  return out;
}

function mergeDetailRows(existing, incoming, mode = "replace") {
  const oldRows = Array.isArray(existing) ? existing.map(toDetailRow).filter(Boolean) : [];
  const newRows = Array.isArray(incoming) ? incoming.map(toDetailRow).filter(Boolean) : [];
  if (mode === "append") {
    const key = (r) => `${r.numero}|${r.nombre}|${r.talla}`.toLowerCase();
    const seen = new Set(oldRows.map(key));
    const merged = [...oldRows];
    for (const row of newRows) {
      const k = key(row);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(row);
    }
    return merged;
  }
  return newRows.length ? newRows : oldRows;
}

function buildWarnings(rows) {
  const warnings = [];
  if (!rows.length) warnings.push("No hay filas en la lista.");
  rows.forEach((row, idx) => {
    if (!row.talla) warnings.push(`Fila ${idx + 1} (${row.nombre}): sin talla`);
    if (!row.numero) warnings.push(`Fila ${idx + 1} (${row.nombre}): sin número`);
  });
  return warnings;
}

function parseStatusFrom(rows, warnings) {
  if (!rows.length) return "needs_review";
  const critical = warnings.some((w) => /sin talla|sin número|No hay filas/i.test(w));
  if (critical && rows.length < 3) return "needs_review";
  if (warnings.length) return "partial";
  return "ok";
}

function patchOrderDraft(vars, patch) {
  const prev = vars?.order_draft || {};
  const detail = { ...(prev.detail || {}), ...(patch.detail || {}) };
  if (patch.detail?.rows) detail.rows = patch.detail.rows;
  return {
    ...prev,
    ...patch,
    detail,
    attachments: patch.attachments ?? prev.attachments ?? [],
    blockers: patch.blockers ?? prev.blockers ?? [],
  };
}

function serviceVars(name, status, now, fallback = null) {
  return {
    service: {
      last_call_name: name,
      last_call_status: status,
      last_call_at: now,
      fallback_message: fallback,
    },
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function fetchBinary(fileUrl) {
  const resp = await fetch(fileUrl);
  if (!resp.ok) throw new Error(`download_failed:${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}


/**
 * Kapso tool: clasificar-adjuntos-pedido
 */
async function classifyAttachmentRoleWithJev(env, { filename, mime_type, caption, context_text }) {
  const JEV_MODE = String(env?.LIFE_JEV_MODE || "off").toLowerCase().trim();
  const key = env?.OPENROUTER_API_KEY;

  if (JEV_MODE === "off" || !key) {
    return null;
  }

  const questions = {
    attachment_role: {
      type: "choice",
      instructions:
        "¿Cuál es la naturaleza y propósito comercial de este archivo o imagen enviado por el cliente a Life Deportes según el texto que lo acompaña, nombre de archivo o contexto?",
      criteria: {
        payment_receipt:
          "Comprobante de transferencia bancaria, recibo de consignación, soporte de Nequi/Daviplata/Bancolombia/Davivienda/Bre-B o confirmación de pago.",
        size_roster:
          "Foto de lista, cuaderno o planilla con nombres, números de dorsal y tallas de las prendas para confección.",
        design_reference:
          "Foto de camiseta, boceto deportivo, escudo, logo de patrocinador, uniforme o paleta de colores.",
        other: "Sticker, foto personal irrelevante o documento no comercial.",
      },
    },
    is_payment_proof: {
      type: "choice",
      instructions: "¿El archivo o el mensaje que lo acompaña certifica explícitamente el pago, abono o transferencia de dinero?",
      criteria: {
        yes: "Es un soporte o confirmación de pago / transferencia bancaria.",
        no: "No es un comprobante de pago.",
      },
    },
  };

  const state = {
    filename: filename || null,
    mime_type: mime_type || null,
    caption: caption || null,
    context: context_text ? String(context_text).slice(0, 1000) : null,
  };

  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);

  try {
    const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "typesafe/jev-1.13",
        state,
        questions,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      return { ok: false, mode: JEV_MODE, reason: `http_${res.status}`, latencyMs };
    }

    const data = await res.json();
    const answers = data?.answers || {};
    const roleChoice = answers.attachment_role?.choice || "other";
    const confidence = Number(answers.attachment_role?.confidence || 0);
    const isPaymentChoice = answers.is_payment_proof?.choice || "no";

    return {
      ok: true,
      mode: JEV_MODE,
      role: roleChoice === "size_roster" ? "detail_list" : roleChoice,
      is_payment_proof: isPaymentChoice === "yes" || roleChoice === "payment_receipt",
      confidence,
      latencyMs,
    };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, mode: JEV_MODE, reason: err?.message || "jev_timeout_or_network", latencyMs: Date.now() - t0 };
  }
}

function suggestTools(attachments) {
  const tools = [];
  const hasPayment = attachments.some(
    (a) => a.role === "payment_receipt" || a.is_payment_proof
  );
  const hasListFile = attachments.some(
    (a) =>
      a.role === "detail_list" &&
      /\.(xlsx|xls|docx)|spreadsheet|wordprocessing/i.test(`${a.filename || ""}${a.mime_type || ""}`)
  );
  const hasListImage = attachments.some(
    (a) => a.role === "detail_list" && /\.(jpe?g|png|webp|pdf)$/i.test(a.filename || "")
  );
  const hasDesign = attachments.some((a) => a.role === "design_reference");

  if (hasPayment) tools.push("notificar_interes_ventas");
  if (hasListFile) tools.push("parsear_lista_excel_pedido");
  if (hasListImage) tools.push("parsear_lista_imagen_pedido");
  if (attachments.length) tools.push("registrar_adjuntos_pedido");
  if (hasDesign && !hasListFile && !hasListImage) tools.push("registrar_adjuntos_pedido");

  return [...new Set(tools)];
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || body?.vars || {};
  const now = new Date().toISOString();

  const { mediaFromMessages } = pickMediaFromContext(body);
  const rawAttachments = mergeAttachments(vars?.order_draft?.attachments, mediaFromMessages);

  const JEV_MODE = String(env?.LIFE_JEV_MODE || "off").toLowerCase().trim();
  const classifiedAttachments = [];
  let jevDecisionLog = null;

  for (const att of rawAttachments) {
    const jevRes = await classifyAttachmentRoleWithJev(env, {
      filename: att.filename,
      mime_type: att.mime_type,
      caption: att.caption,
      context_text: body?.input?.text || vars?.last_user_input || "",
    });

    if (jevRes && jevRes.ok) {
      jevDecisionLog = jevRes;
      if (JEV_MODE === "on") {
        att.role = jevRes.role;
        att.is_payment_proof = jevRes.is_payment_proof;
        att.confidence = jevRes.confidence;
      } else if (JEV_MODE === "shadow") {
        att.jev_shadow = { role: jevRes.role, is_payment_proof: jevRes.is_payment_proof, confidence: jevRes.confidence };
      }
    }
    classifiedAttachments.push(att);
  }

  const suggested_tools = suggestTools(classifiedAttachments);
  const order_draft = patchOrderDraft(vars, { attachments: classifiedAttachments });

  const paymentReceipt = classifiedAttachments.find((a) => a.role === "payment_receipt" || a.is_payment_proof);
  const quotePatch = { ...(vars?.quote || {}) };
  if (paymentReceipt) {
    quotePatch.payment_receipt_detected = true;
    quotePatch.payment_receipt_url = paymentReceipt.url;
    quotePatch.status = quotePatch.status || "pago_recibido_pendiente_verificar";
  }

  return jsonResponse({
    ok: true,
    attachment_count: classifiedAttachments.length,
    attachments: classifiedAttachments,
    payment_receipt_detected: Boolean(paymentReceipt),
    payment_receipt_url: paymentReceipt?.url || null,
    suggested_tools,
    jev: jevDecisionLog,
    vars: {
      order_draft,
      quote: quotePatch,
      ...serviceVars("clasificar_adjuntos_pedido", "ready", now, null),
    },
  });
}


