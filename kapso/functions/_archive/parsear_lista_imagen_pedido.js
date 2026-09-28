// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: parsear-lista-imagen-pedido  id: ca5b89c4-1fce-4bc5-9f63-93ca448b89e9
// ultimo deploy: 2026-07-10T21:31:22-04:00  status: deployed
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
 * Secciones de lista staff (ej. PRESEAS): chaquetas papás, camisetas papás, uniformes.
 */

const SECTION_SPECS = [
  {
    key: "chaqueta",
    test: (t) => /chaqueta/i.test(t),
    product_text: "Chaqueta Rompevientos",
    variant_notes: "con forro",
    garment_type: "chaqueta",
    rol: "Chaqueta",
    uniforme: false,
    camiseta: false,
    category: "otros",
  },
  {
    key: "camiseta_papas",
    test: (t) => /camiseta/i.test(t) && /pap[aá]s?|padre|mam[aá]/i.test(t),
    product_text: "Camiseta deportiva dry-fit",
    commercial_group_key: "camiseta_deportiva",
    garment_type: "camiseta_sola",
    rol: "Camiseta papás",
    uniforme: false,
    camiseta: true,
    category: "camiseta",
  },
  {
    key: "camiseta_profe",
    test: (t) => /camiseta/i.test(t) && /profe|coach/i.test(t),
    product_text: "Camiseta deportiva dry-fit",
    commercial_group_key: "camiseta_deportiva",
    imprint_note: "COACH · sin dorsal",
    garment_type: "camiseta_sola",
    rol: "Camiseta profe",
    uniforme: false,
    camiseta: true,
    category: "camiseta",
  },
  {
    key: "uniforme",
    test: (t) => /uniforme/i.test(t),
    product_text: "Uniforme de Fútbol",
    garment_type: "uniforme_completo",
    rol: "Uniforme",
    uniforme: true,
    camiseta: false,
    category: "uniforme",
  },
];

/**
 * Detecta encabezado de bloque en texto lista (termina en «:» o línea corta sin dorsal).
 */
function detectListSectionHeader(line) {
  const trimmed = compact(line);
  if (!trimmed) return null;
  if (/^\d{1,3}\s*[.)-]\s+\S/.test(trimmed)) return null;

  const label = trimmed.replace(/^\*+|\*+$/g, "").replace(/:+$/, "").trim();
  if (!label || label.length > 72) return null;

  const t = label.toLowerCase();
  if (!/chaqueta|camiseta|uniforme|profe|coach|pap[aá]/i.test(t)) {
    if (!/:$/.test(trimmed)) return null;
  }

  for (const spec of SECTION_SPECS) {
    if (spec.test(t)) {
      return { ...spec };
    }
  }
  return null;
}

function productLineKeyFromRow(row) {
  return compact(row?.product_line_key || row?.section_key || "");
}

function defaultProductTextForRow(row) {
  if (compact(row?.product_text)) return compact(row.product_text);
  const key = productLineKeyFromRow(row);
  const spec = SECTION_SPECS.find((s) => s.key === key);
  if (spec) return spec.product_text;
  if (row?.camiseta && !row?.uniforme) return "Camiseta deportiva dry-fit";
  if (row?.uniforme !== false && !row?.camiseta) return "Uniforme de Fútbol";
  return "Uniforme de Fútbol";
}

/**
 * Agrupa filas en líneas comerciales distintas (una por producto).
 */
function commercialLineKeyForRow(raw) {
  const lineKey = productLineKeyFromRow(raw);
  const spec = SECTION_SPECS.find((s) => s.key === lineKey);
  return compact(raw?.commercial_group_key || spec?.commercial_group_key || lineKey || "");
}

function inferCommercialLinesFromDetailRows(rows) {
  const groups = new Map();
  for (const raw of rows || []) {
    const productText = defaultProductTextForRow(raw);
    const lineKey = productLineKeyFromRow(raw);
    const spec = SECTION_SPECS.find((s) => s.key === lineKey);
    const key = commercialLineKeyForRow(raw) || productText;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: productText,
        product_text: productText,
        quantity: 0,
        garment_type: raw.garment_type || spec?.garment_type || null,
        variant_notes: compact(raw.variant_notes || spec?.variant_notes || "") || null,
        category:
          raw.category ||
          spec?.category ||
          (raw.camiseta ? "camiseta" : raw.uniforme !== false ? "uniforme" : "otros"),
      });
    }
    groups.get(key).quantity += 1;
  }
  return [...groups.values()].filter((g) => g.quantity > 0);
}

function hasMultipleProductLines(rows) {
  const keys = new Set();
  for (const row of rows || []) {
    keys.add(commercialLineKeyForRow(row) || defaultProductTextForRow(row));
  }
  return keys.size > 1;
}


/**
 * Parseo determinístico de lista de jugadores desde texto libre o JSON de visión.
 */

function splitListParts(raw) {
  if (raw.includes("·")) {
    return raw.split(/\s*·\s*/).map(compact).filter(Boolean);
  }
  return raw
    .split(/\s*(?:,|;|\||\/| - | – | — |\t)\s*/)
    .map(compact)
    .filter(Boolean);
}

function parseLine(line, section = null) {
  const raw = compact(line).replace(/^\d{1,3}\s*[.)-]\s+/, "");
  if (!raw) return null;
  if (/^(lista|advertencias?)\b/i.test(raw)) return null;

  let parts = splitListParts(raw);
  if (parts.length === 1) {
    const tokens = raw.split(/\s+/).filter(Boolean);
    if (tokens.length >= 3) parts = tokens;
  }

  const parsed = {
    nombre_uniforme: null,
    talla: null,
    numero: null,
    manga: null,
    genero: null,
    camiseta: section?.camiseta ?? false,
    uniforme: section?.uniforme ?? true,
    arquero: false,
    comentario: null,
    rol: section?.rol || null,
    product_line_key: section?.key || null,
    product_text: section?.product_text || null,
    garment_type: section?.garment_type || null,
    category: section?.category || null,
    variant_notes: section?.variant_notes || null,
    raw_text: raw,
  };

  const first = parts[0] || raw;
  if (
    parts.length >= 3 &&
    /^(xs|s|m|l|xl|2xl|3xl|4xl|\d{1,2})$/i.test(parts[1]) &&
    /^#?\d{1,3}$/.test(parts[2])
  ) {
    parsed.nombre_uniforme = first;
    parsed.talla = parts[1].toUpperCase();
    parsed.numero = parts[2].replace("#", "");
    for (const part of parts.slice(3)) applyTailToken(parsed, part);
    if (section?.imprint_note && !parsed.numero) {
      parsed.comentario = parsed.comentario
        ? `${section.imprint_note} · ${parsed.comentario}`
        : section.imprint_note;
    }
    return parsed;
  }

  parsed.nombre_uniforme = first;

  for (const part of parts.slice(1)) {
    if (!parsed.numero && /^#\s*([oO]?\d{1,3}|sin\s+dorsal)$/i.test(part)) {
      const m = part.match(/^#\s*(.+)$/i);
      const val = compact(m?.[1] || "");
      if (!/^sin\s+dorsal$/i.test(val)) parsed.numero = val.replace(/^[oO]/, "");
      continue;
    }
    if (!parsed.talla && /^(xs|s|m|l|xl|2xl|3xl|4xl|\d{1,2})$/i.test(part)) {
      parsed.talla = part.toUpperCase();
      continue;
    }
    if (!parsed.numero && /^#?\d{1,3}$/.test(part)) {
      parsed.numero = part.replace("#", "");
      continue;
    }
    if (/^sin\s+dorsal$/i.test(part)) continue;
    const tallaColor = part.match(/^([A-Za-z0-9\-]+)\s*\(([^)]+)\)\s*(.*)$/);
    if (tallaColor && !parsed.talla) {
      parsed.talla = tallaColor[1].toUpperCase();
      const note = compact(tallaColor[2]);
      if (note) parsed.comentario = parsed.comentario ? `${parsed.comentario}; ${note}` : note;
      if (/(arquer|porter)/i.test(tallaColor[3] || "")) parsed.arquero = true;
      continue;
    }
    applyTailToken(parsed, part);
  }

  if (!parsed.nombre_uniforme) return null;
  if (section?.imprint_note && !parsed.numero) {
    parsed.comentario = parsed.comentario
      ? `${section.imprint_note} · ${parsed.comentario}`
      : section.imprint_note;
  }
  return parsed;
}

function applyTailToken(parsed, part) {
  if (!parsed.manga && /(larga|corta|sisa|normal)/i.test(part)) {
    if (/larga/i.test(part)) parsed.manga = "larga";
    else if (/sisa/i.test(part)) parsed.manga = "sisa";
    else if (/corta/i.test(part)) parsed.manga = "corta";
    else parsed.manga = "normal";
    return;
  }
  if (!parsed.genero && /(masculino|hombre|mas\b|femenino|mujer|fem\b)/i.test(part)) {
    parsed.genero = /(femenino|mujer|fem\b)/i.test(part) ? "femenino" : "masculino";
    return;
  }
  if (/(arquer|porter)/i.test(part)) {
    parsed.arquero = true;
    const numInPart = part.match(/\b(\d{1,3})\b/);
    if (!parsed.numero && numInPart) parsed.numero = numInPart[1];
    return;
  }
  const colorMatch = part.match(/^\(([^)]+)\)\s*(.*)$/);
  if (colorMatch) {
    const note = compact(colorMatch[1]);
    if (note) parsed.comentario = parsed.comentario ? `${parsed.comentario}; ${note}` : note;
    if (/(arquer|porter)/i.test(colorMatch[2] || "")) parsed.arquero = true;
    return;
  }
  parsed.comentario = parsed.comentario ? `${parsed.comentario}; ${part}` : part;
}

function normalizeRawRow(row) {
  if (!row || typeof row !== "object") return null;
  const nombre = compact(
    row.nombre_uniforme || row.nombre || row.name || row["NOMBRE EN UNIFORME"] || row.NOMBRE
  );
  if (!nombre) return null;

  const generoRaw = compact(row.genero || row.GENERO || row.grupo || "");
  const mas = normalizeBoolean(row.mas || row.MAS);
  const fem = normalizeBoolean(row.fem || row.FEM);

  return {
    nombre_uniforme: nombre,
    talla: compact(row.talla || row.TALLA || row.size || "") || null,
    numero: compact(row.numero || row.NUMERO || row.number || row.dorsal || "") || null,
    manga: compact(row.manga || row["Larga/Corta"] || row.MANGA || row.sleeve || "") || null,
    genero:
      generoRaw.toLowerCase() || (fem ? "femenino" : mas ? "masculino" : null),
    arquero: normalizeBoolean(row.arquero || row.ARQUERO),
    rol: compact(row.rol || row.role || row.variante || "") || null,
    product_line_key: row.product_line_key || null,
    product_text: row.product_text || null,
    garment_type: row.garment_type || null,
    category: row.category || null,
    camiseta: row.camiseta,
    uniforme: row.uniforme,
  };
}

function extractJsonArrayFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;

  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.rows)) return parsed.rows;
    if (Array.isArray(parsed?.detail_rows)) return parsed.detail_rows;
  } catch {
    /* try bracket slice */
  }

  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function buildLinesFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];

  const jsonRows = extractJsonArrayFromText(raw);
  if (jsonRows) {
    return jsonRows.map(normalizeRawRow).filter(Boolean).map(toDetailRow).filter(Boolean);
  }

  const rows = [];
  let section = null;

  for (const line of raw.split(/\n+/)) {
    const trimmed = compact(line);
    if (!trimmed) continue;
    if (/^\*\*.*\*\*$/.test(trimmed) && !/^\d/.test(trimmed)) continue;

    const header = detectListSectionHeader(trimmed);
    if (header) {
      section = header;
      continue;
    }

    const parsed = parseLine(trimmed, section);
    if (!parsed) continue;

    const detail = toDetailRow({
      nombre_uniforme: parsed.nombre_uniforme,
      talla: parsed.talla,
      numero: parsed.numero,
      manga: parsed.manga,
      genero: parsed.genero,
      arquero: parsed.arquero,
      camiseta: parsed.camiseta,
      uniforme: parsed.uniforme,
      rol: parsed.rol || parsed.comentario,
      comentario: parsed.comentario,
      product_line_key: parsed.product_line_key,
      product_text: parsed.product_text,
      garment_type: parsed.garment_type,
      category: parsed.category,
      variant_notes: parsed.variant_notes,
    });
    if (detail) rows.push(detail);
  }

  return rows;
}

function parseTextList(input) {
  const text = String(input.text || input.raw_text || input.vision_text || "").trim();
  const source = compact(input.source || "text").toLowerCase();
  const rows = buildLinesFromText(text);
  return {
    ok: rows.length > 0,
    rows,
    source: source === "image_vision" ? "image_vision" : "text",
    error: rows.length ? null : "no_rows_parsed",
  };
}


/**
 * Fusión y validación de order_draft.detail vs quote comercial.
 */

function countExpectedQuantity(vars) {
  const commercial = vars?.order_draft?.commercial?.lines;
  if (Array.isArray(commercial) && commercial.length) {
    return commercial.reduce(
      (sum, line) => sum + Math.max(0, Number(line.quantity || line.qty || 0)),
      0
    );
  }
  return Math.max(0, Number(vars?.quote?.quantity || 0));
}

function mergeOrderDetailDraft(vars, options = {}) {
  const orderDraft = vars?.order_draft || {};
  const mode = options.mode || "replace";
  const incomingRows =
    options.rows ||
    (options.people ? peopleToDetailRows(options.people) : null) ||
    orderDraft.detail?.rows ||
    (orderDraft.detail?.people ? peopleToDetailRows(orderDraft.detail.people) : []);
  const rows = mergeDetailRows(orderDraft.detail?.rows, incomingRows, mode);
  const people = detailRowsToPeople(rows);
  const warnings = buildWarnings(rows);
  if (hasMultipleProductLines(rows)) {
    warnings.push(
      "Lista con varios productos (secciones). Revise líneas comerciales: chaquetas, camisetas y uniformes por separado."
    );
  }
  const expected = countExpectedQuantity(vars);
  if (expected > 0 && rows.length > 0) {
    const delta = Math.abs(rows.length - expected);
    if (delta > Math.max(2, Math.floor(expected * 0.15))) {
      warnings.push(
        `Conteo lista (${rows.length}) difiere de cantidad comercial (${expected}).`
      );
    }
  }

  const blockers = [...(orderDraft.blockers || [])];
  if (parseStatusFrom(rows, warnings) === "needs_review" && !rows.length) {
    if (!blockers.includes("Falta lista de jugadores (Excel, texto o imagen).")) {
      blockers.push("Falta lista de jugadores (Excel, texto o imagen).");
    }
  }

  const detail = {
    ...(orderDraft.detail || {}),
    schema_version: "life_order_people_v1",
    people,
    person_count: people.length,
    rows,
    row_count: rows.length,
    warnings,
    summary_text: buildDetailSummary(rows),
    parse_status: parseStatusFrom(rows, warnings),
    parsed_at: options.now || new Date().toISOString(),
    source: options.source || orderDraft.detail?.source || null,
  };

  const order_draft = {
    ...orderDraft,
    detail,
    blockers,
  };

  if (hasMultipleProductLines(rows)) {
    order_draft.commercial = {
      ...(orderDraft.commercial || {}),
      lines: inferCommercialLinesFromDetailRows(rows),
      multi_product: true,
    };
  }

  return {
    order_draft,
    detail,
    warnings,
    commercial_lines: order_draft.commercial?.lines || null,
  };
}


/**
 * Kapso tool: parsear-lista-imagen-pedido
 * Recibe vision_text (salida de ask_about_file) o devuelve instrucción fija.
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role !== "staff") {
    return jsonResponse({ ok: false, error: "staff_only" }, 403);
  }

  const { primaryUrl, mediaFromMessages } = pickMediaFromContext(body);
  const fileUrl = compact(input.file_url || primaryUrl);
  const visionText = compact(input.vision_text || input.text || "");

  if (!visionText) {
    return jsonResponse({
      ok: false,
      status: "needs_vision",
      error: "needs_vision",
      fixed_question: FIXED_IMAGE_LIST_QUESTION,
      file_url: fileUrl || null,
      message:
        "Llama ask_about_file con fixed_question, luego reinvoca con vision_text.",
      vars: serviceVars("parsear_lista_imagen_pedido", "pending", now, null),
    });
  }

  const parsed = parseTextList({ text: visionText, source: "image_vision" });
  if (!parsed.ok) {
    return jsonResponse({
      ok: false,
      error: parsed.error,
      fixed_question: FIXED_IMAGE_LIST_QUESTION,
      vars: serviceVars(
        "parsear_lista_imagen_pedido",
        "error",
        now,
        "No pude estructurar la imagen. Repita ask_about_file o envíe Excel."
      ),
    });
  }

  const merged = mergeOrderDetailDraft(vars, {
    rows: parsed.rows,
    source: "image_vision",
    mode: input.merge_mode === "append" ? "append" : "replace",
    now,
  });

  const attachments = fileUrl
    ? mergeAttachments(vars?.order_draft?.attachments, [
        {
          url: fileUrl,
          filename:
            compact(input.filename) ||
            mediaFromMessages.find((m) => m.url === fileUrl)?.filename ||
            filenameFromUrl(fileUrl),
          mime_type: compact(input.mime_type || "image/jpeg"),
          role: "detail_list",
        },
      ])
    : vars?.order_draft?.attachments || [];

  const order_draft = patchOrderDraft(vars, {
    ...merged.order_draft,
    attachments,
  });

  return jsonResponse({
    ok: true,
    status: merged.detail.parse_status,
    row_count: parsed.rows.length,
    summary_text: merged.detail.summary_text,
    warnings: merged.warnings,
    vars: {
      order_draft,
      ...serviceVars("parsear_lista_imagen_pedido", "ready", now, null),
    },
  });
}


