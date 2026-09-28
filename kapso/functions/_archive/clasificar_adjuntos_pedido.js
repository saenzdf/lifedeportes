// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: clasificar-adjuntos-pedido  id: 69b09b3e-213e-4871-8bcb-3ac0eff31e0b
// ultimo deploy: 2026-07-10T21:31:11-04:00  status: deployed
// motivo: tool del agente staff (Hermes + repo local)
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

/**
 * Utilidades compartidas — parse lista pedido staff (tools internas agente).
 */

const FIXED_IMAGE_LIST_QUESTION =
  "Extrae SOLO un JSON array de objetos con keys: numero, nombre, talla, manga, genero (masculino|femenino), arquero (true|false). Sin markdown ni texto extra.";

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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

function inferAttachmentRole(filename, mimeType = "") {
  const name = compact(filename).toLowerCase();
  const mime = compact(mimeType).toLowerCase();

  if (/\.(xlsx|xlsm|xltx|xls|csv)$/i.test(name) || mime.includes("spreadsheet") || mime.includes("excel")) {
    return "detail_list";
  }
  if (/\.docx$/i.test(name) || mime.includes("wordprocessingml")) {
    return "detail_list";
  }
  if (
    /lista|tallas|formato|pedido|nomin|jugador|alumno|roster|plantel/i.test(name) &&
    /\.(jpe?g|png|webp|pdf)$/i.test(name)
  ) {
    return "detail_list";
  }
  if (/referencia|diseno|diseño|mockup|logo|arte|wildcat|hub/i.test(name)) {
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
  const vars = body?.execution_context?.vars || {};
  const ctx = body?.whatsapp_context || {};
  const messages = Array.isArray(ctx.messages) ? ctx.messages : [];

  const inbound = [...messages].reverse().filter((m) => m.direction === "inbound");
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
    mediaFromMessages.push({ url, filename, mime_type: mime, role: inferAttachmentRole(filename, mime) });
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
    mediaFromMessages.unshift({
      url: primaryUrl,
      filename,
      mime_type: mime,
      role: inferAttachmentRole(filename, mime),
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
    arquero,
    camiseta: pantaloneta ? false : normalizeBoolean(raw.camiseta),
    uniforme: pantaloneta ? false : raw.uniforme !== false && !normalizeBoolean(raw.camiseta),
    pantaloneta,
    comentario,
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
    return "Sin filas de lista parseadas.";
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
    out.push({
      url,
      filename: compact(att.filename) || filenameFromUrl(url),
      mime_type: compact(att.mime_type) || null,
      role: att.role || inferAttachmentRole(att.filename, att.mime_type),
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
function suggestTools(attachments) {
  const tools = [];
  const hasListFile = attachments.some(
    (a) =>
      a.role === "detail_list" &&
      /\.(xlsx|xls|docx)|spreadsheet|wordprocessing/i.test(`${a.filename || ""}${a.mime_type || ""}`)
  );
  const hasListImage = attachments.some((a) => a.role === "detail_list" && /\.(jpe?g|png|webp|pdf)$/i.test(a.filename || ""));
  const hasDesign = attachments.some((a) => a.role === "design_reference");

  if (hasListFile) tools.push("parsear_lista_excel_pedido");
  if (hasListImage) tools.push("parsear_lista_imagen_pedido");
  if (attachments.length) tools.push("registrar_adjuntos_pedido");
  if (hasDesign && !hasListFile && !hasListImage) tools.push("registrar_adjuntos_pedido");

  return [...new Set(tools)];
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role !== "staff") {
    return jsonResponse({ ok: false, error: "staff_only" }, 403);
  }

  const { mediaFromMessages } = pickMediaFromContext(body);
  const attachments = mergeAttachments(vars?.order_draft?.attachments, mediaFromMessages);
  const suggested_tools = suggestTools(attachments);

  const order_draft = patchOrderDraft(vars, { attachments });

  return jsonResponse({
    ok: true,
    attachment_count: attachments.length,
    attachments,
    suggested_tools,
    vars: {
      order_draft,
      ...serviceVars("clasificar_adjuntos_pedido", "ready", now, null),
    },
  });
}


