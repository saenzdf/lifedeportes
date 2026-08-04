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
 * Búsqueda de res.partner por teléfono WhatsApp (Odoo 19 prod).
 * Usar phone_sanitized / phone_mobile_search; phone visible suele tener espacios.
 */


function normalizeWaPhone(raw) {
  const digits = digitsOnly(raw);
  if (!digits) {
    return { e164Plus: null, e164Digits: null, local10: null, raw: String(raw ?? "").trim() };
  }

  let national = digits;
  if (digits.startsWith("57") && digits.length >= 12) {
    national = digits.slice(-10);
  } else if (digits.length >= 10) {
    national = digits.slice(-10);
  } else {
    return { e164Plus: null, e164Digits: null, local10: null, raw: String(raw ?? "").trim() };
  }

  return {
    e164Plus: `+57${national}`,
    e164Digits: `57${national}`,
    local10: national,
    raw: String(raw ?? "").trim(),
  };
}

const ACTIVE_PARTNER = ["active", "=", true];

function partnerSearchDomains(normalized) {
  if (!normalized?.e164Plus) return [];
  const { e164Plus, e164Digits, local10 } = normalized;
  return [
    { strategy: "phone_sanitized", domain: [ACTIVE_PARTNER, ["phone_sanitized", "=", e164Plus]] },
    { strategy: "phone_mobile_search_plus", domain: [ACTIVE_PARTNER, ["phone_mobile_search", "=", e164Plus]] },
    { strategy: "phone_mobile_search_digits", domain: [ACTIVE_PARTNER, ["phone_mobile_search", "=", e164Digits]] },
    { strategy: "phone_exact_digits", domain: [ACTIVE_PARTNER, ["phone", "=", e164Digits]] },
    { strategy: "phone_ilike_local10", domain: [ACTIVE_PARTNER, ["phone", "ilike", local10]] },
  ];
}

function mergePartnerCandidates(existing, rows) {
  const seen = new Set(existing.map((row) => row.id));
  const merged = [...existing];
  for (const row of rows || []) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

function pickPartnerByLatestOrder(candidates, orders) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const orderList = Array.isArray(orders) ? orders : [];
  for (const order of orderList) {
    const partnerId = Array.isArray(order?.partner_id) ? order.partner_id[0] : order?.partner_id;
    const hit = candidates.find((candidate) => candidate.id === partnerId);
    if (hit) return hit;
  }

  return [...candidates].sort((a, b) => a.id - b.id)[0];
}

/**
 * @param {(model: string, method: string, args: unknown[], kw?: object) => Promise<unknown>} executeKw
 */
async function findPartnerByWaPhone(executeKw, rawPhone, options = {}) {
  const normalized = normalizeWaPhone(rawPhone);
  if (!normalized.e164Plus) {
    return {
      partner: null,
      normalized,
      match_strategy: null,
      ambiguous: false,
      candidates: [],
    };
  }

  const fields = options.fields || ["id", "name", "phone", "phone_sanitized"];
  let candidates = [];
  let match_strategy = null;

  for (const { strategy, domain } of partnerSearchDomains(normalized)) {
    const rows = await executeKw("res.partner", "search_read", [domain], {
      fields,
      limit: options.limit || 10,
    });
    const before = candidates.length;
    candidates = mergePartnerCandidates(candidates, rows);
    if (candidates.length === 1 && before === 0) {
      match_strategy = strategy;
      return {
        partner: candidates[0],
        normalized,
        match_strategy,
        ambiguous: false,
        candidates: summarizeCandidates(candidates),
      };
    }
    if (candidates.length > 0 && !match_strategy) {
      match_strategy = strategy;
    }
  }

  if (candidates.length === 0) {
    return {
      partner: null,
      normalized,
      match_strategy: null,
      ambiguous: false,
      candidates: [],
    };
  }

  if (candidates.length === 1) {
    return {
      partner: candidates[0],
      normalized,
      match_strategy,
      ambiguous: false,
      candidates: summarizeCandidates(candidates),
    };
  }

  const ids = candidates.map((candidate) => candidate.id);
  const saleOrders = await executeKw(
    "sale.order",
    "search_read",
    [[["partner_id", "in", ids]]],
    {
      fields: ["id", "name", "partner_id", "date_order", "state"],
      order: "date_order desc, id desc",
      limit: 50,
    }
  );

  const partner = pickPartnerByLatestOrder(candidates, saleOrders);
  return {
    partner,
    normalized,
    match_strategy: "disambiguate_latest_order",
    ambiguous: true,
    candidates: summarizeCandidates(candidates),
    chosen_partner_id: partner?.id || null,
  };
}

function summarizeCandidates(candidates) {
  return (candidates || []).map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    phone: candidate.phone || null,
    phone_sanitized: candidate.phone_sanitized || null,
  }));
}

function partnerCreateVals(displayName, normalized, extra = {}) {
  return {
    name: displayName,
    phone: normalized?.e164Plus || false,
    comment: extra.comment || false,
  };
}

function nameSearchTerms(rawName) {
  const name = String(rawName ?? "").trim();
  if (!name) return [];
  const terms = [name];
  const preseas = name.match(/preseas\s*#?\s*(\d+)/i);
  if (preseas) {
    terms.push(`PRESEAS ${preseas[1]}`);
    terms.push(`PRESEAS #${preseas[1]}`);
    terms.push("PRESEAS");
  }
  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
}

/**
 * @param {(model: string, method: string, args: unknown[], kw?: object) => Promise<unknown>} executeKw
 */
async function findPartnerByName(executeKw, rawName, options = {}) {
  const terms = nameSearchTerms(rawName);
  if (!terms.length) {
    return {
      partner: null,
      match_strategy: null,
      ambiguous: false,
      candidates: [],
    };
  }

  const fields = options.fields || ["id", "name", "phone", "phone_sanitized"];
  let candidates = [];
  let match_strategy = null;

  for (const term of terms) {
    const rows = await executeKw(
      "res.partner",
      "search_read",
      [[ACTIVE_PARTNER, ["name", "ilike", term]]],
      { fields, limit: options.limit || 10 }
    );
    const before = candidates.length;
    candidates = mergePartnerCandidates(candidates, rows);
    if (candidates.length === 1 && before === 0) {
      match_strategy = `name_ilike:${term}`;
      return {
        partner: candidates[0],
        match_strategy,
        ambiguous: false,
        candidates: summarizeCandidates(candidates),
      };
    }
    if (candidates.length > 0 && !match_strategy) {
      match_strategy = `name_ilike:${term}`;
    }
  }

  if (candidates.length === 0) {
    return {
      partner: null,
      match_strategy: null,
      ambiguous: false,
      candidates: [],
    };
  }

  if (candidates.length === 1) {
    return {
      partner: candidates[0],
      match_strategy,
      ambiguous: false,
      candidates: summarizeCandidates(candidates),
    };
  }

  const ids = candidates.map((candidate) => candidate.id);
  const saleOrders = await executeKw(
    "sale.order",
    "search_read",
    [[["partner_id", "in", ids]]],
    {
      fields: ["id", "name", "partner_id", "date_order", "state"],
      order: "date_order desc, id desc",
      limit: 50,
    }
  );

  const partner = pickPartnerByLatestOrder(candidates, saleOrders);
  return {
    partner,
    match_strategy: "disambiguate_latest_order_by_name",
    ambiguous: true,
    candidates: summarizeCandidates(candidates),
    chosen_partner_id: partner?.id || null,
  };
}


/**
 * HTML para sale.order.note y project.task.description (sin cliente ni precios).
 * Usado en build-quote-payload y odoo-create-lead-and-so.
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


function normalizeMangaGroup(manga) {
  const m = compact(manga).toLowerCase();
  const hasLarga = /larga/.test(m);
  const hasCorta = /corta|sisa/.test(m);
  if (hasLarga && hasCorta) return "mixta";
  if (hasLarga) return "larga";
  if (hasCorta) return "corta";
  return "otra";
}

/** Unidades por tipo de manga desde cantidad / «2 LARGA+1 CORTA». */
function unitPartsForRow(raw) {
  const row = toDetailRow(raw) || raw;
  if (Array.isArray(row?.manga_parts) && row.manga_parts.length) {
    return row.manga_parts.map((p) => ({
      manga: compact(p.manga).toLowerCase() || "otra",
      qty: Math.max(1, Number(p.qty) || 1),
    }));
  }
  const qty = Math.max(1, Number(row?.cantidad || raw?.cantidad || 1) || 1);
  const g = normalizeMangaGroup(raw?.manga || row?.manga);
  if (g === "mixta") return [{ manga: "mixta", qty }];
  return [{ manga: g === "otra" ? "otra" : g, qty }];
}

/** Quita manga duplicada del rol cuando la tabla ya va agrupada por manga. */
function stripMangaFromRol(rolVariante) {
  return compact(rolVariante)
    .split(" · ")
    .filter(
      (p) =>
        p &&
        !/^(corta|larga|manga\s*cort|manga\s*larg|sisa)$/i.test(p.trim()) &&
        !/^manga\s/i.test(p) &&
        !/^\d+\s*LARGA(\s*\+\s*\d+\s*CORTA)?$/i.test(p.trim()) &&
        !/^\d+\s*CORTA$/i.test(p.trim())
    )
    .join(" · ");
}

/** Quita etiqueta de producto cuando el título de tabla ya dice Uniforme/Camiseta. */
function stripProductFromRol(rolVariante) {
  return compact(rolVariante)
    .split(" · ")
    .filter((p) => p && !/^(uniforme|camiseta|conjunto)$/i.test(p.trim()))
    .join(" · ");
}

/**
 * Tipo de prenda para agrupar tablas: uniforme (conjunto) | camiseta | pantaloneta | otro.
 */
function productKindFromRow(raw) {
  const row = toDetailRow(raw) || raw || {};
  if (row.pantaloneta || raw?.pantaloneta) return "pantaloneta";
  if (row.camiseta || raw?.camiseta) return "camiseta";
  if (row.uniforme === false && !row.camiseta) return "otro";
  if (row.uniforme || raw?.uniforme) return "uniforme";
  const rol = compact(row.rol || raw?.rol || "");
  if (/pantaloneta|short/i.test(rol)) return "pantaloneta";
  if (/camiseta/i.test(rol)) return "camiseta";
  if (/uniforme|conjunto/i.test(rol)) return "uniforme";
  return "uniforme";
}

const PRODUCT_LABEL = {
  uniforme: "Uniforme (conjunto)",
  camiseta: "Camiseta",
  pantaloneta: "Pantaloneta",
  otro: "Otro",
};

const PRODUCT_ORDER = ["uniforme", "camiseta", "pantaloneta", "otro"];
const MANGA_ORDER = ["corta", "larga", "mixta", "otra"];

function countVariantSummary(rows) {
  const summary = {
    manga_corta: 0,
    manga_larga: 0,
    arquero: 0,
    uniforme_corta: 0,
    uniforme_larga: 0,
    camiseta_corta: 0,
    camiseta_larga: 0,
    pantaloneta: 0,
    total: 0,
    filas: 0,
  };
  for (const raw of rows || []) {
    const row = normalizeDetailRow(raw);
    if (!row) continue;
    summary.filas += 1;
    const parts = unitPartsForRow(raw);
    const rowQty = parts.reduce((s, p) => s + p.qty, 0);
    summary.total += rowQty;
    if (raw.pantaloneta) {
      summary.pantaloneta += rowQty;
      continue;
    }
    const isArquero = raw.arquero || /arquer/i.test(row.rol_variante);
    if (isArquero) summary.arquero += 1;
    // Preferir flags del parser (X Uniforme/Camiseta). No inferir «camiseta» solo porque
    // el comentario liste prendas («Camiseta, Pantaloneta, Pantalon…»).
    const isCamiseta = Boolean(raw.camiseta);
    const isUniforme = Boolean(raw.uniforme) || (!isCamiseta && raw.uniforme !== false);
    const mascArqueroUniforme =
      isArquero && row.grupo === "masculino" && raw.uniforme !== false && !raw.camiseta;

    for (const part of parts) {
      const manga = part.manga === "mixta" ? "otra" : part.manga;
      const q = part.qty;
      if (manga === "larga") summary.manga_larga += q;
      else if (manga === "corta") summary.manga_corta += q;

      if (mascArqueroUniforme) {
        if (manga === "larga") summary.uniforme_larga += q;
        else if (manga === "corta") summary.uniforme_corta += q;
        continue;
      }
      if (isArquero) {
        if (manga === "larga") summary.camiseta_larga += q;
        else if (manga === "corta") summary.camiseta_corta += q;
        continue;
      }
      if (isCamiseta) {
        if (manga === "larga") summary.camiseta_larga += q;
        else if (manga === "corta") summary.camiseta_corta += q;
      } else if (isUniforme) {
        if (manga === "larga") summary.uniforme_larga += q;
        else if (manga === "corta") summary.uniforme_corta += q;
      }
    }
  }
  return summary;
}

function buildVariantSummaryHtml(rows) {
  const s = countVariantSummary(rows);
  if (!s.total) return "";
  const items = [];
  if (s.uniforme_corta) items.push(`<li><strong>Uniforme manga corta:</strong> ${s.uniforme_corta} u.</li>`);
  if (s.uniforme_larga) items.push(`<li><strong>Uniforme manga larga:</strong> ${s.uniforme_larga} u.</li>`);
  if (s.camiseta_corta) items.push(`<li><strong>Camiseta manga corta:</strong> ${s.camiseta_corta} u.</li>`);
  if (s.camiseta_larga) items.push(`<li><strong>Camiseta manga larga:</strong> ${s.camiseta_larga} u.</li>`);
  if (s.pantaloneta) {
    items.push(`<li><strong>Pantaloneta / short:</strong> ${s.pantaloneta} u. <em>(solo pantaloneta, ver comentario en lista)</em></li>`);
  }
  if (s.arquero) {
    items.push(
      `<li><strong>Arquero:</strong> ${s.arquero} u. <em>(comentario en lista; mismo precio camiseta/uniforme, sin cargo adicional)</em></li>`
    );
  }
  if (!items.length) return "";
  return `<h2>Resumen por producto y manga</h2>
<ul>
  ${items.join("\n  ")}
</ul>`;
}

function isNoiseCommentFrag(frag) {
  const f = compact(frag);
  if (!f) return true;
  if (/^(campo|camiseta|uniforme|pantaloneta|conjunto|producto)$/i.test(f)) return true;
  if (/^solo\s*pantaloneta$/i.test(f)) return true;
  if (/^familia\s/i.test(f)) return true;
  if (/^×\d+$/i.test(f)) return true;
  return false;
}

/** Comentario de fila para la tabla: Arquero solo si viene del Excel; sin inventar «Campo». */
function buildRowComment(canonical) {
  const parts = [];
  if (canonical.arquero) parts.push("Arquero");

  const comentario = compact(canonical.comentario);
  if (comentario) {
    for (const frag of comentario.split(" · ").map((s) => s.trim()).filter(Boolean)) {
      if (isNoiseCommentFrag(frag)) continue;
      if (/arquer|porter/i.test(frag) && canonical.arquero) continue;
      if (parts.some((p) => p.toLowerCase() === frag.toLowerCase())) continue;
      parts.push(frag);
    }
  }

  // No copiar rol genérico (Campo / Camiseta / Uniforme) a la tabla.
  const rol = compact(canonical.rol);
  if (rol) {
    for (const frag of rol.split(" · ").map((s) => s.trim()).filter(Boolean)) {
      if (isNoiseCommentFrag(frag)) continue;
      if (/arquer|porter/i.test(frag)) {
        if (!canonical.arquero && !parts.some((p) => /arquer/i.test(p))) parts.push("Arquero");
        continue;
      }
      if (parts.some((p) => p.toLowerCase() === frag.toLowerCase())) continue;
      parts.push(frag);
    }
  }

  if (canonical.nombre_vacio_impresion && !compact(canonical.nombre)) {
    parts.push("sin nombre en uniforme");
  }
  return parts.join(" · ");
}

function normalizeDetailRow(row) {
  if (!row || typeof row !== "object") return null;
  const canonical = toDetailRow(row);
  if (!canonical) return null;
  const nombre = compact(canonical.nombre);
  const numero = compact(canonical.numero);
  const talla = compact(canonical.talla);
  const manga = compact(canonical.manga);
  const cantidad = Math.max(1, Number(canonical.cantidad || 1) || 1);
  const grupoNorm = canonical.grupo || "general";
  const comentario = buildRowComment(canonical);

  return {
    numero: numero || "",
    nombre,
    talla: talla || "",
    cantidad,
    manga,
    comentario,
    // legacy alias: solo para family/product column paths
    rol_variante: comentario,
    grupo: grupoNorm,
    arquero: Boolean(canonical.arquero),
  };
}

function buildDetailTableHtml(title, rows, opts = {}) {
  if (!rows.length) return "";
  const showProduct = Boolean(opts.productColumnLabel);
  const colProduct = opts.productColumnLabel || "Producto";
  const showQty = opts.showCantidad || rows.some((r) => Number(r.cantidad || 1) > 1);
  // Comentario solo si hay algo real (arquero / nota Excel); nunca columna Rol con «Campo».
  const hasComment = !showProduct && rows.some((r) => compact(r.comentario));

  const body = rows
    .map((row, idx) => {
      const bg = idx % 2 ? ' style="background-color:#f9f9f9;"' : "";
      const qtyCell = showQty
        ? `<td style="text-align:center; padding: 8px;">${escapeHtml(String(row.cantidad || 1))}</td>`
        : "";
      const productCell = showProduct
        ? `<td style="padding: 8px;">${escapeHtml(row.rol_variante || "—")}</td>`
        : "";
      const commentCell = hasComment
        ? `<td style="padding: 8px;">${escapeHtml(compact(row.comentario) || "")}</td>`
        : "";
      return `<tr${bg}><td style="text-align:center; padding: 8px;">${escapeHtml(row.numero || "—")}</td><td style="padding: 8px;">${escapeHtml(row.nombre || "—")}</td><td style="text-align:center; padding: 8px;">${escapeHtml(row.talla || "—")}</td>${qtyCell}${productCell}${commentCell}</tr>`;
    })
    .join("\n    ");

  const qtyHead = showQty
    ? `<th style="text-align:center; padding: 8px;">Cant.</th>`
    : "";
  const productHead = showProduct
    ? `<th style="text-align:left; padding: 8px;">${escapeHtml(colProduct)}</th>`
    : "";
  const commentHead = hasComment
    ? `<th style="text-align:left; padding: 8px;">Comentario</th>`
    : "";

  return `<h2>${escapeHtml(title)}</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      ${qtyHead}
      ${productHead}
      ${commentHead}
    </tr>
  </thead>
  <tbody>
    ${body}
  </tbody>
</table>`;
}

function groupDetailRows(rows) {
  const groups = { masculino: [], femenino: [], general: [] };
  for (const raw of rows) {
    const row = normalizeDetailRow(raw);
    if (!row) continue;
    const key = groups[row.grupo] ? row.grupo : "general";
    groups[key].push({ raw, row });
  }
  return groups;
}

function genderProductMangaTitle(genderLabel, productKind, mangaKey) {
  const who = genderLabel === "Masculino" ? "jugadores" : genderLabel === "Femenino" ? "jugadoras" : "detalle";
  const product = PRODUCT_LABEL[productKind] || PRODUCT_LABEL.otro;
  const mangaLabel =
    mangaKey === "corta"
      ? "Manga corta"
      : mangaKey === "larga"
        ? "Manga larga"
        : mangaKey === "mixta"
          ? "Manga mixta"
          : mangaKey === "otra"
            ? null
            : mangaKey;
  if (mangaLabel) return `Lista de ${who} (${genderLabel}) — ${product} · ${mangaLabel}`;
  return `Lista de ${who} (${genderLabel}) — ${product}`;
}

/**
 * Expande una fila a entradas de tabla por (producto × manga × qty).
 * «2 LARGA+1 CORTA» → una fila en manga larga (cant 2) y otra en corta (cant 1).
 */
function expandItemsForProductMangaTables(items) {
  const out = [];
  for (const { raw, row } of items) {
    const product = productKindFromRow(raw);
    const parts = unitPartsForRow(raw);
    const comentario = compact(row.comentario);
    for (const part of parts) {
      let mangaKey = part.manga === "mixta" ? "mixta" : part.manga;
      if (!MANGA_ORDER.includes(mangaKey)) mangaKey = "otra";
      out.push({
        product,
        mangaKey,
        row: {
          ...row,
          cantidad: part.qty,
          manga: part.manga,
          comentario,
          rol_variante: comentario,
        },
      });
    }
  }
  return out;
}

function buildGroupedGenderTables(genderLabel, items) {
  const parts = [];
  const expanded = expandItemsForProductMangaTables(items);
  const showCantidad = expanded.some((e) => Number(e.row.cantidad || 1) > 1);

  const buckets = new Map(); // `${product}|${manga}` → rows
  for (const e of expanded) {
    const key = `${e.product}|${e.mangaKey}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(e.row);
  }

  for (const product of PRODUCT_ORDER) {
    for (const mangaKey of MANGA_ORDER) {
      const rows = buckets.get(`${product}|${mangaKey}`);
      if (!rows?.length) continue;
      parts.push(
        buildDetailTableHtml(genderProductMangaTitle(genderLabel, product, mangaKey), rows, {
          showCantidad,
        })
      );
    }
  }
  return parts;
}

function buildGroupedDetailTables(rows) {
  const groups = groupDetailRows(rows);
  const parts = [];
  if (groups.masculino.length) {
    parts.push(...buildGroupedGenderTables("Masculino", groups.masculino));
  }
  if (groups.femenino.length) {
    parts.push(...buildGroupedGenderTables("Femenino", groups.femenino));
  }
  if (groups.general.length) {
    parts.push(buildDetailTableHtml("Lista de detalle", groups.general.map((x) => x.row)));
  }
  return parts;
}

/** Extrae etiqueta de familia desde comentario «Familia NOMBRE». */
function extractFamilyKey(raw) {
  const c = compact(raw?.comentario || "");
  const m = c.match(/^familia\s+(.+)$/i);
  if (m) return compact(m[1]);
  return "";
}

/** Filas Word Día de la Familia: mayoría con comentario Familia X. */
function isFamilyDayListRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  let withFam = 0;
  for (const r of rows) {
    if (extractFamilyKey(r)) withFam += 1;
  }
  return withFam >= Math.max(2, Math.floor(rows.length * 0.5));
}

function familyProductLabel(raw) {
  const rol = compact(raw?.rol || "");
  if (/uniforme\s*ni[nñ]os/i.test(rol)) return "Uniforme niños";
  if (/camiseta\s*caballero/i.test(rol)) return "Camiseta caballero";
  if (/camiseta\s*dama/i.test(rol)) return "Camiseta dama";
  if (raw?.uniforme && raw?.grupo === "masculino") return "Uniforme niños";
  if (raw?.camiseta && raw?.grupo === "femenino") return "Camiseta dama";
  if (raw?.camiseta && raw?.grupo === "masculino") return "Camiseta caballero";
  return (
    stripMangaFromRol(rol)
      .split(" · ")
      .filter((p) => p && !/^familia\s/i.test(p))
      .join(" · ") || "—"
  );
}

function normalizeFamilyDayTableRow(raw) {
  const canonical = toDetailRow(raw);
  if (!canonical) return null;
  return {
    numero: compact(canonical.numero) || "—",
    nombre: compact(canonical.nombre),
    talla: compact(canonical.talla) || "—",
    rol_variante: familyProductLabel(raw),
  };
}

function buildFamilyDayProductSummary(rows) {
  let uniforme = 0;
  let dama = 0;
  let caballero = 0;
  for (const raw of rows || []) {
    const label = familyProductLabel(raw);
    if (/uniforme/i.test(label)) uniforme += 1;
    else if (/caballero/i.test(label)) caballero += 1;
    else if (/dama/i.test(label)) dama += 1;
  }
  const items = [];
  if (uniforme) items.push(`<li><strong>Uniforme niños:</strong> ${uniforme} u.</li>`);
  if (dama) items.push(`<li><strong>Camiseta dama:</strong> ${dama} u.</li>`);
  if (caballero) items.push(`<li><strong>Camiseta caballero:</strong> ${caballero} u.</li>`);
  if (!items.length) return "";
  return `<h2>Resumen por producto</h2>
<ul>
  ${items.join("\n  ")}
</ul>`;
}

function buildFamilyGroupedTables(rows) {
  const order = [];
  const byFamily = new Map();
  for (const raw of rows || []) {
    const key = extractFamilyKey(raw) || "Sin familia";
    if (!byFamily.has(key)) {
      byFamily.set(key, []);
      order.push(key);
    }
    const row = normalizeFamilyDayTableRow(raw);
    if (row) byFamily.get(key).push(row);
  }
  const parts = [];
  for (const key of order) {
    const famRows = byFamily.get(key);
    if (!famRows?.length) continue;
    const title = key === "Sin familia" ? key : `Familia ${key}`;
    parts.push(
      buildDetailTableHtml(title, famRows, { productColumnLabel: "Producto" })
    );
  }
  return parts;
}

function buildCommercialSummaryHtml(lines) {
  if (!Array.isArray(lines) || !lines.length) return "";
  const items = lines
    .map((line) => {
      const qty = Number(line.quantity || line.qty || line.product_uom_qty || 0);
      const label = compact(
        line.label || line.name || line.product_text || line.description
      );
      if (!label || !qty) return null;
      return `<li><strong>${escapeHtml(label)} (${qty} u.):</strong> ${escapeHtml(
        compact(line.variant_notes || line.variant || "")
      )}</li>`;
    })
    .filter(Boolean);
  if (!items.length) return "";
  return `<h2>Resumen de uniformes</h2>
<ul>
  ${items.join("\n  ")}
</ul>`;
}

/**
 * Espejo fiel de una grilla Excel → HTML (formato no reconocido / mirror_v1).
 * No reinterpreta a Life: mismas columnas y celdas que la fuente.
 */
function trimGrid(grid) {
  if (!Array.isArray(grid) || !grid.length) return [];
  let maxCol = 0;
  let lastRow = -1;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    let rowHas = false;
    for (let c = 0; c < row.length; c++) {
      if (compact(row[c])) {
        rowHas = true;
        if (c > maxCol) maxCol = c;
      }
    }
    if (rowHas) lastRow = r;
  }
  if (lastRow < 0) return [];
  return grid.slice(0, lastRow + 1).map((row) => {
    const out = [];
    for (let c = 0; c <= maxCol; c++) out.push(row?.[c] ?? "");
    return out;
  });
}

function buildExcelMirrorHtml(grid, opts = {}) {
  const trimmed = trimGrid(grid);
  if (!trimmed.length) return "";
  const sheet = compact(opts.sheetName);
  const title =
    compact(opts.title) ||
    (sheet
      ? `Lista (espejo Excel — pestaña ${sheet})`
      : "Lista (espejo Excel — formato no reconocido)");
  const header = trimmed[0] || [];
  const bodyRows = trimmed.slice(1);
  const th = header
    .map(
      (h) =>
        `<th style="text-align:left; padding: 8px;">${escapeHtml(compact(h) || "—")}</th>`
    )
    .join("");
  const body = bodyRows
    .map((row, idx) => {
      const bg = idx % 2 ? ' style="background-color:#f9f9f9;"' : "";
      const cells = header
        .map((_, c) => `<td style="padding: 8px;">${escapeHtml(compact(row[c]))}</td>`)
        .join("");
      return `<tr${bg}>${cells}</tr>`;
    })
    .join("\n    ");
  return `<h2>${escapeHtml(title)}</h2>
<p><em>Tabla igual al Excel (mismas columnas). Si hay chaquetas, busos o camisas, suelen ir en COMENTARIO / TALLA.</em></p>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">${th}</tr>
  </thead>
  <tbody>
    ${body}
  </tbody>
</table>`;
}

/**
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.commercialSummaryHtml] — HTML ya armado o vacío
 * @param {Array} [opts.commercialLines]
 * @param {Array} [opts.detailRows]
 * @param {string} [opts.projectName]
 * @param {string[]} [opts.blockers]
 * @param {string[]} [opts.referenceFiles]
 * @param {string} [opts.listLayout] — `family_day_docx_v1` | `mirror_v1` | `formato_life_v1`
 * @param {string} [opts.detailLayout] — alias de listLayout
 * @param {string} [opts.designNotes]
 * @param {string} [opts.mirrorHtml] — HTML espejo prearmado
 * @param {Array<Array>} [opts.mirrorGrid] — grilla Excel cruda
 * @param {string} [opts.sheetName]
 */
function buildOdooOrderNoteHtml(opts = {}) {
  const title = compact(opts.title) || "Pedido";
  const parts = [`<h1>${escapeHtml(title)}</h1>`];

  const summary =
    compact(opts.commercialSummaryHtml) ||
    buildCommercialSummaryHtml(opts.commercialLines || []);
  if (summary) parts.push(summary);

  if (Array.isArray(opts.blockers) && opts.blockers.length) {
    parts.push(
      `<h2>Bloqueadores (confirmar)</h2>
<ul>
  ${opts.blockers.map((b) => `<li>${escapeHtml(b)}</li>`).join("\n  ")}
</ul>`
    );
  }

  const detailRows = opts.detailRows || [];
  const listLayout = compact(opts.listLayout || opts.detailLayout || "");
  const mirrorHtml =
    compact(opts.mirrorHtml) ||
    (opts.mirrorGrid?.length
      ? buildExcelMirrorHtml(opts.mirrorGrid, {
          sheetName: opts.sheetName,
          title: opts.mirrorTitle,
        })
      : "");
  const preferMirror =
    Boolean(mirrorHtml) &&
    (/^mirror/i.test(listLayout) ||
      listLayout === "generic" ||
      opts.useMirror === true ||
      !detailRows.length);

  if (preferMirror) {
    parts.push(mirrorHtml);
  } else {
    const useFamilyGrouping =
      listLayout === "family_day_docx_v1" || isFamilyDayListRows(detailRows);

    const groups = groupDetailRows(detailRows);

    if (useFamilyGrouping) {
      const famSummary = buildFamilyDayProductSummary(detailRows);
      if (famSummary) parts.push(famSummary);
      const familyTables = buildFamilyGroupedTables(detailRows);
      if (familyTables.length) parts.push(...familyTables);
    } else {
      const variantSummary = buildVariantSummaryHtml(detailRows);
      if (variantSummary) parts.push(variantSummary);

      const groupedTables = buildGroupedDetailTables(detailRows);
      if (groupedTables.length) {
        parts.push(...groupedTables);
      } else {
        if (groups.masculino.length) {
          parts.push(
            buildDetailTableHtml(
              "Lista de jugadores (Masculino)",
              groups.masculino.map((x) => x.row)
            )
          );
        }
        if (groups.femenino.length) {
          parts.push(
            buildDetailTableHtml(
              "Lista de jugadoras (Femenino)",
              groups.femenino.map((x) => x.row)
            )
          );
        }
        if (groups.general.length) {
          parts.push(
            buildDetailTableHtml(
              "Lista de detalle",
              groups.general.map((x) => x.row)
            )
          );
        }
      }
    }
  }

  if (compact(opts.designNotes)) {
    parts.push(`<p>${escapeHtml(opts.designNotes)}</p>`);
  }

  if (Array.isArray(opts.referenceFiles) && opts.referenceFiles.length) {
    parts.push(
      `<h2>Archivos de referencia</h2>
<ul>
  ${opts.referenceFiles.map((f) => `<li>${escapeHtml(f)}</li>`).join("\n  ")}
</ul>`
    );
  }

  if (compact(opts.projectName)) {
    parts.push(`<p>Proyecto: ${escapeHtml(opts.projectName)}</p>`);
  }

  return parts.join("\n\n<hr>\n\n");
}

function resolveOrderNoteHtml(vars = {}, draftPayload = {}) {
  const orderDraft = vars.order_draft || {};
  const prebuilt = compact(
    orderDraft.notes_for_odoo || draftPayload.order_note_html || vars.quote?.order_note_html
  );
  // Solo respetar prebuilt si ya trae tablas de lista / espejo (no atajos E2E narrativos).
  const looksLikeLista =
    /<table[\s>]/i.test(prebuilt) ||
    /Lista de jugador/i.test(prebuilt) ||
    /espejo Excel/i.test(prebuilt) ||
    /Resumen por variante/i.test(prebuilt);
  if (prebuilt.length > 80 && prebuilt.includes("<") && looksLikeLista) return prebuilt;

  const detailRows =
    orderDraft.detail?.rows ||
    orderDraft.detail_rows ||
    vars.order_details?.lines ||
    draftPayload.detail_rows ||
    [];

  const commercialLines =
    orderDraft.commercial?.lines ||
    draftPayload.rows ||
    draftPayload.commercial_lines ||
    (draftPayload.product_text
      ? [
          {
            name: draftPayload.product_text,
            quantity: draftPayload.quantity,
            variant_notes: [
              draftPayload.variant,
              draftPayload.material,
              Object.values(draftPayload.product_attributes || {}).join(", "),
            ]
              .filter(Boolean)
              .join(" · "),
          },
        ]
      : []);

  const title =
    compact(orderDraft.title) ||
    compact(draftPayload.order_or_team_name_for_billing) ||
    compact(vars.quote?.order_or_team_name_for_billing) ||
    "Pedido";

  const listLayout =
    orderDraft.detail?.excel_layout ||
    orderDraft.detail?.layout ||
    draftPayload.detail_layout ||
    null;

  return buildOdooOrderNoteHtml({
    title,
    commercialLines,
    detailRows,
    listLayout,
    mirrorHtml: orderDraft.detail?.mirror_html || draftPayload.mirror_html || null,
    mirrorGrid: orderDraft.detail?.mirror_grid || draftPayload.mirror_grid || null,
    sheetName: orderDraft.detail?.sheet_name || draftPayload.sheet_name || null,
    projectName:
      orderDraft.project?.name ||
      vars.user?.odoo_project_name ||
      null,
    blockers: orderDraft.blockers || [],
    referenceFiles: orderDraft.reference_files || [],
    designNotes: orderDraft.design_notes || null,
  });
}


/**
 * Sube adjuntos de order_draft.attachments a un registro Odoo (ir.attachment).
 */


function guessMime(filename, mimeType) {
  const mime = compact(mimeType);
  if (mime) return mime;
  const name = compact(filename).toLowerCase();
  if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name.endsWith(".xls")) return "application/vnd.ms-excel";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpeg") || name.endsWith(".jpg")) return "image/jpeg";
  return "application/octet-stream";
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchAttachmentBytes(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download_failed:${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

/**
 * @param {(model: string, method: string, args: unknown[], kw?: object) => Promise<unknown>} executeKw
 */
async function attachDraftFiles(executeKw, resModel, resId, attachments, options = {}) {
  const list = Array.isArray(attachments) ? attachments : [];
  const uploaded = [];
  const errors = [];

  for (const att of list) {
    const url = compact(att?.url);
    if (!url.startsWith("http")) continue;
    const name = compact(att?.filename) || "adjunto";
    try {
      const existing = await executeKw("ir.attachment", "search", [
        [
          ["res_model", "=", resModel],
          ["res_id", "=", resId],
          ["name", "=", name],
        ],
      ], { limit: 1 });
      if (Array.isArray(existing) && existing.length) {
        uploaded.push({ name, skipped: true, id: existing[0] });
        continue;
      }

      const bytes = await fetchAttachmentBytes(url);
      const attId = await executeKw("ir.attachment", "create", [
        {
          name,
          res_model: resModel,
          res_id: resId,
          type: "binary",
          mimetype: guessMime(name, att?.mime_type),
          datas: bytesToBase64(bytes),
        },
      ]);
      uploaded.push({ name, id: attId, role: att?.role || null });
    } catch (err) {
      errors.push({ name, error: String(err?.message || err) });
      if (options.failFast) break;
    }
  }

  return { uploaded, errors };
}

/** @deprecated use attachDraftFiles — mantiene compat con creación SO */
async function attachOrderDraftFiles(executeKw, orderId, attachments, options = {}) {
  return attachDraftFiles(executeKw, "sale.order", orderId, attachments, options);
}

async function attachTaskDraftFiles(executeKw, taskId, attachments, options = {}) {
  return attachDraftFiles(executeKw, "project.task", taskId, attachments, options);
}


/**
 * Contrato staff pedido completo: resolved_lines, fingerprint, cross-check, readiness.
 */

const SCHEMA_PEOPLE = "life_order_people_v1";
const WRITE_READY = "ready";
const WRITE_NEEDS_CONFIRMATION = "needs_staff_confirmation";
const WRITE_BLOCKED = "blocked";
const WRITE_NEEDS_RECONCILE = "needs_human_reconcile";
const LIFECYCLE_SCHEMA = "life_order_lifecycle_v1";

const ATTR_KEYS = [
  "cuello",
  "tela",
  "manga",
  "tipo_pantalon",
  "medias",
  "forro",
  "deporte",
  "genero",
];
const KNOWN_ATTR_SET = new Set(ATTR_KEYS);

/** Columnas principales del Formulario (ADR 0003). */
const PRINCIPAL_ATTR_KEYS = ["cuello", "manga", "genero", "deporte"];
const PRINCIPAL_ATTR_SET = new Set(PRINCIPAL_ATTR_KEYS);

/** Etiquetas para concatenar en «Otros atributos». */
const OTROS_ATTR_LABELS = {
  tela: "Tela",
  medias: "Medias",
  tipo_pantalon: "Pantaloneta",
  forro: "Forro",
  tipo_manga: "Tipo de Manga",
  color: "Color",
  bordado: "Bordado",
  botones: "Botones",
  cremallera: "Cremallera",
  tipo_camiseta: "Tipo de camiseta",
  tallas: "Tallas",
  telas: "telas",
};

/** @deprecated usar PRINCIPAL_ATTR_KEYS — alias compat */
const SPREADSHEET_ATTR_COLS = PRINCIPAL_ATTR_KEYS;


/** Separa display name Odoo en producto base + atributos embebidos en paréntesis. */
function splitProductDisplayName(displayName) {
  const raw = compact(displayName);
  if (!raw) return { product_base: "", embedded_attrs: {}, unknown_parts: [], raw: "" };

  // Odoo a menudo concatena descripción ecommerce tras el cierre: "Base (attrs) Largo texto…"
  let product_base = raw;
  let attrsBlob = "";
  const withTrail = raw.match(/^(.+?)\s*\(([^)]+)\)\s*(.*)$/);
  if (withTrail) {
    product_base = compact(withTrail[1]);
    attrsBlob = withTrail[2];
    const trailing = compact(withTrail[3]);
    // Si el trailing parece descripción larga (no atributo corto), se ignora como base
    if (trailing && trailing.length < 40 && !/\s{2,}/.test(trailing)) {
      // raro: texto corto tras ) — no lo usamos como base
    }
  } else {
    return { product_base: raw, embedded_attrs: {}, unknown_parts: [], raw };
  }

  const embedded_attrs = {};
  const unknown_parts = [];
  for (const part of attrsBlob.split(",")) {
    const token = compact(part);
    if (!token) continue;
    const lower = token.toLowerCase();
    if (/cuello|polo|redondo|\bv\b/.test(lower)) embedded_attrs.cuello = token;
    else if (/dry|dumonti|hidrotec|lluvia|tela/.test(lower)) embedded_attrs.tela = token;
    else if (/manga|sisa|ranglan|china|corta|larga/.test(lower) && !/media/.test(lower)) {
      embedded_attrs.manga = token;
    } else if (/media/.test(lower)) embedded_attrs.medias = token;
    else if (/pantalon|lycra|short|mariposa/.test(lower)) embedded_attrs.tipo_pantalon = token;
    else if (/forro/.test(lower)) embedded_attrs.forro = token;
    else if (/^masc|^fem|g[eé]nero/.test(lower)) embedded_attrs.genero = token;
    else if (/deporte|f[uú]tbol|voleibol|baloncesto|atletismo/.test(lower)) {
      embedded_attrs.deporte = token;
    }
    else unknown_parts.push(token);
  }
  return { product_base, embedded_attrs, unknown_parts, raw };
}

/**
 * Producto base + principales + Otros atributos (concat) + Comentario (persona/residual).
 */
function decomposeProductForSpreadsheet(
  displayName,
  attributes = {},
  existingComments = ""
) {
  const split = splitProductDisplayName(displayName);
  const merged = {
    ...split.embedded_attrs,
    ...normalizeAttributes(attributes),
  };
  const principal = {};
  const otrosParts = [];
  const commentParts = [];

  for (const [key, val] of Object.entries(merged)) {
    const v = compact(val);
    if (!v) continue;
    if (key === "extra") {
      commentParts.push(v);
      continue;
    }
    if (PRINCIPAL_ATTR_SET.has(key)) {
      principal[key] = v;
      continue;
    }
    const label = OTROS_ATTR_LABELS[key] || (KNOWN_ATTR_SET.has(key) ? key : null);
    if (label) otrosParts.push(`${label}: ${v}`);
    else commentParts.push(`${key}: ${v}`);
  }
  for (const part of split.unknown_parts || []) {
    const p = compact(part);
    if (p) commentParts.push(p);
  }
  const personComment = compact(existingComments);
  if (personComment) commentParts.unshift(personComment);

  const otros_atributos = [...new Set(otrosParts)].join(" · ");
  const comments = [...new Set(commentParts)].join(" · ");

  return {
    product_base: split.product_base || compact(displayName),
    principal,
    attributes: { ...principal }, // compat: solo principales tipados en columns
    otros_atributos,
    comments,
    raw: split.raw,
  };
}

/** Normaliza atributos desde match engine / Odoo PTAV / texto libre. */
function normalizeAttributes(source = {}) {
  const out = {};
  const map = {
    cuello: ["cuello", "collar", "neck"],
    tela: ["tela", "material", "fabric"],
    manga: ["manga", "sleeves", "sleeve", "largo_manga", "largo manga"],
    tipo_pantalon: ["tipo_pantalon", "short_style", "short_type", "pantalon"],
    medias: ["medias", "socks", "media"],
    forro: ["forro", "lining"],
    deporte: ["deporte", "deportes", "sport", "disciplina"],
    genero: ["genero", "género", "gender", "sex"],
  };
  for (const [canon, aliases] of Object.entries(map)) {
    for (const key of aliases) {
      const val = source[key];
      if (val != null && compact(val)) {
        out[canon] = compact(val);
        break;
      }
    }
  }
  return out;
}

function attributesFromOdooPtavs(ptavs = []) {
  const out = {};
  for (const ptav of ptavs) {
    const attrName = compact(ptav?.attribute_id?.[1] || ptav?.attribute_name || "").toLowerCase();
    const value = compact(ptav?.name || ptav?.value || "");
    if (!value) continue;
    if (/cuello/.test(attrName)) out.cuello = value;
    else if (/tela/.test(attrName)) out.tela = value;
    else if (/largo\s*manga|manga/.test(attrName)) out.manga = value;
    else if (/pantalon/.test(attrName)) out.tipo_pantalon = value;
    else if (/medias|media/.test(attrName)) out.medias = value;
    else if (/forro/.test(attrName)) out.forro = value;
    else if (/deporte/.test(attrName)) out.deporte = value;
    else if (/g[eé]nero|genero/.test(attrName)) out.genero = value;
  }
  return out;
}

function buildResolvedLine(input = {}, index = 0) {
  const productText = compact(input.product_text || input.name || "");
  const split = splitProductDisplayName(input.display_name || productText);
  const attributes = {
    ...split.embedded_attrs,
    ...normalizeAttributes(input.attributes || input.product_attributes || {}),
    ...normalizeAttributes(input),
  };
  const qty = Math.max(0, Number(input.quantity || input.product_uom_qty || 0));
  const confidence = compact(input.confidence || input.match_confidence || "");
  const lineId =
    compact(input.line_id) ||
    `rl_${index + 1}_${String(input.product_variant_id || input.odoo_product_id || productText)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .slice(0, 40)}`;

  return {
    line_id: lineId,
    product_text: productText || split.product_base,
    product_base: compact(input.product_base) || split.product_base || productText,
    product_tmpl_id: Number(input.product_tmpl_id || 0) || null,
    product_variant_id:
      Number(input.product_variant_id || input.odoo_product_id || input.product_id || 0) || null,
    attributes,
    quantity: qty,
    unit_cop: Number(input.unit_cop || input.unit_price || input.price_unit || 0) || null,
    confidence,
    category: compact(input.category || "").toLowerCase() || null,
    commercial_role: compact(input.commercial_role || "") || null,
    comments: compact(input.comments || input.variant_notes || input.comment || ""),
    alternatives: Array.isArray(input.alternatives) ? input.alternatives : [],
    clarifying_question: compact(input.clarifying_question || "") || null,
  };
}

function resolvedLinesFromCommercial(lines = []) {
  return (lines || []).map((line, i) => buildResolvedLine(line, i));
}

function draftRowsFromResolvedLines(resolvedLines = []) {
  return (resolvedLines || [])
    .filter((line) => Number(line.product_variant_id || 0) > 0 && Number(line.quantity || 0) > 0)
    .map((line) => ({
      product_id: line.product_variant_id,
      name: line.product_base || line.product_text,
      quantity: line.quantity,
      unit_price: line.unit_cop || 0,
      line_id: line.line_id,
      attributes: line.attributes,
      comments: line.comments,
    }));
}

function peopleCount(detail = {}) {
  if (Array.isArray(detail.people) && detail.people.length) return detail.people.length;
  if (Array.isArray(detail.rows) && detail.rows.length) return detail.rows.length;
  return Number(detail.person_count || 0) || 0;
}

function peopleForSpreadsheet(detail = {}) {
  if (Array.isArray(detail.people) && detail.people.length) {
    return detail.people.map((person, i) => {
      const identity = person.identity || {};
      const components = Array.isArray(person.components) ? person.components : [];
      const primary = components[0] || {};
      const comments = [
        compact(person.comments),
        compact(primary.comment),
        primary.goalkeeper ? "Arquero" : "",
        compact(primary.sleeve || primary.manga),
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        person_id: person.person_id || `p${i + 1}`,
        nombre: compact(identity.print_name || identity.display_name || ""),
        numero: compact(identity.number || ""),
        talla: compact(primary.size || ""),
        color_medias: compact(person.color_medias || primary.color_medias || ""),
        manga: compact(primary.sleeve || primary.manga || ""),
        genero: compact(person.identity?.group || person.grupo || identity.group || ""),
        grupo: compact(person.identity?.group || person.grupo || identity.group || ""),
        comentarios: comments,
        product_line_key: compact(primary.product_line_key || person.product_line_key || ""),
        resolved_line_id: compact(primary.resolved_line_id || person.resolved_line_id || ""),
      };
    });
  }
  return (detail.rows || []).map((row, i) => ({
    person_id: `r${i + 1}`,
    nombre: compact(row.nombre || row.nombre_uniforme || ""),
    numero: compact(row.numero || ""),
    talla: compact(row.talla || ""),
    color_medias: compact(row.color_medias || row.medias || ""),
    manga: compact(row.manga || ""),
    genero: compact(row.genero || row.grupo || ""),
    grupo: compact(row.grupo || row.genero || ""),
    comentarios: [
      compact(row.comentario || row.rol || ""),
      row.arquero ? "Arquero" : "",
    ]
      .filter(Boolean)
      .join(" · "),
    product_line_key: compact(row.product_line_key || row.section_key || ""),
    resolved_line_id: compact(row.resolved_line_id || ""),
  }));
}

/**
 * Cruza personas del detalle vs cantidades de líneas resueltas.
 * Diseño ($0) se ignora.
 */
function crossCheckPeopleVsLines({ detail = {}, resolvedLines = [] } = {}) {
  const people = peopleForSpreadsheet(detail);
  const productLines = (resolvedLines || []).filter(
    (line) =>
      Number(line.quantity || 0) > 0 &&
      !/dise[nñ]o/i.test(line.product_base || line.product_text || "")
  );
  const totalQty = productLines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const personCount = people.length;
  const mismatches = [];

  if (productLines.length && totalQty > 0 && personCount === 0) {
    mismatches.push({
      code: "missing_detail_list",
      message: `Lista pendiente para ${totalQty} unidad(es) comerciales`,
      person_count: 0,
      line_qty: totalQty,
    });
  }

  if (productLines.length && personCount && personCount !== totalQty) {
    mismatches.push({
      code: "qty_people_vs_lines",
      message: `Personas en lista (${personCount}) ≠ suma de líneas (${totalQty})`,
      person_count: personCount,
      line_qty: totalQty,
    });
  }

  const linked = people.filter((p) => p.resolved_line_id || p.product_line_key);
  if (linked.length) {
    const byLine = {};
    for (const p of linked) {
      const key = p.resolved_line_id || p.product_line_key;
      byLine[key] = (byLine[key] || 0) + 1;
    }
    for (const line of productLines) {
      const key = line.line_id;
      const count = byLine[key] || byLine[line.product_text] || 0;
      if (count && count !== Number(line.quantity || 0)) {
        mismatches.push({
          code: "line_person_qty",
          line_id: key,
          message: `Línea ${line.product_base}: ${count} personas vs qty ${line.quantity}`,
          person_count: count,
          line_qty: line.quantity,
        });
      }
    }
  }

  const status = mismatches.length ? "mismatch" : personCount || totalQty ? "complete" : "empty";
  return {
    status,
    ok: mismatches.length === 0,
    person_count: personCount,
    line_qty: totalQty,
    mismatches,
  };
}

/**
 * Estado explícito del pedido vivo. Un borrador parcial sí se puede escribir en
 * Odoo, pero no debe confirmarse ni liberarse a producción hasta cerrar faltantes.
 */
function buildOrderLifecycle(vars = {}, resolvedLines = [], cross = null) {
  const detail = vars.order_draft?.detail || {};
  const people = peopleForSpreadsheet(detail);
  const commercialQty = (resolvedLines || [])
    .filter((line) => !/dise[nñ]o/i.test(line.product_base || line.product_text || ""))
    .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const missing = [];

  const hasCustomerName = Boolean(
    compact(
      vars.quote?.customer_display_name ||
        vars.order_draft?.customer_display_name ||
        vars.order_session?.display_name ||
        String(vars.lead?.name || "").replace(/^oportunidad\s+de\s+/i, "") ||
        vars.crm?.opportunity_name ||
        vars.crm?.partner_name
    )
  );
  const hasBoundOpp = Boolean(
    Number(vars?.lead?.id || 0) ||
      Number(vars?.crm?.opportunity_id || 0) ||
      Number(vars?.order_draft?.write?.odoo_lead_id || 0)
  );
  if (!hasCustomerName && !hasBoundOpp) {
    missing.push("cliente");
  }
  if (!people.length) {
    missing.push("lista_personas");
  } else {
    if (people.some((person) => !compact(person.nombre))) missing.push("nombres");
    if (people.some((person) => !compact(person.numero))) missing.push("numeros");
    if (people.some((person) => !compact(person.talla))) missing.push("tallas");
  }
  if (cross && !cross.ok && !missing.includes("lista_personas")) {
    missing.push("cuadre_cantidad_lista");
  }
  if ((resolvedLines || []).some((line) => !Number(line.product_variant_id || 0))) {
    missing.push("variantes_odoo");
  }

  const uniqueMissing = [...new Set(missing)];
  const prior = vars.order_draft?.lifecycle || vars.order_lifecycle || {};
  const state = uniqueMissing.length ? "draft_partial" : "draft_ready_for_review";

  return {
    schema_version: LIFECYCLE_SCHEMA,
    state,
    commercial_quantity: commercialQty,
    detail_quantity: people.length,
    missing_fields: uniqueMissing,
    confirmation_gate: {
      allowed: uniqueMissing.length === 0,
      reason: uniqueMissing.length
        ? `Faltan: ${uniqueMissing.join(", ")}`
        : "Datos iniciales completos; revisión humana requerida en Odoo.",
    },
    active_revision: Math.max(0, Number(prior.active_revision || 0)),
    updated_at: new Date().toISOString(),
  };
}

function stableFingerprint(payload = {}) {
  const lines = (payload.resolved_lines || payload.commercial_lines || [])
    .map((l) => ({
      p: Number(l.product_variant_id || l.odoo_product_id || 0) || compact(l.product_text || l.name),
      q: Number(l.quantity || 0),
      a: normalizeAttributes(l.attributes || l),
    }))
    .sort((a, b) => String(a.p).localeCompare(String(b.p)));
  const people = peopleForSpreadsheet(payload.detail || {})
    .map((p) => `${p.numero}|${p.nombre}|${p.talla}`)
    .sort();
  return JSON.stringify({ lines, people, partner: compact(payload.partner_key || "") });
}

/**
 * Detecta CONFIRMO SUBIR en el mensaje del staff.
 * Kapso suele poner el inbound en intent.raw_text / last_user_input,
 * no solo en staff.lane_reply.
 */
function hasConfirmoSubir(vars = {}) {
  const staff = vars.staff || {};
  const context = vars.context || {};
  const intent = vars.intent || {};
  const candidates = [
    vars.staff_lane_reply,
    staff.lane_reply,
    staff.last_user_text,
    staff.last_inbound_text,
    context.last_user_text,
    context.last_inbound_text,
    intent.raw_text,
    intent.text,
    vars.last_user_input,
    vars.last_user_text,
    vars.last_inbound_text,
    vars.message,
    vars.body,
  ];
  return candidates.some((t) => /\bCONFIRMO\s+SUBIR\b/i.test(compact(t)));
}

/**
 * Evalúa si el borrador staff puede escribirse en Odoo.
 * @returns {{ status, code, message, fingerprint, resolved_lines, cross_check }}
 */
function evaluateStaffWriteReadiness(vars = {}) {
  const orderDraft = vars.order_draft || {};
  const quote = vars.quote || {};
  const staff = vars.staff || {};

  let resolved = Array.isArray(orderDraft.commercial?.resolved_lines)
    ? orderDraft.commercial.resolved_lines.map((l, i) => buildResolvedLine(l, i))
    : [];

  if (!resolved.length && Array.isArray(orderDraft.commercial?.lines)) {
    resolved = resolvedLinesFromCommercial(orderDraft.commercial.lines);
  }

  if (!resolved.length && compact(quote.product_text)) {
    resolved = [
      buildResolvedLine(
        {
          product_text: quote.product_text,
          quantity: quote.quantity,
          product_variant_id: quote.odoo_product_id,
          confidence: quote.match_confidence,
          attributes: quote.product_attributes,
          category: /uniforme/i.test(quote.product_text) ? "uniforme" : null,
        },
        0
      ),
    ];
  }

  if (!resolved.length) {
    return {
      status: WRITE_BLOCKED,
      code: "no_lines",
      message: "Pedido incompleto: sin líneas comerciales.",
      fingerprint: null,
      resolved_lines: [],
      cross_check: null,
    };
  }

  const baseUniformQty = resolved
    .filter((l) => l.category === "uniforme" || /uniforme/i.test(l.product_text || ""))
    .reduce((s, l) => s + Number(l.quantity || 0), 0);
  if (baseUniformQty > 0 && baseUniformQty < 6) {
    return {
      status: WRITE_BLOCKED,
      code: "min_uniform",
      message: "Pedido incompleto: minimo 6 uniformes del mismo diseno.",
      fingerprint: null,
      resolved_lines: resolved,
      cross_check: null,
    };
  }

  const standalone = resolved.filter(
    (l) => l.category !== "uniforme" && !/uniforme/i.test(l.product_text || "")
  );
  if (baseUniformQty === 0) {
    const below = standalone.find((l) => Number(l.quantity || 0) < 6);
    if (below) {
      return {
        status: WRITE_BLOCKED,
        code: "min_standalone",
        message: `Pedido mínimo 6 unidades de ${below.product_base || below.product_text}.`,
        fingerprint: null,
        resolved_lines: resolved,
        cross_check: null,
      };
    }
  }

  const fingerprint = stableFingerprint({
    resolved_lines: resolved,
    detail: orderDraft.detail,
    partner_key:
      quote.customer_wa_id ||
      quote.customer_display_name ||
      quote.order_or_team_name_for_billing ||
      "",
  });

  const unresolved = resolved.filter((l) => !Number(l.product_variant_id || 0));
  const ambiguous = resolved.filter((l) =>
    ["low", "none", "medium"].includes(String(l.confidence || ""))
  );
  const parseStatus = compact(orderDraft.detail?.parse_status || "");
  const needsReviewStatus = parseStatus === "needs_review";
  // "partial" solo pide CONFIRMO si además hay ambigüedad comercial.
  // FORMATO LIFE a menudo marca partial y aun así resuelve high+variant.
  const hasWarnings =
    Boolean(orderDraft.blockers?.length) ||
    Boolean(orderDraft.detail?.warnings?.length) ||
    needsReviewStatus;

  const confirmoText = hasConfirmoSubir(vars);
  const confirmed =
    (compact(staff.confirmation_fingerprint) &&
      compact(staff.confirmation_fingerprint) === fingerprint) ||
    (confirmoText && Boolean(fingerprint));

  const compiledAmbiguity =
    ambiguous.length > 0 ||
    (unresolved.length > 0 &&
      resolved.some((l) => String(l.confidence || "") === "high"));

  const allResolvedHigh =
    resolved.length > 0 &&
    unresolved.length === 0 &&
    resolved.every((l) => String(l.confidence || "") === "high");

  if (
    (compiledAmbiguity || hasWarnings || (parseStatus === "partial" && !allResolvedHigh)) &&
    !confirmed
  ) {
    const summary = resolved
      .map(
        (l) =>
          `• ${l.product_base || l.product_text} × ${l.quantity}` +
          (l.product_variant_id ? "" : " (sin variante Odoo)") +
          (l.confidence && l.confidence !== "high" ? ` [${l.confidence}]` : "")
      )
      .join("\n");
    return {
      status: WRITE_NEEDS_CONFIRMATION,
      code: "needs_confirmation",
      message: `Hay ambigüedad u organización parcial de los datos. Resumen:\n${summary}\nResponde CONFIRMO SUBIR para crear el borrador.`,
      fingerprint,
      resolved_lines: resolved,
      cross_check: null,
    };
  }

  if (confirmed && unresolved.length) {
    return {
      status: WRITE_BLOCKED,
      code: "unresolved_variant",
      message: `Falta variante Odoo exacta para: ${unresolved.map((l) => l.product_text).join(", ")}`,
      fingerprint,
      resolved_lines: resolved,
      cross_check: null,
    };
  }

  const cross = crossCheckPeopleVsLines({
    detail: orderDraft.detail,
    resolvedLines: resolved,
  });

  return {
    status: WRITE_READY,
    code: "pedido_ready",
    message: null,
    fingerprint,
    resolved_lines: resolved,
    cross_check: cross,
  };
}

function spreadsheetStateFromCross(cross, spreadsheetId = null) {
  return {
    id: spreadsheetId,
    status: cross?.status || "empty",
    fingerprint: null,
    cross_check: cross || null,
  };
}



/**
 * Formulario Life — fill nativo Odoo 19.
 *
 * NO pisa fórmulas en Productos del pedido A–F ni Aprobación A–B (SEQUENCE / XLOOKUP / ODOO.LIST).
 * Renombra pestaña Pedido → Productos del pedido.
 * Columnas principales + Otros atributos + Comentario (ADR 0003 / 0004).
 */

const PRODUCTOS_SHEET_NAME = "Productos del pedido";
const PRODUCTOS_SHEET_RE = /^(pedido|productos del pedido)$/i;

/**
 * Productos del pedido: A–F nativos; G–H legacy Tallas/Colores (no pisar);
 * I+ Kapso.
 */
const PEDIDO_ATTR_HEADERS = {
  I: "Producto base",
  J: "Cuello",
  K: "Largo Manga",
  L: "Género",
  M: "Deportes",
  N: "Otros atributos",
  O: "Comentario",
};

/**
 * Aprobación: A–B nativos; C–E persona; F–K atributos; L color medias (última columna).
 */
const FORMULARIO_HEADERS = {
  C: "Nombre en camiseta",
  D: "Numero en camiseta",
  E: "Talla uniforme",
  F: "Cuello",
  G: "Largo Manga",
  H: "Género",
  I: "Deportes",
  J: "Otros atributos",
  K: "Comentario",
  L: "Color medias",
};

/**
 * Odoo Plantilla venta guarda celdas como string plano ("ANDRÉS"), no {content}.
 * Escribir objetos rompe Owl (model undefined / syncSheetFromRouter).
 */
function cell(content, style = null) {
  const text = content == null ? "" : String(content);
  if (style != null) return { content: text, style };
  return text;
}

function findSheet(snapshot, nameRe) {
  const sheets = snapshot?.sheets || [];
  return sheets.find((s) => nameRe.test(String(s?.name || ""))) || null;
}

function findProductosSheet(snapshot) {
  return findSheet(snapshot, PRODUCTOS_SHEET_RE) || snapshot?.sheets?.[1] || null;
}

/** Renombra Pedido → Productos del pedido solo si no hay fórmulas que referencien Pedido!. */
function renamePedidoSheet(snapshot) {
  const raw = JSON.stringify(snapshot || {});
  if (/Pedido!/i.test(raw)) return snapshot;
  const sheet = findSheet(snapshot, /^pedido$/i);
  if (sheet) sheet.name = PRODUCTOS_SHEET_NAME;
  return snapshot;
}

function cellContent(val) {
  if (val == null) return "";
  if (typeof val === "object") return String(val.content ?? "");
  return String(val);
}

function isFormulaCell(val) {
  return cellContent(val).trim().startsWith("=");
}

function setHeaderIfNeeded(sheet, addr, label) {
  sheet.cells = sheet.cells || {};
  const cur = cellContent(sheet.cells[addr]);
  if (!cur || cur === label || !isFormulaCell(sheet.cells[addr])) {
    sheet.cells[addr] = cell(label);
  }
}

function expandTableRange(sheet, range) {
  if (!Array.isArray(sheet.tables) || !sheet.tables.length) return;
  sheet.tables = sheet.tables.map((t) => ({
    ...t,
    range: range || t.range,
  }));
}

function principalFromDecomp(decomp) {
  const p = decomp?.principal || decomp?.attributes || {};
  return {
    cuello: p.cuello || "",
    manga: p.manga || "",
    genero: p.genero || "",
    deporte: p.deporte || "",
  };
}

/** Valores de lista Pedido!G / Pedido!H usados por dataValidationRules. */
function readPedidoDropdownList(snapshot, colLetter, { fromRow = 2, toRow = 40 } = {}) {
  const pedido =
    findSheet(snapshot, /^pedido$/i) || findProductosSheet(snapshot);
  if (!pedido?.cells) return [];
  const out = [];
  for (let r = fromRow; r <= toRow; r++) {
    const v = compact(cellContent(pedido.cells[`${colLetter}${r}`]));
    if (v) out.push(v);
  }
  return out;
}

/**
 * Plantilla Life guarda tallas como "Tallas: S" / " Tallas: 14" en Pedido!G.
 * Escribir solo "S" o "14" dispara puntito rojo (isValueInRange).
 */
function normalizeFormularioTalla(raw, allowedList = []) {
  const token = compact(raw)
    .replace(/^tallas?\s*:?\s*/i, "")
    .toUpperCase();
  if (!token) return "";
  const allowed = allowedList.length
    ? allowedList
    : [
        "Tallas: S",
        "Tallas: M",
        "Tallas: L",
        "Tallas: XL",
        "Tallas: XXL",
        "Tallas: XXXL",
        " Tallas: 2",
        " Tallas: 4",
        " Tallas: 6",
        " Tallas: 8",
        " Tallas: 10",
        " Tallas: 12",
        " Tallas: 14",
        " Tallas: 16",
      ];
  const exact = allowed.find((a) => compact(a) === compact(raw));
  if (exact) return exact;
  const byToken = allowed.find((a) => {
    const t = compact(a)
      .replace(/^tallas?\s*:?\s*/i, "")
      .toUpperCase();
    return t === token;
  });
  if (byToken) return byToken;
  // Letra vs número: XL/XXL etc.
  if (/^(XXXL|XXL|XL|S|M|L)$/i.test(token)) {
    return `Tallas: ${token}`;
  }
  if (/^\d{1,2}$/.test(token)) {
    return ` Tallas: ${token}`;
  }
  return compact(raw);
}

/** Colores Pedido!H: Negro, Blanco, Azul, Verde, Rojo, Naranja. */
function normalizeFormularioColor(raw, allowedList = []) {
  const token = compact(raw);
  if (!token) return "";
  const allowed = allowedList.length
    ? allowedList
    : ["Negro", "Blanco", "Azul", "Verde", "Rojo", "Naranja"];
  const exact = allowed.find((a) => compact(a).toLowerCase() === token.toLowerCase());
  if (exact) return exact;
  const aliases = {
    negro: "Negro",
    black: "Negro",
    blanco: "Blanco",
    white: "Blanco",
    azul: "Azul",
    blue: "Azul",
    verde: "Verde",
    green: "Verde",
    rojo: "Rojo",
    red: "Rojo",
    naranja: "Naranja",
    orange: "Naranja",
  };
  const key = token.toLowerCase().replace(/\s+/g, "");
  const mapped = aliases[key];
  if (mapped) {
    return allowed.find((a) => compact(a).toLowerCase() === mapped.toLowerCase()) || mapped;
  }
  // "azul oscuro" → Azul si aparece
  for (const a of allowed) {
    if (token.toLowerCase().includes(compact(a).toLowerCase())) return a;
  }
  return ""; // no forzar valor fuera de lista (evita puntito rojo)
}

/** Asegura rangos de validación E2:E / L2:L (plantilla a veces deja E3:E / F3 / L3). */
function ensureFormularioDataValidationRanges(snapshot) {
  const sheet =
    findSheet(snapshot, /formulario|aprobaci/i) || snapshot?.sheets?.[0];
  if (!sheet || !Array.isArray(sheet.dataValidationRules)) return snapshot;
  for (const rule of sheet.dataValidationRules) {
    const ranges = rule.ranges || [];
    const joined = ranges.join("|");
    if (/^E/i.test(joined) || ranges.some((r) => /^E/i.test(r))) {
      rule.ranges = ["E2:E"];
      if (rule.criterion?.values?.[0] && !/Pedido!G/i.test(rule.criterion.values[0])) {
        rule.criterion.values = ["Pedido!G2:G"];
      } else if (rule.criterion?.values?.[0] === "Pedido!G1:G14") {
        // G1 es header "Tallas"; lista útil desde G2
        rule.criterion.values = ["Pedido!G2:G"];
      }
    }
    if (/^[FL]/i.test(joined) || ranges.some((r) => /^[FL]/i.test(r))) {
      rule.ranges = ["L2:L"];
      if (rule.criterion?.values?.[0] && /Pedido!H/i.test(rule.criterion.values[0])) {
        rule.criterion.values = ["Pedido!H2:H"];
      }
    }
  }
  return snapshot;
}

/** Plantilla venta nativa: formulas Pedido!/XLOOKUP/ODOO.LIST — no expandir tablas ni renombrar. */
function isNativePlantillaFormulario(snapshot) {
  const raw = JSON.stringify(snapshot || {});
  return /Pedido!/i.test(raw) && /XLOOKUP|SEQUENCE|ODOO\.LIST/i.test(raw);
}

/**
 * Escribe I–O en Productos del pedido. No toca A–F ni G–H.
 * En Formulario nativo (Plantilla venta) es no-op: Pedido lo llena ODOO.LIST.
 */
function ensurePedidoAttributeColumns(
  snapshot,
  resolvedLines = [],
  orderLines = null
) {
  if (isNativePlantillaFormulario(snapshot)) return snapshot;
  renamePedidoSheet(snapshot);
  const sheet = findProductosSheet(snapshot);
  if (!sheet) return snapshot;
  sheet.cells = sheet.cells || {};

  for (const [col, label] of Object.entries(PEDIDO_ATTR_HEADERS)) {
    setHeaderIfNeeded(sheet, `${col}1`, label);
  }
  expandTableRange(sheet, "A1:O80");

  const linesForRows = buildPedidoRowPlan(resolvedLines, orderLines);
  linesForRows.forEach((entry, i) => {
    const row = i + 2;
    if (!entry) {
      for (const col of Object.keys(PEDIDO_ATTR_HEADERS)) {
        sheet.cells[`${col}${row}`] = cell("");
      }
      return;
    }
    const decomp = decomposeProductForSpreadsheet(
      entry.display_name || entry.product_text || entry.product_base,
      {
        ...(entry.attributes || {}),
        genero: entry.genero || entry.attributes?.genero,
        deporte: entry.deporte || entry.attributes?.deporte,
      },
      entry.comments || ""
    );
    const p = principalFromDecomp(decomp);
    sheet.cells[`I${row}`] = cell(decomp.product_base);
    sheet.cells[`J${row}`] = cell(p.cuello);
    sheet.cells[`K${row}`] = cell(p.manga);
    sheet.cells[`L${row}`] = cell(p.genero);
    sheet.cells[`M${row}`] = cell(p.deporte);
    sheet.cells[`N${row}`] = cell(decomp.otros_atributos || "");
    sheet.cells[`O${row}`] = cell(decomp.comments || "");
  });

  return snapshot;
}

function buildPedidoRowPlan(resolvedLines = [], orderLines = null) {
  if (Array.isArray(orderLines) && orderLines.length) {
    return orderLines.map((ol) => {
      const name = compact(ol.name || ol.product_id?.[1] || "");
      if (/dise[nñ]o/i.test(name)) {
        return {
          display_name: name,
          product_base: "Diseño",
          attributes: {},
          comments: "",
        };
      }
      const match =
        (resolvedLines || []).find(
          (rl) =>
            Number(rl.product_variant_id || 0) ===
              Number(ol.product_id?.[0] || ol.product_id || 0) ||
            compact(rl.product_text) === name ||
            name.includes(compact(rl.product_base))
        ) || null;
      return {
        display_name: name,
        product_text: match?.product_text || name,
        product_base: match?.product_base,
        attributes: match?.attributes || {},
        genero: match?.genero,
        deporte: match?.deporte || match?.attributes?.deporte,
        comments: match?.comments || "",
      };
    });
  }
  return (resolvedLines || []).filter(
    (l) => !/dise[nñ]o/i.test(l.product_base || l.product_text || "")
  );
}

function fillFormularioPeople(
  snapshot,
  { detail = {}, resolvedLines = [], orderLines = null } = {}
) {
  const sheet =
    findSheet(snapshot, /formulario|aprobaci/i) || snapshot?.sheets?.[0];
  if (!sheet) return { snapshot, filled: 0 };
  sheet.cells = sheet.cells || {};

  const native = isNativePlantillaFormulario(snapshot);
  const people = peopleForSpreadsheet(detail);
  const meta = detail || {};

  if (native) {
    // C–E persona + F–K attrs + L color medias (plantilla v2). No tocar A–B ni expandir tablas.
    // Celdas = string plano. Omitir vacías.
    ensureFormularioDataValidationRanges(snapshot);
    const tallaList = readPedidoDropdownList(snapshot, "G");
    const colorList = readPedidoDropdownList(snapshot, "H");
    
    // Detectamos headers en F1 (Cuello), G1 (Manga) o J1 (Otros)
    const hasAttrHeaders =
      /cuello/i.test(cellContent(sheet.cells?.F1)) ||
      /largo\s*manga|manga/i.test(cellContent(sheet.cells?.G1)) ||
      /otros atributos/i.test(cellContent(sheet.cells?.J1));

    // Forzar el tamaño de la letra y los estilos en la fila de cabecera
    if (sheet.styles) {
      const headerStyleId = sheet.styles['C1'] || sheet.styles['E1:F1'] || 4; // 4: bold, fontSize: 14
      sheet.styles['C1'] = headerStyleId;
      sheet.styles['D1'] = sheet.styles['D1'] || 5; // Mantener D1 si tiene wrapping
      sheet.styles['E1:L1'] = headerStyleId; // Homogeneizar de la E a la L
      if (sheet.styles['E1:F1']) delete sheet.styles['E1:F1'];
    }

    // Forzar bordes uniformes de B1 a L1
    if (sheet.borders) {
      if (sheet.borders['B1:F1']) {
        sheet.borders['B1:L1'] = sheet.borders['B1:F1'];
        delete sheet.borders['B1:F1'];
      } else if (!sheet.borders['B1:L1']) {
        sheet.borders['B1:L1'] = 1;
      }
    }

    // Forzar anchos de columna razonables para las nuevas columnas si no están
    sheet.cols = sheet.cols || {};
    const colWidths = { 5: 120, 6: 120, 7: 120, 8: 120, 9: 150, 10: 180, 11: 128 }; // F:120, G:120, H:120, I:120, J:150, K:180, L:128
    for (const [colIdx, width] of Object.entries(colWidths)) {
      if (!sheet.cols[colIdx]) sheet.cols[colIdx] = { size: width };
    }

    for (const addr of Object.keys(sheet.cells)) {
      const m = addr.match(/^([C-M])(\d+)$/);
      if (!m || Number(m[2]) < 2) continue;
      delete sheet.cells[addr];
    }

    const productLines = (resolvedLines || []).filter(
      (l) =>
        Number(l.quantity || 0) > 0 &&
        !/dise[nñ]o/i.test(l.product_base || l.product_text || "")
    );
    let filled = 0;
    people.forEach((person, i) => {
      const row = i + 2;
      const nombre = compact(person.nombre || "");
      const numero = compact(person.numero || "");
      const talla = normalizeFormularioTalla(person.talla || "", tallaList);
      const color = normalizeFormularioColor(
        person.color_medias || meta.color_media || "",
        colorList
      );
      if (nombre) sheet.cells[`C${row}`] = nombre;
      if (numero) sheet.cells[`D${row}`] = numero;
      if (talla) sheet.cells[`E${row}`] = talla;
      if (color) sheet.cells[`L${row}`] = color; // Color medias en columna L

      if (hasAttrHeaders) {
        const hint = compact(
          person.product_hint || person.rol || person.categoria || person.grupo || ""
        ).toLowerCase();
        const line =
          productLines.find((l) => {
            if (l.line_id && (l.line_id === person.resolved_line_id || l.line_id === person.product_line_key))
              return true;
            const base = compact(l.product_base || l.product_text || "").toLowerCase();
            const cat = compact(l.category || "").toLowerCase();
            const blob = `${base} ${cat}`;
            if (/chaqueta|rompe/i.test(hint) && /chaqueta|rompe/i.test(blob)) return true;
            if (/camiseta|coach/i.test(hint) && /camiseta/i.test(blob)) return true;
            if (/uniforme|f[uú]tbol|arquero/i.test(hint) && /uniforme/i.test(blob)) return true;
            return hint && base.includes(hint);
          }) || productLines[0];
        const generoFromPerson =
          /fem/i.test(person.genero || person.grupo || "")
            ? "femenino"
            : /masc/i.test(person.genero || person.grupo || "")
              ? "masculino"
              : "";
        const decomp = line
          ? decomposeProductForSpreadsheet(
              line.product_text || line.product_base,
              {
                ...(line.attributes || {}),
                genero: line.attributes?.genero || generoFromPerson,
                deporte: line.attributes?.deporte || meta.disciplina,
                manga: line.attributes?.manga || person.manga,
              },
              [line.comments, person.comentarios, person.comentario]
                .filter(Boolean)
                .join(" · ")
            )
          : {
              product_base: "",
              principal: { genero: generoFromPerson },
              attributes: {},
              otros_atributos: "",
              comments: person.comentarios || person.comentario || "",
            };
        const p = principalFromDecomp(decomp);
        
        // Escribimos en las nuevas columnas (F a K, Producto base borrado)
        if (p.cuello) sheet.cells[`F${row}`] = p.cuello;
        if (p.manga) sheet.cells[`G${row}`] = p.manga;
        if (p.genero || generoFromPerson) {
          sheet.cells[`H${row}`] = p.genero || generoFromPerson;
        }
        if (p.deporte) sheet.cells[`I${row}`] = p.deporte;
        if (decomp.otros_atributos) sheet.cells[`J${row}`] = decomp.otros_atributos;
        const comment = compact(
          decomp.comments || person.comentarios || person.comentario || ""
        );
        if (comment) sheet.cells[`K${row}`] = comment;
      }
      filled += 1;
    });
    return {
      snapshot,
      filled,
      mode: hasAttrHeaders ? "native_aprobacion_cf_hm" : "native_aprobacion_cf",
    };
  }

  for (const [col, label] of Object.entries(FORMULARIO_HEADERS)) {
    setHeaderIfNeeded(sheet, `${col}1`, label);
  }
  if (!cellContent(sheet.cells.A1)) sheet.cells.A1 = cell("Idx");
  if (!cellContent(sheet.cells.B1)) sheet.cells.B1 = cell("Producto");
  expandTableRange(sheet, "A1:L200");

  const productLines = (resolvedLines || []).filter(
    (l) =>
      Number(l.quantity || 0) > 0 &&
      !/dise[nñ]o/i.test(l.product_base || l.product_text || "")
  );
  const defaultLine = productLines[0] || null;

  for (const addr of Object.keys(sheet.cells)) {
    const m = addr.match(/^([C-L])(\d+)$/);
    if (m && Number(m[2]) >= 2) delete sheet.cells[addr];
  }

  let filled = 0;

  function writeAttrRow(row, decomp, person = null) {
    const p = principalFromDecomp(decomp);
    sheet.cells[`F${row}`] = cell(p.cuello);
    sheet.cells[`G${row}`] = cell(p.manga);
    sheet.cells[`H${row}`] = cell(p.genero || person?.genero || "");
    sheet.cells[`I${row}`] = cell(p.deporte || "");
    sheet.cells[`J${row}`] = cell(decomp.otros_atributos || "");
    sheet.cells[`K${row}`] = cell(decomp.comments || "");
  }

  if (people.length) {
    people.forEach((person, i) => {
      const row = i + 2;
      const line =
        productLines.find(
          (l) =>
            l.line_id === person.resolved_line_id ||
            l.product_text === person.product_line_key ||
            l.line_id === person.product_line_key
        ) || defaultLine;
      const generoFromPerson =
        /fem/i.test(person.genero || person.grupo || "")
          ? "femenino"
          : /masc/i.test(person.genero || person.grupo || "")
            ? "masculino"
            : "";
      const decomp = line
        ? decomposeProductForSpreadsheet(
            line.product_text || line.product_base,
            {
              ...(line.attributes || {}),
              genero: line.attributes?.genero || generoFromPerson,
              deporte: line.attributes?.deporte || meta.disciplina,
              manga: line.attributes?.manga || person.manga,
            },
            [line.comments, person.comentarios].filter(Boolean).join(" · ")
          )
        : {
            product_base: "",
            principal: { genero: generoFromPerson },
            attributes: { genero: generoFromPerson },
            otros_atributos: "",
            comments: person.comentarios || "",
          };

      if (!sheet.cells[`A${row}`] || !isFormulaCell(sheet.cells[`A${row}`])) {
        if (!sheet.cells[`A${row}`]) sheet.cells[`A${row}`] = cell(String(i + 1));
      }
      if (!sheet.cells[`B${row}`] || !isFormulaCell(sheet.cells[`B${row}`])) {
        if (!sheet.cells[`B${row}`] && decomp.product_base) {
          sheet.cells[`B${row}`] = cell(decomp.product_base);
        }
      }

      sheet.cells[`C${row}`] = cell(person.nombre || "");
      sheet.cells[`D${row}`] = cell(person.numero || "");
      sheet.cells[`E${row}`] = cell(
        normalizeFormularioTalla(person.talla || "", readPedidoDropdownList(snapshot, "G"))
      );
      const colorNorm = normalizeFormularioColor(
        person.color_medias || meta.color_media || "",
        readPedidoDropdownList(snapshot, "H")
      );
      sheet.cells[`L${row}`] = cell(colorNorm); // Color medias en columna L
      writeAttrRow(row, decomp, { genero: generoFromPerson });
      filled += 1;
    });
  }
  // No padear filas G–M desde qty SO sin personas: enmascararía desfase detalle↔comercial.

  return { snapshot, filled, mode: "legacy_attrs" };
}

function parsePeopleFromSpreadsheet(snapshot) {
  const sheet =
    findSheet(snapshot, /formulario|aprobaci/i) || snapshot?.sheets?.[0];
  if (!sheet?.cells) return [];
  const byRow = {};
  for (const [addr, val] of Object.entries(sheet.cells)) {
    const m = addr.match(/^([A-L])(\d+)$/);
    if (!m) continue;
    const row = Number(m[2]);
    if (row < 2) continue;
    if (isFormulaCell(val) && (m[1] === "A" || m[1] === "B")) {
      // Fórmulas A/B no evaluadas vía XML-RPC: no contar como producto resuelto.
      byRow[row] = byRow[row] || {};
      byRow[row][`_${m[1]}_formula`] = true;
      continue;
    }
    byRow[row] = byRow[row] || {};
    byRow[row][m[1]] = compact(val?.content ?? val);
  }
  return Object.keys(byRow)
    .map(Number)
    .sort((a, b) => a - b)
    .map((row) => {
      const r = byRow[row];
      if (!r.C && !r.E && !r.K) return null;
      const productRaw = compact(r.B || "");
      return {
        person_id: `sheet_${row}`,
        identity: {
          display_name: r.C || "",
          print_name: r.C || "",
          number: r.D || "",
        },
        components: [
          {
            type: "uniforme",
            size: r.E || "",
            comment: [r.K, r.J].filter(Boolean).join(" · "),
            sleeve: r.G || "",
          },
        ],
        comments: r.K || "",
        color_medias: r.L || "",
        nombre: r.C || "",
        talla: r.E || "",
        producto: productRaw,
        product_base: productRaw,
        product_formula: Boolean(r._B_formula) && !productRaw,
        attributes: {
          cuello: r.F || "",
          manga: r.G || "",
          genero: r.H || "",
          deporte: r.I || "",
        },
        otros_atributos: r.J || "",
      };
    })
    .filter(Boolean);
}

function parsePedidoAttributes(snapshot) {
  const sheet = findProductosSheet(snapshot);
  if (!sheet?.cells) return [];
  const byRow = {};
  for (const [addr, val] of Object.entries(sheet.cells)) {
    const m = addr.match(/^([I-O])(\d+)$/);
    if (!m) continue;
    const row = Number(m[2]);
    if (row < 2) continue;
    byRow[row] = byRow[row] || {};
    byRow[row][m[1]] = compact(val?.content ?? val);
  }
  return Object.keys(byRow)
    .map(Number)
    .sort((a, b) => a - b)
    .map((row) => {
      const r = byRow[row];
      if (!r.I && !r.O && !r.N) return null;
      return {
        line_id: `pedido_${row}`,
        product_base: r.I || "",
        attributes: {
          cuello: r.J || "",
          manga: r.K || "",
          genero: r.L || "",
          deporte: r.M || "",
        },
        otros_atributos: r.N || "",
        comments: r.O || "",
      };
    })
    .filter(Boolean);
}

function applyLifeFormularioFill(
  snapshot,
  { detail, resolvedLines, orderLines } = {}
) {
  const clone = JSON.parse(JSON.stringify(snapshot || { sheets: [] }));
  ensurePedidoAttributeColumns(clone, resolvedLines, orderLines);
  const { filled, mode } = fillFormularioPeople(clone, {
    detail,
    resolvedLines,
    orderLines,
  });
  return { snapshot: clone, filled, mode: mode || "legacy_attrs" };
}

function buildMinimalLifeFormularioSnapshot() {
  return {
    version: "18.3.1",
    sheets: [
      {
        id: "formulario",
        name: "Formulario Life (Aprobación nombres, tallas y numero)",
        colNumber: 16,
        rowNumber: 200,
        cells: {
          A1: cell("Idx"),
          B1: cell("Producto"),
        },
        tables: [
          {
            range: "A1:M200",
            type: "static",
            config: {
              hasFilters: true,
              numberOfHeaders: 1,
              bandedRows: true,
              styleId: "TableStyleMedium2",
            },
          },
        ],
      },
      {
        id: "pedido",
        name: "Pedido",
        colNumber: 16,
        rowNumber: 80,
        cells: {
          A1: cell("Producto"),
          B1: cell("Cantidad"),
        },
        tables: [
          {
            range: "A1:O80",
            type: "static",
            config: { numberOfHeaders: 1, bandedRows: true, styleId: "TableStyleMedium5" },
          },
        ],
      },
    ],
    lists: {},
    settings: { locale: { code: "es_ES" } },
  };
}

const PEDIDO_HEADERS = PEDIDO_ATTR_HEADERS;
const ensureFormularioHeaders = (snapshot) => {
  const sheet = findSheet(snapshot, /formulario|aprobaci/i);
  if (!sheet) return snapshot;
  for (const [col, label] of Object.entries(FORMULARIO_HEADERS)) {
    setHeaderIfNeeded(sheet, `${col}1`, label);
  }
  return snapshot;
};


/**
 * sync_order_draft_from_odoo — Kapso ← Odoo (fuente de verdad).
 * Reconstruye resolved_lines + people desde sale.order + spreadsheet.
 */
async function odooRpc(env, service, method, args) {
  const resp = await fetch(`${env.ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
    }),
  });
  const json = await resp.json();
  if (json?.error) throw new Error(json.error?.message || "Odoo RPC error");
  return json.result;
}

function decodeSnapshot(b64) {
  if (!b64 || b64 === false) return null;
  try {
    const binary = atob(String(b64));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    try {
      // Node fallback
      const raw = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

async function syncOrderDraftFromOdoo(env, { orderId, orderName } = {}) {
  if (!env?.ODOO_URL || !env?.ODOO_DB || !env?.ODOO_USERNAME || !env?.ODOO_PASSWORD) {
    return { ok: false, error: "odoo_unavailable" };
  }
  const uid = await odooRpc(env, "common", "authenticate", [
    env.ODOO_DB,
    env.ODOO_USERNAME,
    env.ODOO_PASSWORD,
    {},
  ]);
  if (!uid) return { ok: false, error: "auth_failed" };

  const executeKw = (model, method, positionalArgs = [], kw = {}) =>
    odooRpc(env, "object", "execute_kw", [
      env.ODOO_DB,
      uid,
      env.ODOO_PASSWORD,
      model,
      method,
      positionalArgs,
      kw,
    ]);

  let soId = Number(orderId || 0) || null;
  if (!soId && orderName) {
    const found = await executeKw(
      "sale.order",
      "search_read",
      [[["name", "ilike", String(orderName).replace(/^S0*/i, "")]]],
      { fields: ["id", "name"], limit: 5 }
    );
    const exact = (found || []).find(
      (o) => String(o.name).toUpperCase() === String(orderName).toUpperCase()
    );
    soId = exact?.id || found?.[0]?.id || null;
  }
  if (!soId) return { ok: false, error: "order_not_found" };

  const orders = await executeKw(
    "sale.order",
    "read",
    [[soId]],
    {
      fields: [
        "id",
        "name",
        "state",
        "note",
        "partner_id",
        "order_line",
        "client_order_ref",
        "spreadsheet_ids",
      ],
    }
  );
  const order = orders?.[0];
  if (!order) return { ok: false, error: "order_not_found" };

  const lines = await executeKw(
    "sale.order.line",
    "search_read",
    [[["order_id", "=", soId], ["display_type", "=", false]]],
    {
      fields: [
        "id",
        "name",
        "product_id",
        "product_uom_qty",
        "price_unit",
        "product_template_id",
      ],
    }
  );

  // Lista: staff en tarea = fuente de verdad; fallback note del SO
  const tasks = await executeKw(
    "project.task",
    "search_read",
    [[["sale_order_id", "=", soId]]],
    { fields: ["id", "description", "write_date"], limit: 1, order: "id desc" }
  );
  const task = Array.isArray(tasks) ? tasks[0] : null;
  const taskHtml = String(task?.description || "").trim();
  const noteHtml = String(order.note || "").trim();
  const listaHtml = taskHtml.length >= 40 ? taskHtml : noteHtml;
  const listaSource =
    taskHtml.length >= 40 ? "task.description" : noteHtml ? "sale.order.note" : "none";

  const resolved_lines = [];
  for (let i = 0; i < (lines || []).length; i++) {
    const line = lines[i];
    const productId = line.product_id?.[0];
    if (!productId) continue;
    if (/dise[nñ]o/i.test(line.name || line.product_id?.[1] || "")) continue;

    let ptavs = [];
    const products = await executeKw(
      "product.product",
      "read",
      [[productId]],
      {
        fields: [
          "id",
          "display_name",
          "product_tmpl_id",
          "product_template_attribute_value_ids",
          "list_price",
        ],
      }
    );
    const product = products?.[0];
    if (product?.product_template_attribute_value_ids?.length) {
      ptavs = await executeKw(
        "product.template.attribute.value",
        "read",
        [product.product_template_attribute_value_ids],
        { fields: ["id", "name", "attribute_id"] }
      );
    }
    const split = splitProductDisplayName(product?.display_name || line.name);
    resolved_lines.push(
      buildResolvedLine(
        {
          line_id: `odoo_line_${line.id}`,
          product_text: product?.display_name || line.name,
          product_base: split.product_base,
          product_tmpl_id: product?.product_tmpl_id?.[0] || line.product_template_id?.[0],
          product_variant_id: productId,
          quantity: line.product_uom_qty,
          unit_cop: line.price_unit,
          confidence: "high",
          attributes: {
            ...split.embedded_attrs,
            ...attributesFromOdooPtavs(ptavs),
          },
        },
        i
      )
    );
  }

  let spreadsheetId = null;
  let spreadsheetUrl = null;
  let people = [];
  let pedidoAttrs = [];
  const sheetIds = order.spreadsheet_ids || [];
  if (sheetIds.length) {
    spreadsheetId = sheetIds[sheetIds.length - 1];
    const sheets = await executeKw(
      "sale.order.spreadsheet",
      "read",
      [[spreadsheetId]],
      { fields: ["id", "name", "spreadsheet_snapshot", "order_id"] }
    );
    const sheet = sheets?.[0];
    const snap = decodeSnapshot(sheet?.spreadsheet_snapshot);
    if (snap) {
      people = parsePeopleFromSpreadsheet(snap);
      pedidoAttrs = parsePedidoAttributes(snap);
      // merge pedido attrs into resolved lines by index
      pedidoAttrs.forEach((pa, idx) => {
        if (resolved_lines[idx]) {
          resolved_lines[idx].attributes = {
            ...resolved_lines[idx].attributes,
            ...pa.attributes,
          };
          if (pa.comments) resolved_lines[idx].comments = pa.comments;
          if (pa.product_base) resolved_lines[idx].product_base = pa.product_base;
        }
      });
    }
    spreadsheetUrl = `${env.ODOO_URL}/odoo/sales/${soId}/sale-order-spreadsheet/${spreadsheetId}`;
  }

  const detail = {
    schema_version: "life_order_people_v1",
    source: "odoo_sync",
    lista_source: listaSource,
    parse_status: "ok",
    people,
    person_count: people.length,
    rows: people.map((p) => ({
      nombre: p.identity?.print_name || "",
      numero: p.identity?.number || "",
      talla: p.components?.[0]?.size || "",
      comentario: p.comments || "",
      resolved_line_id: p.resolved_line_id || "",
    })),
  };

  // Si no hay people del spreadsheet, intentar filas desde HTML lista (tarea/note)
  if (!people.length && listaHtml) {
    const rows = parseDetailRowsFromNoteHtml(listaHtml);
    if (rows.length) {
      detail.rows = rows.map((r) => ({
        nombre: r.nombre || "",
        numero: r.numero || "",
        talla: r.talla || "",
        comentario: r.rol || "",
        manga: r.manga || "",
      }));
      detail.person_count = rows.length;
      detail.parse_status = "ok_from_lista_html";
      detail.lista_html_len = listaHtml.length;
    }
  }

  return {
    ok: true,
    order: {
      id: order.id,
      name: order.name,
      state: order.state,
      partner_id: order.partner_id,
    },
    task: task ? { id: task.id, write_date: task.write_date || null } : null,
    lista_source: listaSource,
    order_draft: {
      detail,
      commercial: {
        lines: resolved_lines.map((l) => ({
          product_text: l.product_text,
          quantity: l.quantity,
          category: l.category,
        })),
        resolved_lines,
      },
      spreadsheet: {
        id: spreadsheetId,
        url: spreadsheetUrl,
        status: people.length ? "complete" : "partial",
        source_of_truth: listaSource === "task.description" ? "odoo_task" : "odoo",
      },
      write: {
        status: "ready",
        code: "synced_from_odoo",
        synced_at: new Date().toISOString(),
      },
    },
  };
}



/**
 * Búsqueda y corrección de pedidos staff (sale.order + project.task).
 * Editable mientras la tarjeta NO esté en impresión / fabricación.
 */

/** Etapas donde ya no se puede corregir lista sin costo */
const LOCKED_STAGE_RE =
  /a\s*imprimir|fabricaci[oó]n|sublimaci[oó]n|confecci[oó]n|\bcorte\b|cobro\s*y\s*entrega|\bhecho\b|cancelad|entregad/i;

const EXCEL_VERIFY_WARNING =
  "Revise bien el Excel o la lista antes de confirmar: una vez el pedido pase a impresión o fabricación, los cambios del cliente tienen costo adicional.";

function hasOdooCredentials(env = {}) {
  return Boolean(env.ODOO_URL && env.ODOO_DB && env.ODOO_USERNAME && env.ODOO_PASSWORD);
}

function odooCredentialsError(toolName) {
  return {
    ok: false,
    error: "odoo_unavailable",
    message: `No hay credenciales Odoo en la función ${toolName}.`,
  };
}

/** Número corto del pedido: 2564 desde "2564", "02564", "S02564" */
function bareOrderNumber(raw) {
  let s = String(raw || "").trim().toUpperCase();
  s = s.replace(/^S0*/i, "").replace(/^S/i, "");
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  return String(parseInt(digits, 10));
}

function bareOrderNumberFromName(orderName) {
  const m = String(orderName || "").match(/S0*(\d+)/i);
  return m ? String(parseInt(m[1], 10)) : null;
}

function parseDetailRowsFromNoteHtml(html) {
  const rows = [];
  const body = String(html || "");
  const tbodyMatch = body.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return rows;
  const trs = tbodyMatch[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trs) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim()
    );
    if (tds.length < 2) continue;
    const nombre = tds[1];
    if (!nombre || /^nombre$/i.test(nombre)) continue;
    rows.push({
      numero: tds[0] === "—" ? "" : tds[0],
      nombre,
      talla: tds[2] === "—" ? "" : tds[2] || "",
      rol: tds[3] || "",
      manga: "",
      grupo: "",
    });
  }
  return rows.map((r) => toDetailRow(r)).filter(Boolean);
}

function patchDetailRows(existing, changes) {
  const out = (existing || []).map((r) => ({ ...r }));
  for (const raw of changes || []) {
    const ch = toDetailRow(raw);
    if (!ch) continue;
    const idx = out.findIndex(
      (r) =>
        (ch.numero && r.numero === ch.numero) ||
        (ch.nombre && r.nombre.toLowerCase() === ch.nombre.toLowerCase())
    );
    if (idx >= 0) out[idx] = { ...out[idx], ...ch };
    else out.push(ch);
  }
  return out;
}

function rowProductBucket(row) {
  const r = toDetailRow(row);
  if (!r) return "campo";
  if (r.arquero || /arquer|porter/i.test(r.rol || "")) return "arquero";
  const m = `${r.manga || ""} ${r.rol || ""}`.toLowerCase();
  if (/manga\s*larg|larg[ao]/.test(m)) return "manga_larga";
  if (/manga\s*cort|cort[ao]|sisa/.test(m)) return "manga_corta";
  return "campo";
}

function countRowsByBucket(rows) {
  const counts = { campo: 0, arquero: 0, manga_larga: 0, manga_corta: 0 };
  for (const row of rows || []) {
    const bucket = rowProductBucket(row);
    counts[bucket] = (counts[bucket] || 0) + 1;
  }
  return counts;
}

function detectProductMixChanges(oldRows, newRows) {
  return JSON.stringify(countRowsByBucket(oldRows)) !== JSON.stringify(countRowsByBucket(newRows));
}

function summarizeListDiff(oldRows, newRows) {
  const old = (oldRows || []).map((r) => toDetailRow(r)).filter(Boolean);
  const neu = (newRows || []).map((r) => toDetailRow(r)).filter(Boolean);
  const parts = [];
  if (detectProductMixChanges(old, neu)) {
    const ob = countRowsByBucket(old);
    const nb = countRowsByBucket(neu);
    const deltas = [];
    for (const key of Object.keys(nb)) {
      const d = (nb[key] || 0) - (ob[key] || 0);
      if (d) deltas.push(`${key.replace(/_/g, " ")} ${d > 0 ? "+" : ""}${d}`);
    }
    parts.push(`Variantes: ${deltas.join(", ") || "mezcla distinta"}`);
  }
  let detailChanges = 0;
  for (const nr of neu) {
    const match = old.find((o) => o.nombre.toLowerCase() === nr.nombre.toLowerCase());
    if (!match) {
      detailChanges++;
      continue;
    }
    if (match.talla !== nr.talla || match.numero !== nr.numero) detailChanges++;
  }
  if (detailChanges) parts.push(`${detailChanges} fila(s) con talla/número/nombre`);
  return parts.join(" · ") || "Lista actualizada";
}

function extractTitleFromNoteHtml(html) {
  const m = String(html || "").match(/<h1>([\s\S]*?)<\/h1>/i);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

function extractCommercialSummaryFromNoteHtml(html) {
  const m = String(html || "").match(
    /<h2>Resumen de uniformes<\/h2>[\s\S]*?(?=\n\n<hr>|\n\n<h2>|$)/i
  );
  return m ? m[0].trim() : "";
}

function mangaQtyParts(r) {
  if (Array.isArray(r.manga_parts) && r.manga_parts.length) {
    return r.manga_parts.map((p) => ({
      manga: String(p.manga || "").toLowerCase(),
      qty: Math.max(1, Number(p.qty) || 1),
    }));
  }
  const qty = Math.max(1, Number(r.cantidad || 1) || 1);
  const m = String(r.manga || "").toLowerCase();
  const hasL = /larga/.test(m);
  const hasC = /corta|sisa/.test(m);
  if (hasL && hasC) {
    // Sin desglose numérico: no inventar split; contar qty completa en el primer tipo
    return [{ manga: "larga", qty }];
  }
  if (hasL) return [{ manga: "larga", qty }];
  if (hasC) return [{ manga: "corta", qty }];
  return [{ manga: "corta", qty }];
}

function countRowsBySoLineBucket(rows) {
  const counts = {
    uniforme_corta: 0,
    uniforme_larga: 0,
    camiseta_corta: 0,
    camiseta_larga: 0,
  };
  for (const row of rows || []) {
    const r = toDetailRow(row);
    if (!r) continue;
    if (r.pantaloneta) continue;
    const isArquero = r.arquero || /arquer|porter/i.test(r.rol || "");
    const parts = mangaQtyParts(r);
    const add = (bucket, q) => {
      counts[bucket] += q;
    };
    for (const part of parts) {
      const q = part.qty;
      const isLarga = part.manga === "larga";
      if (r.camiseta && r.grupo === "femenino") {
        add(isLarga ? "camiseta_larga" : "camiseta_corta", q);
        continue;
      }
      if (isArquero) {
        if (r.grupo === "masculino" && r.uniforme !== false && !r.camiseta) {
          add(isLarga ? "uniforme_larga" : "uniforme_corta", q);
        } else {
          add(isLarga ? "camiseta_larga" : "camiseta_corta", q);
        }
        continue;
      }
      if (r.camiseta) {
        add(isLarga ? "camiseta_larga" : "camiseta_corta", q);
      } else {
        add(isLarga ? "uniforme_larga" : "uniforme_corta", q);
      }
    }
  }
  return counts;
}

function lineBucketFromSoName(name) {
  const n = String(name || "").toLowerCase();
  if (/diseño|diseno/.test(n)) return "design";
  const isCamiseta = /camiseta/.test(n) && !/uniforme/.test(n);
  const isLarga = /manga\s*larg|\blarga\b/.test(n);
  if (isCamiseta) return isLarga ? "camiseta_larga" : "camiseta_corta";
  if (/uniforme/.test(n)) return isLarga ? "uniforme_larga" : "uniforme_corta";
  if (/manga\s*cort|cort[ao]|sisa/.test(n)) return "uniforme_corta";
  return "campo";
}

async function syncSoLinesFromProductMix(executeKw, orderId, newRows, productIdByBucket = {}) {
  const buckets = { ...countRowsBySoLineBucket(newRows) };
  const lines = await executeKw(
    "sale.order.line",
    "search_read",
    [[["order_id", "=", orderId]]],
    { fields: ["id", "name", "product_uom_qty", "product_id"] }
  );
  const updates = [];
  const unmatched = [];

  for (const line of lines || []) {
    const bucket = lineBucketFromSoName(line.name);
    if (bucket === "design") continue;
    const targetQty = buckets[bucket] || 0;
    const currentQty = Number(line.product_uom_qty || 0);
    if (targetQty > 0) {
      if (currentQty !== targetQty) {
        await executeKw("sale.order.line", "write", [[line.id], { product_uom_qty: targetQty }]);
        updates.push({ line_id: line.id, name: line.name, from: currentQty, to: targetQty });
      } else {
        updates.push({ line_id: line.id, name: line.name, matched: true, qty: currentQty });
      }
      buckets[bucket] = 0;
    } else if (currentQty > 0 && bucket !== "campo" && bucket !== "design") {
      await executeKw("sale.order.line", "write", [[line.id], { product_uom_qty: 0 }]);
      updates.push({ line_id: line.id, name: line.name, from: currentQty, to: 0 });
    }
  }

  for (const [bucket, qty] of Object.entries(buckets)) {
    if (qty <= 0) continue;
    const productId = productIdByBucket[bucket];
    if (!productId) {
      unmatched.push({ bucket, qty });
      continue;
    }
    const newLineId = await executeKw("sale.order.line", "create", [
      {
        order_id: orderId,
        product_id: productId,
        product_uom_qty: qty,
      },
    ]);
    updates.push({ created: true, bucket, product_id: productId, qty, line_id: newLineId });
  }

  return { updates, unmatched, expected: countRowsBySoLineBucket(newRows) };
}

function normalizeStageName(stageName) {
  return String(stageName || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isStageEditable(stageName) {
  const s = normalizeStageName(stageName);
  if (!s) return true;
  return !LOCKED_STAGE_RE.test(s);
}

function changeTypeLabel(changeType) {
  const map = {
    cliente: "Cambio solicitado por el cliente",
    error_interno: "Corrección error interno Life (sin costo al cliente)",
    error_diseno: "Corrección error de diseño Life (sin costo al cliente)",
  };
  return map[changeType] || "Corrección de pedido";
}

function buildCorrectionChatterHtml({
  changeType,
  changeSummary,
  staffLabel,
  orderName,
  rowCount,
  productMixChanged,
  revisionNumber,
}) {
  const label = changeTypeLabel(changeType);
  const who = staffLabel || "Staff WhatsApp";
  const summary = String(changeSummary || "").trim() || "Actualización de lista.";
  const rows = rowCount ? `<p>Filas: <strong>${rowCount}</strong>.</p>` : "";
  const soNote = productMixChanged
    ? "<p>SO actualizada (cambió variante/producto).</p>"
    : "<p>SO sin cambios (solo lista en tarea).</p>";
  const revision = revisionNumber
    ? `<p>Revisión estructurada: <strong>V${String(revisionNumber).padStart(4, "0")}</strong>.</p>`
    : "";

  return `<p><strong>${label}</strong> — ${orderName || ""}</p>
<p>${who}</p>
<p>${summary}</p>
${rows}
${soNote}
${revision}`;
}

function jsonToBase64(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2));
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function archiveOrderRevision(executeKw, {
  order,
  task,
  beforeLines,
  changeType,
  changeSummary,
  staffLabel,
  listMode,
  productMixChanged,
  rowCount,
}) {
  const existing = await executeKw(
    "ir.attachment",
    "search_read",
    [[
      ["res_model", "=", "sale.order"],
      ["res_id", "=", order.id],
      ["name", "ilike", "life-order-revision-v"],
    ]],
    { fields: ["id", "name"], limit: 200, order: "id asc" }
  );
  const maxRevision = (existing || []).reduce((max, attachment) => {
    const match = String(attachment.name || "").match(/revision-v(\d+)/i);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);
  const number = maxRevision + 1;
  const ordersAfter = await executeKw("sale.order", "read", [[order.id]], {
    fields: ["id", "name", "state", "note", "amount_total", "write_date"],
  });
  const orderAfter = Array.isArray(ordersAfter) ? ordersAfter[0] : {};
  const tasksAfter = task?.id
    ? await executeKw("project.task", "read", [[task.id]], {
        fields: ["id", "name", "stage_id", "description", "write_date"],
      })
    : [];
  const taskAfter = Array.isArray(tasksAfter) ? tasksAfter[0] : null;
  const linesAfter = await executeKw(
    "sale.order.line",
    "search_read",
    [[["order_id", "=", order.id]]],
    {
      fields: ["id", "product_id", "name", "product_uom_qty", "price_unit", "write_date"],
      limit: 200,
      order: "id asc",
    }
  );
  const createdAt = new Date().toISOString();
  const snapshot = {
    schema_version: "life_order_revision_v1",
    revision_number: number,
    created_at: createdAt,
    order_id: order.id,
    order_name: order.name,
    order_state: order.state,
    change: {
      type: changeType,
      summary: changeSummary,
      requested_by: staffLabel,
      list_mode: listMode,
      product_mix_changed: Boolean(productMixChanged),
      row_count: Number(rowCount || 0),
    },
    before: {
      order: {
        note: order.note || "",
        amount_total: Number(order.amount_total || 0),
        write_date: order.write_date || null,
      },
      task: task
        ? {
            id: task.id,
            stage_id: task.stage_id || null,
            description: task.description || "",
            write_date: task.write_date || null,
          }
        : null,
      lines: beforeLines || [],
    },
    after: {
      order: orderAfter,
      task: taskAfter,
      lines: linesAfter || [],
    },
  };
  const name = `life-order-revision-v${String(number).padStart(4, "0")}.json`;
  const attachmentId = await executeKw("ir.attachment", "create", [
    {
      name,
      res_model: "sale.order",
      res_id: order.id,
      type: "binary",
      mimetype: "application/json",
      raw: jsonToBase64(snapshot),
    },
  ]);
  return { number, name, attachment_id: attachmentId, created_at: createdAt };
}

async function createOdooClient(env) {
  const rpc = async (service, method, args) => {
    const resp = await fetch(`${env.ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args } }),
    });
    const json = await resp.json();
    if (json?.error) throw new Error(json.error?.message || "Odoo RPC error");
    return json.result;
  };
  const uid = await rpc("common", "authenticate", [
    env.ODOO_DB,
    env.ODOO_USERNAME,
    env.ODOO_PASSWORD,
    {},
  ]);
  if (!uid) throw new Error("Odoo authentication failed");
  const executeKw = (model, method, positionalArgs = [], kw = {}) =>
    rpc("object", "execute_kw", [
      env.ODOO_DB,
      uid,
      env.ODOO_PASSWORD,
      model,
      method,
      positionalArgs,
      kw,
    ]);
  return { uid, executeKw };
}

function mapOrderRow(order, task) {
  const stage = Array.isArray(task?.stage_id) ? task.stage_id[1] : null;
  const editable = isStageEditable(stage);
  return {
    order_id: order.id,
    order_name: order.name,
    order_state: order.state,
    partner_name: Array.isArray(order.partner_id) ? order.partner_id[1] : null,
    partner_id: Array.isArray(order.partner_id) ? order.partner_id[0] : order.partner_id,
    amount_total: Number(order.amount_total || 0),
    date_order: order.date_order || null,
    task_id: task?.id || null,
    task_name: task?.name || null,
    task_stage: stage,
    editable,
    lock_reason: editable
      ? null
      : `Etapa «${stage}»: el pedido ya está en impresión o fabricación. Los cambios del cliente tienen costo.`,
  };
}

async function loadOrderBundle(executeKw, orderId) {
  const orders = await executeKw("sale.order", "read", [[orderId]], {
    fields: ["id", "name", "state", "partner_id", "amount_total", "date_order", "note", "write_date"],
  });
  const order = Array.isArray(orders) ? orders[0] : null;
  if (!order?.id) return null;

  const tasks = await executeKw(
    "project.task",
    "search_read",
    [[["sale_order_id", "=", orderId]]],
    {
      fields: ["id", "name", "stage_id", "description", "write_date"],
      limit: 1,
      order: "id desc",
    }
  );
  const task = Array.isArray(tasks) ? tasks[0] : null;
  return { order, task, mapped: mapOrderRow(order, task) };
}

/**
 * Lista HTML: staff en la tarea es fuente de verdad.
 * Preferir project.task.description; si falta, sale.order.note.
 */
function resolveListaHtmlFromBundle(bundle) {
  const taskHtml = String(bundle?.task?.description || "").trim();
  const noteHtml = String(bundle?.order?.note || "").trim();
  if (taskHtml.length >= 40) return { html: taskHtml, source: "task.description" };
  if (noteHtml.length >= 40) return { html: noteHtml, source: "sale.order.note" };
  return { html: taskHtml || noteHtml || "", source: taskHtml ? "task.description" : noteHtml ? "sale.order.note" : "empty" };
}

/** Texto plano de un mensaje WhatsApp (Kapso / Cloud API). */
function waMessageText(msg) {
  if (!msg || typeof msg !== "object") return "";
  const direct = msg.content ?? msg.body;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = msg.text;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  if (nested && typeof nested === "object") {
    const body = nested.body ?? nested.text;
    if (typeof body === "string" && body.trim()) return body.trim();
  }
  if (typeof msg.caption === "string" && msg.caption.trim()) return msg.caption.trim();
  return "";
}

function extractOrderNumberFromText(text) {
  const s = String(text || "");
  const soMatch = s.match(/\bS0*(\d{3,6})\b/i);
  if (soMatch) return bareOrderNumber(soMatch[0]);
  const pedidoMatch = s.match(/(?:pedido|orden|presupuesto|so|n[°º]?)\s*#?\s*0*(\d{3,6})\b/i);
  if (pedidoMatch) return bareOrderNumber(pedidoMatch[1]);
  const corrMatch = s.match(/(?:corregir|actualizar|modificar|update)\s+(?:el\s+)?(?:pedido\s+)?#?\s*0*(\d{3,6})\b/i);
  if (corrMatch) return bareOrderNumber(corrMatch[1]);
  const looseNum = s.match(/\b0*(\d{4,6})\b/);
  if (looseNum && /actualizar|corregir|modificar|pedido|lista/i.test(s)) {
    return bareOrderNumber(looseNum[1]);
  }
  return null;
}

function extractCustomerNameFromText(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const afterNum = s.match(/\b0*\d{3,6}\b\s+([A-Za-zÁÉÍÓÚáéíóúñÑ][\w\sÁÉÍÓÚáéíóúñÑ.-]{2,40})/);
  if (afterNum) return afterNum[1].trim();
  const deMatch = s.match(/(?:de|para|cliente)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ][\w\sÁÉÍÓÚáéíóúñÑ.-]{2,40})/i);
  if (deMatch) return deMatch[1].trim();
  return null;
}

/** Une input explícito + vars persistidas + texto reciente del hilo WhatsApp. */
function resolveStaffOrderSearchInput(body = {}) {
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const messages = Array.isArray(body?.whatsapp_context?.messages)
    ? body.whatsapp_context.messages
    : [];

  const fromInput = bareOrderNumber(
    input.order_number || input.order_name || input.numero_pedido || ""
  );

  const sessionBare =
    bareOrderNumber(vars.order_session?.order_name) ||
    bareOrderNumber(vars.order_correction?.target_order_name) ||
    bareOrderNumber(vars.order?.name) ||
    null;
  const sessionId =
    Number(vars.order_session?.order_id || vars.order_correction?.target_order_id || vars.order?.id || 0) ||
    0;

  // Número en el hilo que difiere de la sesión → cambio de pedido (no reusar el anterior).
  let threadNumber = null;
  let threadName = "";
  for (const msg of [...messages].reverse()) {
    if (msg.direction && msg.direction !== "inbound") continue;
    const text = waMessageText(msg);
    if (!text) continue;
    if (!threadNumber) threadNumber = extractOrderNumberFromText(text);
    if (!threadName) threadName = extractCustomerNameFromText(text) || "";
    if (threadNumber) break;
  }

  const requestedBare = fromInput || threadNumber || null;
  const isSwitchAway =
    Boolean(sessionId) &&
    Boolean(requestedBare) &&
    Boolean(sessionBare) &&
    requestedBare !== sessionBare;

  if (!isSwitchAway && vars.order_correction?.target_order_id) {
    const n =
      fromInput ||
      bareOrderNumber(vars.order_correction.target_order_name || "") ||
      bareOrderNumber(vars.order?.name || "");
    return {
      order_number: n,
      order_id: vars.order_correction.target_order_id,
      customer_phone: input.customer_phone || input.phone || "",
      customer_name: input.customer_name || threadName || "",
      source: fromInput ? "input" : "vars.order_correction",
      already_resolved: true,
      session_switch: false,
    };
  }

  if (!isSwitchAway && vars.order?.id) {
    const n = fromInput || bareOrderNumber(vars.order.name || "");
    if (n) {
      return {
        order_number: n,
        order_id: vars.order.id,
        customer_phone: input.customer_phone || input.phone || "",
        customer_name: input.customer_name || threadName || "",
        source: fromInput ? "input" : "vars.order",
        already_resolved: true,
        session_switch: false,
      };
    }
  }

  let orderNumber = fromInput || (isSwitchAway ? requestedBare : null);
  let source = fromInput ? "input" : isSwitchAway ? "session_switch" : null;

  if (!orderNumber) {
    orderNumber = bareOrderNumber(vars.order_correction?.target_order_name || "");
    if (orderNumber) source = "vars.order_correction";
  }

  let customerName = String(input.customer_name || input.partner_name || "").trim() || threadName;

  if (!orderNumber || !customerName) {
    for (const msg of [...messages].reverse()) {
      if (msg.direction && msg.direction !== "inbound") continue;
      const text = waMessageText(msg);
      if (!text) continue;
      if (!orderNumber) {
        const found = extractOrderNumberFromText(text);
        if (found) {
          orderNumber = found;
          source = source || "whatsapp_thread";
        }
      }
      if (!customerName) {
        const name = extractCustomerNameFromText(text);
        if (name) customerName = name;
      }
      if (orderNumber && customerName) break;
    }
  }

  return {
    order_number: orderNumber,
    order_id: null,
    customer_phone: input.customer_phone || input.phone || "",
    customer_name: customerName,
    source,
    already_resolved: false,
    session_switch: isSwitchAway,
    previous_session_order_id: isSwitchAway ? sessionId : null,
  };
}

function orderNameCandidates(bareNumber) {
  const n = parseInt(String(bareNumber || ""), 10);
  if (!n) return [];
  return [...new Set([`S0${String(n).padStart(4, "0")}`, `S0${n}`, `S${n}`])];
}

/** Dominio Odoo OR en notación polaca: ['|', '|', A, B, C] */
function odooOrDomain(conditions) {
  const items = (conditions || []).filter(Boolean);
  if (!items.length) return [];
  if (items.length === 1) return items;
  return [...Array(items.length - 1).fill("|"), ...items];
}

async function searchStaffOrders(executeKw, input = {}) {
  const orderNumber = bareOrderNumber(
    input.order_number || input.order_name || input.numero_pedido || ""
  );
  const customerPhone = String(input.customer_phone || input.phone || "").trim();
  const customerName = String(input.customer_name || input.partner_name || "").trim();
  const limit = Math.min(Math.max(Number(input.limit || 5), 1), 10);

  const orderFields = ["id", "name", "state", "partner_id", "amount_total", "date_order", "write_date"];

  if (!orderNumber) {
    return {
      orders: [],
      partner_id: null,
      note: "Indique el número del pedido (solo dígitos, ej. 2564).",
      order_number: null,
    };
  }

  const nameCandidates = orderNameCandidates(orderNumber);
  const nameOr = odooOrDomain(nameCandidates.map((name) => ["name", "ilike", name]));

  let domain = ["&", ["state", "in", ["draft", "sent", "sale"]], ...nameOr];

  let resolvedPartnerId = 0;
  if (customerPhone) {
    const lookup = await findPartnerByWaPhone(executeKw, customerPhone, {
      fields: ["id", "name"],
    });
    resolvedPartnerId = lookup.partner?.id || 0;
    if (resolvedPartnerId) {
      domain = ["&", ["partner_id", "=", resolvedPartnerId], ...domain];
    }
  } else if (customerName) {
    domain = ["&", ["partner_id.name", "ilike", customerName], ...domain];
  }

  const rows = await executeKw("sale.order", "search_read", [domain], {
    fields: orderFields,
    limit: 20,
    order: "id desc",
  });

  let matched = (rows || []).filter(
    (o) => bareOrderNumberFromName(o.name) === orderNumber
  );

  if (!matched.length) {
    matched = await searchStaffOrdersViaTask(executeKw, orderNumber, customerName, orderFields);
  }

  return {
    orders: await enrichOrdersWithTasks(executeKw, matched.slice(0, limit)),
    partner_id:
      (Array.isArray(matched[0]?.partner_id) ? matched[0].partner_id[0] : null) ||
      resolvedPartnerId ||
      null,
    note: matched.length ? null : `No encontré pedido ${orderNumber}${customerName ? ` (${customerName})` : ""}.`,
    order_number: orderNumber,
  };
}

async function searchStaffOrdersViaTask(executeKw, orderNumber, customerName, orderFields) {
  const nameCandidates = orderNameCandidates(orderNumber);
  const taskNameConds = [
    ...nameCandidates.map((name) => ["name", "ilike", name]),
    ["name", "ilike", orderNumber],
  ];
  let taskDomain = odooOrDomain(taskNameConds);
  if (customerName) {
    taskDomain = ["&", ["partner_id.name", "ilike", customerName], ...taskDomain];
  }

  const tasks = await executeKw("project.task", "search_read", [taskDomain], {
    fields: ["id", "name", "stage_id", "sale_order_id", "partner_id"],
    limit: 10,
    order: "id desc",
  });

  const orderIds = [];
  const seen = new Set();
  for (const task of tasks || []) {
    const soId = Array.isArray(task.sale_order_id) ? task.sale_order_id[0] : task.sale_order_id;
    const soName = Array.isArray(task.sale_order_id) ? task.sale_order_id[1] : "";
    const taskName = String(task.name || "");
    const numOk =
      bareOrderNumberFromName(soName) === orderNumber ||
      bareOrderNumberFromName(taskName) === orderNumber ||
      taskName.includes(orderNumber);
    if (!soId || !numOk || seen.has(soId)) continue;
    seen.add(soId);
    orderIds.push(soId);
  }

  if (!orderIds.length) return [];

  const orders = await executeKw("sale.order", "read", [orderIds], { fields: orderFields });
  return (orders || []).filter((o) => bareOrderNumberFromName(o.name) === orderNumber);
}

async function enrichOrdersWithTasks(executeKw, orders) {
  const out = [];
  for (const order of orders) {
    const tasks = await executeKw(
      "project.task",
      "search_read",
      [[["sale_order_id", "=", order.id]]],
      { fields: ["id", "name", "stage_id"], limit: 1, order: "id desc" }
    );
    const task = Array.isArray(tasks) ? tasks[0] : null;
    out.push(mapOrderRow(order, task));
  }
  return out;
}

function resolveCorrectionNoteHtml(vars = {}, input = {}, options = {}) {
  const orderDraft = vars.order_draft || {};
  let detailRows = orderDraft.detail?.rows || input.detail_rows || [];
  const listMode = options.listMode || input.list_mode || "full";
  const existingHtml = options.existingNoteHtml || "";
  const productMixChanged = Boolean(options.productMixChanged);

  if (listMode === "patch" && detailRows.length && existingHtml) {
    const existingRows = parseDetailRowsFromNoteHtml(existingHtml);
    detailRows = patchDetailRows(existingRows, detailRows);
  }

  if (!detailRows.length) return null;

  const preservedCommercial = extractCommercialSummaryFromNoteHtml(existingHtml);
  const preservedTitle = extractTitleFromNoteHtml(existingHtml);

  const commercialLines =
    productMixChanged && orderDraft.commercial?.lines?.length
      ? orderDraft.commercial.lines
      : productMixChanged && vars.quote?.product_text
        ? [
            {
              name: vars.quote.product_text,
              quantity: vars.quote.quantity,
              variant_notes: orderDraft.commercial?.variant_notes || "",
            },
          ]
        : [];

  return {
    html: buildOdooOrderNoteHtml({
      title:
        preservedTitle ||
        orderDraft.title ||
        vars.quote?.order_or_team_name_for_billing ||
        "Pedido",
      commercialSummaryHtml:
        productMixChanged && commercialLines.length ? "" : preservedCommercial,
      commercialLines: productMixChanged && commercialLines.length ? commercialLines : [],
      detailRows,
      listLayout: orderDraft.detail?.excel_layout || orderDraft.detail?.layout || null,
      projectName: orderDraft.project?.name || null,
      blockers: productMixChanged ? orderDraft.blockers || [] : [],
      referenceFiles: (orderDraft.attachments || [])
        .filter((a) => a.role === "design_reference")
        .map((a) => a.filename || a.url),
      designNotes: orderDraft.design_notes || null,
    }),
    rowCount: detailRows.length,
    productMixChanged,
  };
}

async function applyOrderCorrection(executeKw, {
  orderId,
  orderNoteHtml,
  changeType,
  changeSummary,
  staffLabel,
  attachments,
  rowCount,
  listMode,
  attachmentsOnly,
  productMixChanged,
  newRows,
}) {
  const bundle = await loadOrderBundle(executeKw, orderId);
  if (!bundle) throw new Error("order_not_found");

  const { order, task, mapped } = bundle;
  if (!mapped.editable) {
    return {
      ok: false,
      error: "order_locked",
      message: mapped.lock_reason,
      order: mapped,
    };
  }

  const hasList = orderNoteHtml && orderNoteHtml.length >= 40;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  const beforeLines = await executeKw(
    "sale.order.line",
    "search_read",
    [[["order_id", "=", order.id]]],
    {
      fields: ["id", "product_id", "name", "product_uom_qty", "price_unit", "write_date"],
      limit: 200,
      order: "id asc",
    }
  );

  if (!hasList && !attachmentsOnly) {
    return {
      ok: false,
      error: "missing_list",
      message: "Falta lista (organización de datos) o adjuntos.",
      order: mapped,
    };
  }

  if (hasList && task?.id) {
    // Tarea = fuente de verdad de la lista (staff puede editar description).
    await executeKw("project.task", "write", [[task.id], { description: orderNoteHtml }]);
  }

  // Presupuesto SO: espejo de la lista cuando el SO existe.
  let soLineUpdates = { updates: [], unmatched: [] };
  if (hasList) {
    await executeKw("sale.order", "write", [[order.id], { note: orderNoteHtml }]);
    if (productMixChanged) {
      soLineUpdates = await syncSoLinesFromProductMix(executeKw, order.id, newRows || []);
    }
  }

  const revision = await archiveOrderRevision(executeKw, {
    order,
    task,
    beforeLines,
    changeType,
    changeSummary,
    staffLabel,
    listMode: listMode || (hasList ? "full" : "attachments_only"),
    rowCount: hasList ? rowCount || 0 : 0,
    productMixChanged,
  });
  const chatterBody = buildCorrectionChatterHtml({
    changeType,
    changeSummary,
    staffLabel,
    orderName: order.name,
    rowCount: hasList ? rowCount || 0 : 0,
    productMixChanged,
    revisionNumber: revision.number,
  });

  try {
    await executeKw(
      "sale.order",
      "message_post",
      [[order.id]],
      {
        body: chatterBody,
        message_type: "comment",
        subtype_xmlid: "mail.mt_note",
      }
    );
  } catch (_e) {
    await executeKw("sale.order", "message_post", [[order.id]], {
      body: chatterBody,
      message_type: "comment",
    });
  }

  let attachResult = { uploaded: [], errors: [] };
  if (hasAttachments) {
    // Adjuntos al presupuesto (SO); también a tarea si existe.
    const soAttach = await attachDraftFiles(executeKw, "sale.order", order.id, attachments);
    let taskAttach = { uploaded: [], errors: [] };
    if (task?.id) {
      taskAttach = await attachTaskDraftFiles(executeKw, task.id, attachments);
    }
    const seen = new Set();
    const uploaded = [];
    for (const u of [...(soAttach.uploaded || []), ...(taskAttach.uploaded || [])]) {
      const key = `${u.name || ""}:${u.id || u.skipped || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uploaded.push(u);
    }
    attachResult = {
      uploaded,
      errors: [...(soAttach.errors || []), ...(taskAttach.errors || [])],
    };
  }

  const summaryParts = [`${order.name}`];
  if (hasList) summaryParts.push(`${rowCount || 0} filas en nota/lista`);
  if (attachResult.uploaded.length) summaryParts.push(`${attachResult.uploaded.length} adjunto(s)`);
  summaryParts.push(
    productMixChanged ? "SO líneas actualizadas" : hasList ? "SO nota actualizada" : "SO sin cambios de líneas"
  );
  summaryParts.push(`revisión V${String(revision.number).padStart(4, "0")}`);

  return {
    ok: true,
    order: mapped,
    summary: summaryParts.join(" · "),
    attachments_uploaded: attachResult.uploaded.length,
    attachments_errors: attachResult.errors,
    list_mode: listMode || (hasList ? "full" : "attachments_only"),
    product_mix_changed: productMixChanged,
    so_line_updates: soLineUpdates.updates,
    so_line_unmatched: soLineUpdates.unmatched,
    revision,
    excel_warning: EXCEL_VERIFY_WARNING,
  };
}


/**
 * Sesión de pedido activo en carril staff Kapso.
 * Un solo pedido por chat: al cambiar (Fredy → Daniel Tovar) se limpia el draft anterior.
 * Sin imports de odoo_order_correction (evita ciclo en el bundle).
 */






/** Normaliza nombre para comparar FREDY BRAM vs Fredy Bram. */
function normalizeDisplayName(raw) {
  return compact(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function namesLikelyDifferent(a, b) {
  const na = normalizeDisplayName(a);
  const nb = normalizeDisplayName(b);
  if (!na || !nb) return false;
  if (na === nb) return false;
  if (na.includes(nb) || nb.includes(na)) return false;
  const ta = new Set(na.split(/\s+/).filter((t) => t.length > 2));
  const tb = new Set(nb.split(/\s+/).filter((t) => t.length > 2));
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;
  return overlap === 0;
}

/** Parche de lista sin número de pedido (ej. «ODALINDA ES UNIFORME FEMENINO»). */
function isLikelyListPatchMessage(text) {
  const s = compact(text);
  if (!s || s.length > 160) return false;
  if (extractOrderNumberFromText(s)) return false;
  if (/\b(retoma|retomar|nuevo pedido|pasamos a|ahora el pedido|pedido de)\b/i.test(s)) {
    return false;
  }
  if (
    /\b(femenin|masculin|talla|dorsal|arquero|uniforme|camiseta|manga|larga|corta)\b/i.test(s)
  ) {
    return true;
  }
  if (
    /^(cambia|cambiar|corrije|corregir|pasa|pasar|pon|poner)\b/i.test(s) &&
    s.split(/\s+/).length <= 12
  ) {
    return true;
  }
  return false;
}

function readOrderSession(vars = {}) {
  const s = vars?.order_session;
  if (s && Number(s.order_id) > 0) {
    return {
      order_id: Number(s.order_id),
      order_name: compact(s.order_name) || null,
      display_name: compact(s.display_name) || null,
      bound_at: s.bound_at || null,
      source: s.source || null,
    };
  }
  const id = Number(vars?.order_correction?.target_order_id || vars?.order?.id || 0) || 0;
  if (!id) return null;
  return {
    order_id: id,
    order_name: compact(vars?.order_correction?.target_order_name || vars?.order?.name) || null,
    display_name:
      compact(vars?.order_session?.display_name || vars?.quote?.customer_display_name) || null,
    bound_at: null,
    source: "legacy",
  };
}

function buildOrderSession({
  orderId,
  orderName,
  displayName = null,
  source = "buscar",
  boundAt = null,
} = {}) {
  const id = Number(orderId) || 0;
  if (!id) return null;
  return {
    order_id: id,
    order_name: compact(orderName) || null,
    display_name: compact(displayName) || null,
    bound_at: boundAt || new Date().toISOString(),
    source: compact(source) || "buscar",
  };
}

/** Draft vacío — no reutiliza filas/adjuntos del pedido anterior. */
function emptyOrderDraft() {
  return {
    schema_version: "order_draft_v1",
    detail: { rows: [], parse_status: null },
    attachments: [],
    blockers: [],
    commercial: { lines: [] },
  };
}

/**
 * Vars a fusionar al cambiar de pedido (antes de anclar el nuevo).
 * No toca nómina/compra.
 */
function clearOrderSessionVars() {
  return {
    order_draft: emptyOrderDraft(),
    order_correction: {
      search_status: null,
      target_order_id: null,
      target_order_name: null,
      cleared_for_switch: true,
    },
    order: null,
    order_session: null,
  };
}

/**
 * ¿El mensaje / target apunta a otro pedido que la sesión activa?
 */
function detectOrderSessionSwitch({
  session = null,
  incomingOrderId = null,
  incomingOrderName = null,
  incomingDisplayName = null,
  messageText = "",
} = {}) {
  const text = compact(messageText);
  const msgNum = extractOrderNumberFromText(text);
  const msgName = extractCustomerNameFromText(text);
  const displayIn = compact(incomingDisplayName) || msgName || null;
  const nameIn = compact(incomingOrderName);
  const bareIn =
    bareOrderNumber(nameIn) || bareOrderNumberFromName(nameIn) || msgNum || null;
  const idIn = Number(incomingOrderId) || 0;

  if (!session?.order_id) {
    return {
      switch: false,
      reason: "no_session",
      incoming_order_number: bareIn,
      incoming_display_name: displayIn,
    };
  }

  if (idIn && idIn !== Number(session.order_id)) {
    return {
      switch: true,
      reason: "order_id",
      incoming_order_number: bareIn,
      incoming_display_name: displayIn,
    };
  }

  const sessionBare =
    bareOrderNumber(session.order_name) || bareOrderNumberFromName(session.order_name);
  if (bareIn && sessionBare && bareIn !== sessionBare) {
    return {
      switch: true,
      reason: "order_number",
      incoming_order_number: bareIn,
      incoming_display_name: displayIn,
    };
  }

  if (isLikelyListPatchMessage(text) && !bareIn) {
    return {
      switch: false,
      reason: "list_patch",
      incoming_order_number: null,
      incoming_display_name: displayIn,
    };
  }

  const switchPhrase =
    /\b(retoma|retomar|pedido\s+de|ahora\s+(el\s+)?pedido|pasamos\s+a|cambiar\s+(de\s+)?pedido|nuevo\s+pedido)\b/i.test(
      text
    );
  if (displayIn && session.display_name && namesLikelyDifferent(displayIn, session.display_name)) {
    if (switchPhrase || compact(incomingDisplayName)) {
      return {
        switch: true,
        reason: "display_name",
        ambiguous: !bareIn && !idIn,
        incoming_order_number: bareIn,
        incoming_display_name: displayIn,
      };
    }
  }

  return {
    switch: false,
    reason: "same",
    incoming_order_number: bareIn,
    incoming_display_name: displayIn,
  };
}

/**
 * Si el target no coincide con la sesión → mismatch (no mergear draft ajeno).
 */
function orderSessionMismatch(vars, targetOrderId) {
  const session = readOrderSession(vars);
  const target = Number(targetOrderId) || 0;
  if (!session?.order_id || !target) return null;
  if (Number(session.order_id) === target) return null;

  return {
    status: "order_session_mismatch",
    message:
      `Pedido activo: ${session.order_name || session.order_id}` +
      (session.display_name ? ` (${session.display_name})` : "") +
      `. Pidió otro id ${target}. Llame buscar_pedido_odoo del nuevo pedido (limpia el anterior).`,
    active_session: session,
    target_order_id: target,
  };
}

/** Texto inbound reciente del body Kapso (para detección de switch). */
function latestInboundText(body = {}) {
  const messages = Array.isArray(body?.whatsapp_context?.messages)
    ? body.whatsapp_context.messages
    : [];
  for (const msg of [...messages].reverse()) {
    if (msg.direction && msg.direction !== "inbound") continue;
    const t =
      msg.content ||
      msg.text?.body ||
      (typeof msg.text === "string" ? msg.text : "") ||
      msg.body ||
      "";
    const s = compact(t);
    if (s) return s;
  }
  const input = body?.input || {};
  return compact(input.message || input.text || input.change_summary || "");
}


/**
 * Kapso tool: corregir-pedido-odoo (staff)
 */
const VALID_CHANGE_TYPES = new Set(["cliente", "error_interno", "error_diseno"]);
const VALID_LIST_MODES = new Set(["full", "patch", "attachments_only"]);

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role !== "staff") {
    return json({ ok: false, error: "staff_only" }, 403);
  }
  if (!hasOdooCredentials(env)) {
    return json(odooCredentialsError("corregir-pedido-odoo"));
  }

  const orderId =
    Number(input.order_id || vars.order_correction?.target_order_id || vars.order?.id || 0) || 0;
  const changeType = String(input.change_type || "cliente").trim();
  let changeSummary = String(
    input.change_summary || input.change_description || vars.order_correction?.change_summary || ""
  ).trim();
  const listMode = String(input.list_mode || vars.order_correction?.list_mode || "").trim();

  if (!orderId) {
    return json({ ok: false, status: "needs_order", message: "Falta pedido." });
  }
  if (!VALID_CHANGE_TYPES.has(changeType)) {
    return json({ ok: false, status: "invalid_change_type" });
  }

  const mismatch = orderSessionMismatch(vars, orderId);
  if (mismatch) {
    return json({
      ok: false,
      status: mismatch.status,
      message: mismatch.message,
      active_session: mismatch.active_session,
      target_order_id: mismatch.target_order_id,
    });
  }

  const orderDraft = vars.order_draft || {};
  let detailRows = orderDraft.detail?.rows || [];
  const attachments = (orderDraft.attachments || []).filter((a) =>
    String(a?.url || "").startsWith("http")
  );
  const hasExcel = attachments.some(
    (a) => a.role === "detail_list" || /\.xlsx?$/i.test(a.filename || "")
  );

  let resolvedListMode = listMode;
  if (!resolvedListMode) {
    if (!detailRows.length && attachments.length) resolvedListMode = "attachments_only";
    else if (hasExcel) resolvedListMode = "full";
    else resolvedListMode = "patch";
  }
  if (!VALID_LIST_MODES.has(resolvedListMode)) resolvedListMode = "full";

  if (resolvedListMode !== "attachments_only" && !detailRows.length) {
    return json({ ok: false, status: "needs_list", message: "Falta lista." });
  }
  if (resolvedListMode === "attachments_only" && !attachments.length) {
    return json({ ok: false, status: "needs_attachments" });
  }

  const staffLabel = vars?.user?.name || vars?.user?.phone || "Staff";

  try {
    const { executeKw } = await createOdooClient(env);
    const bundle = await loadOrderBundle(executeKw, orderId);
    const listaSrc = resolveListaHtmlFromBundle(bundle);
    const existingNoteHtml = listaSrc.html;
    const oldRows = parseDetailRowsFromNoteHtml(existingNoteHtml);

    const productMixChanged =
      resolvedListMode !== "attachments_only" && detectProductMixChanges(oldRows, detailRows);

    if (!changeSummary && resolvedListMode !== "attachments_only") {
      changeSummary = summarizeListDiff(oldRows, detailRows);
    }
    if (!changeSummary && resolvedListMode === "attachments_only") {
      changeSummary = "Archivos subidos a la tarea.";
    }
    if (!changeSummary) {
      return json({ ok: false, status: "needs_summary" });
    }

    let orderNoteHtml = null;
    let rowCount = 0;
    let finalRows = detailRows;

    if (resolvedListMode !== "attachments_only") {
      const resolved = resolveCorrectionNoteHtml(vars, input, {
        listMode: resolvedListMode,
        existingNoteHtml,
        productMixChanged,
      });
      orderNoteHtml = resolved?.html || null;
      rowCount = resolved?.rowCount || 0;
      if (resolvedListMode === "patch" && oldRows.length) {
        finalRows = patchDetailRows(oldRows, detailRows);
      }
      if (!orderNoteHtml) {
        return json({ ok: false, status: "needs_list" });
      }
    }

    const result = await applyOrderCorrection(executeKw, {
      orderId,
      orderNoteHtml,
      changeType,
      changeSummary,
      staffLabel,
      attachments,
      rowCount,
      listMode: resolvedListMode,
      attachmentsOnly: resolvedListMode === "attachments_only",
      productMixChanged,
      newRows: finalRows,
    });

    if (!result.ok) {
      return json({
        ok: false,
        status: result.error,
        message: result.message,
        order: result.order,
      });
    }

    let syncedDraft = null;
    try {
      const synced = await syncOrderDraftFromOdoo(env, {
        orderId: result.order.order_id,
        orderName: result.order.order_name,
      });
      if (synced?.ok) syncedDraft = synced.order_draft;
    } catch {
      syncedDraft = null;
    }

    if (syncedDraft) {
      syncedDraft.order_session_id = result.order.order_id;
      syncedDraft.meta = {
        ...(syncedDraft.meta || {}),
        order_session_id: result.order.order_id,
      };
    }

    const prevSession = readOrderSession(vars);
    const orderSession = buildOrderSession({
      orderId: result.order.order_id,
      orderName: result.order.order_name,
      displayName: prevSession?.display_name || null,
      source: "corregir",
      boundAt: now,
    });

    return json({
      ok: true,
      status: "corrected",
      message: `Listo. ${result.summary}`,
      summary: result.summary,
      product_mix_changed: result.product_mix_changed,
      so_updated: result.product_mix_changed,
      order: result.order,
      vars: {
        order_session: orderSession,
        order_correction: {
          apply_status: "corrected",
          target_order_id: orderId,
          target_order_name: result.order.order_name,
          target_task_id: result.order.task_id,
          change_type: changeType,
          change_summary: changeSummary,
          list_mode: resolvedListMode,
          product_mix_changed: result.product_mix_changed,
          corrected_at: now,
          synced_from_odoo: Boolean(syncedDraft),
          revision_number: result.revision?.number || null,
          revision_attachment_id: result.revision?.attachment_id || null,
        },
        order: { id: result.order.order_id, name: result.order.order_name },
        order_lifecycle: {
          schema_version: "life_order_lifecycle_v1",
          state:
            result.order.order_state === "sale"
              ? "confirmed_revisioned"
              : "draft_revisioned",
          active_revision: result.revision?.number || 0,
          revision_attachment_id: result.revision?.attachment_id || null,
          updated_at: now,
        },
        ...(syncedDraft ? { order_draft: syncedDraft } : {}),
        ...serviceVars("corregir_pedido_odoo", "ready", now, result.summary),
      },
    });
  } catch (err) {
    return json({ ok: false, error: "odoo_error", message: String(err?.message || err) });
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}



