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
  if (row?.uniforme === true) return "Uniforme de Fútbol";
  // Sin evidencia de sección/producto: no inventar Uniforme de Fútbol
  return null;
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
    if (!productText) continue; // sin evidencia de producto: no inventar línea
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
          (raw.camiseta ? "camiseta" : raw.uniforme === true ? "uniforme" : "otros"),
      });
    }
    groups.get(key).quantity += Math.max(
      1,
      Number(raw.cantidad || raw.quantity || raw.qty || 1) || 1
    );
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
 * Parseo Excel FORMATO PEDIDO LIFE → filas de lista.
 * Lee .xlsx como ZIP + XML (sin dependencias npm).
 */

function stripDiacritics(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeSheetLabel(name) {
  return stripDiacritics(String(name ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Pestaña estándar Life: «formato life», «formatolife», etc. */
function isFormatoLifeSheet(name) {
  const n = normalizeSheetLabel(name);
  const compact = n.replace(/\s/g, "");
  if (compact.includes("formatolife")) return true;
  return n.includes("formato") && n.includes("life");
}

/**
 * Elige pestaña a leer. Si hay varias sin «formato life», pide confirmación.
 * @returns {{ pick: {name, path}|null, needsChoice: boolean, choices?: string[], message?: string }}
 */
function pickLifeExcelSheet(sheets) {
  const list = (sheets || []).filter((s) => s?.path);
  if (!list.length) {
    return { pick: null, needsChoice: false, message: "Excel sin hojas." };
  }

  const formatoLife = list.filter((s) => isFormatoLifeSheet(s.name));
  if (formatoLife.length === 1) {
    return { pick: formatoLife[0], needsChoice: false };
  }
  if (formatoLife.length > 1) {
    return { pick: formatoLife[0], needsChoice: false };
  }

  if (list.length === 1) {
    return { pick: list[0], needsChoice: false };
  }

  const names = list.map((s) => s.name);
  return {
    pick: null,
    needsChoice: true,
    choices: names,
    message: `El Excel tiene varias pestañas (${names.join(", ")}). ¿Cuál usar? Normalmente es «formato life».`,
  };
}

function normCellHeader(v) {
  return stripDiacritics(String(v ?? "")).replace(/\s+/g, " ").trim().toUpperCase();
}

function looksLikeNombreHeader(t) {
  if (!t) return false;
  if (t.includes("NOMBRE") && t.includes("UNIFORME")) return true;
  if (t.includes("NOMBRE") && t.includes("QUE") && t.includes("LLEVAR")) return true;
  if (t.includes("NOMBRE") && (t.includes("LISTADO") || t.includes("JUGADOR") || t.includes("ALUMNO")))
    return true;
  if (t === "NOMBRE EN UNIFORME" || t === "NOMBRE") return true;
  return false;
}

function looksLikeTallaHeader(t) {
  if (!t) return false;
  if (t === "CAMISETA") return false;
  if (t.includes("TALLA")) return true;
  return ["CAMISA", "POLO", "BUSO"].some((x) => t.includes(x));
}

function looksLikeNumeroHeader(t) {
  if (!t) return false;
  if (t === "NO." || t === "NO" || t === "Nº" || t === "N°") return false;
  // CANTIDAD no es dorsal (variante Formato Life con qty por fila).
  if (t.includes("CANTIDAD") || t.includes("CANT.") || t === "QTY" || t === "QUANTITY") return false;
  if (t.includes("NUMERO") || t.includes("NÚMERO") || t.includes("DORSAL")) return true;
  return t === "#";
}

function looksLikeCantidadHeader(t) {
  if (!t) return false;
  if (t.includes("CANTIDAD") || t.includes("CANT.")) return true;
  return t === "QTY" || t === "QUANTITY" || t === "CANT";
}

/**
 * Desglosa manga + cantidad de fila.
 * Casos:
 * - «2 LARGA+1 CORTA» → [{manga:'larga', qty:2}, {manga:'corta', qty:1}]
 * - «3 LARGA» / «3 CORTA» → una parte con ese qty
 * - «LARGA» + CANTIDAD 1 → [{manga:'larga', qty:1}]
 * Si hay números en manga, esos mandan (deben cuadrar con CANTIDAD).
 */
function parseMangaUnitParts(mangaText, cantidad = 1) {
  const t = compact(mangaText).toUpperCase();
  const qtyCol = Math.max(1, Math.round(Number(cantidad) || 1));
  if (!t) return [{ manga: "otra", qty: qtyCol }];

  let larga = 0;
  let corta = 0;
  for (const m of t.matchAll(/(\d+)\s*LARGA/g)) larga += Number(m[1]) || 0;
  for (const m of t.matchAll(/(\d+)\s*CORTA/g)) corta += Number(m[1]) || 0;
  // «3 SISA» cuenta como corta
  for (const m of t.matchAll(/(\d+)\s*SISA/g)) corta += Number(m[1]) || 0;

  if (larga || corta) {
    const parts = [];
    if (larga) parts.push({ manga: "larga", qty: larga });
    if (corta) parts.push({ manga: "corta", qty: corta });
    return parts;
  }

  if (/LARGA/.test(t) && !/CORTA|SISA/.test(t)) return [{ manga: "larga", qty: qtyCol }];
  if (/CORTA|SISA/.test(t) && !/LARGA/.test(t)) return [{ manga: "corta", qty: qtyCol }];
  if (/LARGA/.test(t) && /CORTA|SISA/.test(t)) {
    // Mixta sin números — no inventar split; 1 unidad mixta
    return [{ manga: "mixta", qty: qtyCol, raw: compact(mangaText) }];
  }
  return [{ manga: "otra", qty: qtyCol }];
}

function resolveRowCantidad(row, cols) {
  if (cols.ccantidad == null) return 1;
  const raw = cellScalar(row[cols.ccantidad]);
  if (!raw) return 1;
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.round(n));
}

function looksLikeCamisetaHeader(t) {
  if (!t) return false;
  return t === "CAMISETA" || (t.includes("CAMISETA") && t.includes("NUMERO"));
}

function looksLikeMangaHeader(t) {
  if (!t) return false;
  return t.includes("LARGA") || t.includes("CORTA") || t.includes("MANGA") || t.includes("SISA");
}

function looksLikeGeneroMasHeader(t) {
  return t === "MAS" || t === "M" || t === "MASC" || t === "MASCULINO";
}

function looksLikeGeneroFemHeader(t) {
  return t === "FEM" || t === "F" || t === "FEMENINO";
}

function looksLikeArqueroHeader(t) {
  return t.includes("ARQUERO") || t.includes("PORTER");
}

function looksLikeUniformeHeader(t) {
  if (!t) return false;
  if (t.includes("NOMBRE") && t.includes("UNIFORME")) return false;
  return t === "UNIFORME" || t.includes("UNIFORME");
}

function looksLikeComentarioHeader(t) {
  // COMENTARIO / OBSERVACIONES / OBSERVACION — no PRECIO ni otras columnas libres.
  return t.includes("COMENTARIO") || t.includes("OBSERV");
}

function looksLikeDelanteraHeader(t) {
  if (!t) return false;
  return (
    t.includes("DELANTERA") ||
    t.includes("FRENTE") ||
    (t.includes("PARTE") && t.includes("DELANT")) ||
    t === "DEL"
  );
}

function looksLikeTraseraHeader(t) {
  if (!t) return false;
  return (
    t.includes("TRASERA") ||
    t.includes("ESPALDA") ||
    (t.includes("PARTE") && t.includes("TRAS")) ||
    t === "TRAS"
  );
}

/**
 * Une celdas COMENTARIO + OBSERVACIONES (y aliases) sin inventar etiquetas.
 * Delantera/Trasera solo si el encabezado las declara explícitamente.
 */
function readComentarioCells(row, cols) {
  const idxs =
    Array.isArray(cols.ccomentarios) && cols.ccomentarios.length
      ? cols.ccomentarios
      : cols.ccomentario != null
        ? [cols.ccomentario]
        : [];
  const parts = [];
  for (const c of idxs) {
    const v = cellScalar(row[c]);
    if (v) parts.push(v);
  }
  return parts.join(" · ");
}

/** Prefijos Delantera:/Trasera: solo si hay columnas con ese encabezado real. */
function buildImpresionParts(row, cols) {
  const parts = [];
  if (cols.cdelantera != null) {
    const delantera = cellScalar(row[cols.cdelantera]);
    if (delantera) parts.push(`Delantera: ${delantera}`);
  }
  if (cols.ctrasera != null) {
    const trasera = cellScalar(row[cols.ctrasera]);
    if (trasera) parts.push(`Trasera: ${trasera}`);
  }
  return parts;
}

/** Marca de casilla (X). Ignora valores plantilla numéricos del Excel (ej. 104). */
function isCheckboxMark(value) {
  const t = normCellHeader(value);
  if (!t) return false;
  if (/^\d{2,}$/.test(t)) return false;
  return t === "X" || t === "SI" || t === "SÍ" || t === "1" || t === "TRUE";
}

function isMarkedX(value) {
  return isCheckboxMark(value);
}

const ARQUERO_MISMO_DISENO_NOTE =
  "Arquero: mismo diseño con colores invertidos (sin cargo adicional de diseño)";

/** Metadatos de cabecera del FORMATO PEDIDO LIFE (filas 1–3). */
function extractFormatoLifeHeaderMeta(grid) {
  let color_media = null;
  let disciplina = null;
  for (let r = 0; r < Math.min(5, grid.length); r++) {
    const row = grid[r] || [];
    for (let c = 0; c < row.length - 1; c++) {
      const t = normCellHeader(row[c]);
      const next = compact(row[c + 1]);
      if (!next) continue;
      if (t.includes("COLOR") && t.includes("MEDIA")) color_media = next;
      if (t === "DISCIPLINA") disciplina = next;
    }
  }
  return { color_media, disciplina };
}

/**
 * Resumen estructurado tras parsear formato life — para el agente staff y correcciones.
 */
function buildFormatoLifeParseReport(rows, opts = {}) {
  const layout = opts.layout || "generic";
  const masc = (rows || []).filter((r) => r.grupo === "masculino");
  const fem = (rows || []).filter((r) => r.grupo === "femenino");
  const arqueros = (rows || []).filter((r) => r.arquero);

  const rowUnitQty = (r) =>
    parseMangaUnitParts(r.manga, r.cantidad ?? 1).reduce((a, p) => a + (p.qty || 0), 0);
  const countUnits = (pred) =>
    (rows || []).reduce((s, r) => (pred(r) ? s + rowUnitQty(r) : s), 0);
  const countManga = (kind) =>
    (rows || []).reduce((s, r) => {
      return (
        s +
        parseMangaUnitParts(r.manga, r.cantidad ?? 1)
          .filter((p) => p.manga === kind)
          .reduce((a, p) => a + p.qty, 0)
      );
    }, 0);
  const counts = {
    total: rows?.length || 0,
    total_unidades: (rows || []).reduce((s, r) => s + rowUnitQty(r), 0),
    masculino_uniforme: countUnits((r) => r.grupo === "masculino" && r.uniforme),
    masculino_camiseta: countUnits(
      (r) => r.grupo === "masculino" && r.camiseta && !r.uniforme && !r.pantaloneta
    ),
    femenino_camiseta: countUnits((r) => r.grupo === "femenino" && r.camiseta && !r.pantaloneta),
    femenino_otro: countUnits((r) => r.grupo === "femenino" && !r.camiseta && !r.pantaloneta),
    pantaloneta: countUnits((r) => r.pantaloneta),
    arqueros: arqueros.length,
    manga_larga: countManga("larga"),
    manga_corta: countManga("corta"),
  };

  const arquero_lines = arqueros.map(
    (r) => `${r.nombre} #${r.numero || "?"} (${r.grupo === "femenino" ? "F" : "M"})`
  );

  const hints = [];
  if (layout === "formato_life_v1") {
    hints.push("Pestaña formato life · layout v1 (única lógica: parse_life_excel).");
    hints.push("Solo pestaña «formato life» (ignorar Hoja1/Hoja2).");
    hints.push("Dorsal: columna NUMERO; si vacía y existe NUMERO en el layout, usar No. como dorsal.");
    hints.push(
      "Si la columna D (u otra) es CANTIDAD y no hay NUMERO: cantidad por fila; No. es índice, no dorsal."
    );
    hints.push(
      "CANTIDAD = unidades de esa fila (p. ej. 3). Manga puede desglosar: «2 LARGA+1 CORTA», «3 LARGA»."
    );
    hints.push("MAS/FEM = género (masculino/femenino).");
    hints.push(
      "X en Camiseta / X en Uniforme = tipo de prenda de la fila (validación pre-ingreso; no columna Formulario)."
    );
    hints.push("Arquero solo columna ARQUERO (X) o comentario con «arquero».");
    hints.push("No inferir arqueros por dorsal sin marca.");
    hints.push("Texto en Camiseta/Uniforme (ej. «SOLO PANTALONETA») → comentario/nota, no casilla X.");
    hints.push("Curso/pago u otros datos en comentarios → registro (no se descartan).");
    hints.push(
      "Fidelidad al Excel: no inventar palabras. COMENTARIO+OBSERVACIONES se unen; Delantera/Trasera solo si el encabezado las nombra; PRECIO no va a la lista."
    );
  }

  const placeholders = (rows || []).filter(
    (r) => /^(Camiseta|Arquero) #/.test(r.nombre) && !r.nombre_vacio_impresion
  );
  const blankUniformNames = (rows || []).filter((r) => r.nombre_vacio_impresion);
  if (blankUniformNames.length) {
    hints.push(
      `${blankUniformNames.length} uniforme(s) con nombre vacío en impresión (dorsal/talla identifican la prenda).`
    );
  }
  if (placeholders.length) {
    hints.push(
      `${placeholders.length} fila(s) sin nombre en columna B — revisar Excel o corregir manual.`
    );
  }

  const parts = [];
  if (opts.sheetName) parts.push(`«${opts.sheetName}»`);
  parts.push(`${counts.total} filas`);
  if (counts.total_unidades && counts.total_unidades !== counts.total) {
    parts.push(`${counts.total_unidades} unidades`);
  }
  if (counts.masculino_uniforme) parts.push(`${counts.masculino_uniforme} u. M uniforme`);
  if (counts.masculino_camiseta) parts.push(`${counts.masculino_camiseta} u. M camiseta`);
  if (counts.femenino_camiseta) parts.push(`${counts.femenino_camiseta} u. F camiseta`);
  if (counts.pantaloneta) parts.push(`${counts.pantaloneta} pantaloneta`);
  if (counts.arqueros) parts.push(`${counts.arqueros} arquero(s)`);
  if (counts.manga_larga) parts.push(`${counts.manga_larga} manga larga`);
  if (counts.manga_corta) parts.push(`${counts.manga_corta} manga corta`);

  const registro_rows = (rows || [])
    .map((r, i) => (r.registro ? { row: i + 1, nombre: r.nombre, ...r.registro } : null))
    .filter(Boolean);

  return {
    layout,
    sheet_name: opts.sheetName || null,
    color_media: opts.color_media || null,
    disciplina: opts.disciplina || null,
    counts,
    arqueros: arquero_lines,
    registro_hints: registro_rows,
    product_choice_validation: {
      role: "pre_upload_check",
      note_es:
        "Marcas Camiseta/Uniforme del Excel validan la escogencia de producto antes de subir; no son columnas del Formulario Life.",
    },
    hints,
    summary_text: parts.join(" · "),
  };
}

function analyzeLifeExcelLayout(grid) {
  const cols = scanHeaderIndexes(grid);
  const headerRow = cols.headerRowIdx ?? cols.startIdx - 1;
  const row = grid[headerRow] || [];
  const labels = row.map((c) => normCellHeader(c));

  const hasNombreUniforme = labels.some((t) => t.includes("NOMBRE") && t.includes("UNIFORME"));
  const hasMasFem =
    labels.some((t) => t === "MAS" || t === "MASCULINO") &&
    labels.some((t) => t === "FEM" || t === "FEMENINO");
  const hasCamisetaUniforme =
    labels.some((t) => t === "CAMISETA") && labels.some((t) => t.includes("UNIFORME"));

  const schema =
    hasNombreUniforme && hasMasFem && hasCamisetaUniforme ? "formato_life_v1" : "generic";

  const notes = [];
  for (let r = (cols.startIdx || 0) + 1; r < Math.min(grid.length, cols.startIdx + 80); r++) {
    for (const cell of grid[r] || []) {
      const t = compact(cell);
      if (!t || t.length < 12) continue;
      if (/arquer|colores?\s*invert|gratis|sin\s+cargo|mismo\s+dise/i.test(t)) {
        if (!notes.includes(t)) notes.push(t);
      }
    }
  }

  return { schema, cols, notes };
}

function scanHeaderIndexes(grid) {
  const maxRow = Math.min(80, grid.length);
  const hits = {
    nombre: [],
    talla: [],
    numero: [],
    cantidad: [],
    camiseta: [],
    uniforme: [],
    manga: [],
    mas: [],
    fem: [],
    arquero: [],
    comentario: [],
    delantera: [],
    trasera: [],
    no: [],
  };

  for (let r = 0; r < maxRow; r++) {
    const row = grid[r] || [];
    const maxCol = Math.min(40, row.length);
    for (let c = 0; c < maxCol; c++) {
      const t = normCellHeader(row[c]);
      if (!t) continue;
      if (looksLikeNombreHeader(t)) hits.nombre.push([r, c]);
      if (looksLikeTallaHeader(t)) hits.talla.push([r, c]);
      if (looksLikeCantidadHeader(t)) hits.cantidad.push([r, c]);
      else if (looksLikeNumeroHeader(t)) hits.numero.push([r, c]);
      if (looksLikeCamisetaHeader(t)) hits.camiseta.push([r, c]);
      if (looksLikeUniformeHeader(t)) hits.uniforme.push([r, c]);
      if (looksLikeMangaHeader(t)) hits.manga.push([r, c]);
      if (looksLikeGeneroMasHeader(t)) hits.mas.push([r, c]);
      if (looksLikeGeneroFemHeader(t)) hits.fem.push([r, c]);
      if (looksLikeArqueroHeader(t)) hits.arquero.push([r, c]);
      if (looksLikeComentarioHeader(t)) hits.comentario.push([r, c]);
      if (looksLikeDelanteraHeader(t)) hits.delantera.push([r, c]);
      if (looksLikeTraseraHeader(t)) hits.trasera.push([r, c]);
      if (t === "NO." || t === "NO" || t === "Nº") hits.no.push([r, c]);
    }
  }

  const strongNombre = hits.nombre.find(([r, c]) => {
    const t = normCellHeader(grid[r][c]);
    return t.includes("NOMBRE") && t.includes("UNIFORME");
  });
  const headerRowIdx = strongNombre ? strongNombre[0] : hits.nombre[0]?.[0] ?? null;
  const cn = strongNombre ? strongNombre[1] : hits.nombre[0]?.[1] ?? null;

  const pickOnHeader = (list) =>
    headerRowIdx != null
      ? list.find(([r]) => r === headerRowIdx)?.[1] ?? null
      : list[0]?.[1] ?? null;

  let ct = pickOnHeader(hits.talla);
  let cnum = pickOnHeader(hits.numero);
  let ccantidad = pickOnHeader(hits.cantidad);
  let ccamiseta = pickOnHeader(hits.camiseta);
  let cuniforme = pickOnHeader(hits.uniforme);
  let cmanga = pickOnHeader(hits.manga);
  let cmas = pickOnHeader(hits.mas);
  let cfem = pickOnHeader(hits.fem);
  let carquero = pickOnHeader(hits.arquero);
  let ccomentario = pickOnHeader(hits.comentario);
  // Todas las cols COMENTARIO/OBSERVACIONES en la fila de encabezado (Fredy Bram: K+L).
  let ccomentarios =
    headerRowIdx != null
      ? [...new Set(hits.comentario.filter(([r]) => r === headerRowIdx).map(([, c]) => c))].sort(
          (a, b) => a - b
        )
      : [...new Set(hits.comentario.map(([, c]) => c))].sort((a, b) => a - b);
  // Solo si el Excel declara DELANTERA / TRASERA en el encabezado. Nunca asumir por offset.
  let cdelantera = pickOnHeader(hits.delantera);
  let ctrasera = pickOnHeader(hits.trasera);
  const cno = pickOnHeader(hits.no);

  if (cn != null) {
    if (ct == null) ct = cn + 1;
    const assumedD = cn + 2;
    const headerRow = headerRowIdx != null ? grid[headerRowIdx] || [] : [];
    const assumedDLabel = normCellHeader(headerRow[assumedD]);
    if (cnum == null && ccantidad == null) {
      // Solo asumir NUMERO en D si no es CANTIDAD.
      if (!looksLikeCantidadHeader(assumedDLabel)) cnum = assumedD;
      else ccantidad = assumedD;
    } else if (cnum == null && looksLikeCantidadHeader(assumedDLabel)) {
      ccantidad = ccantidad ?? assumedD;
    }
    if (cmanga == null) cmanga = cn + 3;
    if (cmas == null) cmas = cn + 4;
    if (cfem == null) cfem = cn + 5;
    if (ccamiseta == null) ccamiseta = cn + 6;
    if (cuniforme == null) cuniforme = cn + 7;
    if (carquero == null) carquero = cn + 8;
    if (ccomentario == null) ccomentario = cn + 9;
    if (!ccomentarios.length && ccomentario != null) ccomentarios = [ccomentario];
  }

  if (ccomentario == null && ccomentarios.length) ccomentario = ccomentarios[0];
  if (ccomentarios.length && ccomentario != null && !ccomentarios.includes(ccomentario)) {
    ccomentarios = [ccomentario, ...ccomentarios].sort((a, b) => a - b);
  }

  if (cn == null && ct == null && cnum == null && ccantidad == null) {
    return {
      cn: 1,
      ct: 2,
      cnum: 3,
      ccantidad: null,
      ccamiseta: 7,
      cuniforme: 8,
      cmanga: 4,
      cmas: 5,
      cfem: 6,
      carquero: 9,
      ccomentario: 10,
      ccomentarios: [10],
      cno: 0,
      headerRowIdx: 4,
      startIdx: 5,
    };
  }

  const startIdx =
    headerRowIdx != null ? Math.min(grid.length - 1, headerRowIdx + 1) : 5;

  return {
    cn,
    ct,
    cnum,
    ccantidad,
    ccamiseta,
    cuniforme,
    cmanga,
    cmas,
    cfem,
    carquero,
    ccomentario,
    ccomentarios,
    cdelantera,
    ctrasera,
    cno,
    headerRowIdx,
    startIdx,
  };
}

/**
 * Dorsal / número de jugador.
 * Preferir columna NUMERO; si viene vacía y el layout tiene NUMERO, usar No.
 * Si el layout es CANTIDAD (sin columna NUMERO), No. es índice de fila — no dorsal.
 */
function looksLikeJerseyNumber(value) {
  const t = compact(value);
  if (!t) return false;
  if (/^\d{1,3}$/.test(t)) return true;
  if (/^[A-Za-z]?\d{1,3}$/.test(t)) return true;
  return false;
}

function resolveJerseyNumber(row, cols) {
  const numero = cols.cnum != null ? cellScalar(row[cols.cnum]) : "";
  const rowNo = cols.cno != null ? cellScalar(row[cols.cno]) : "";
  if (numero) return numero;
  // Layout con CANTIDAD y sin NUMERO: No. no es dorsal.
  if (cols.ccantidad != null && cols.cnum == null) return "";
  if (looksLikeJerseyNumber(rowNo)) return rowNo;
  return "";
}

/**
 * Pistas de registro (curso, pago, etc.) embebidas en comentarios u otras celdas.
 * No son columnas Formulario; se conservan para no perder info.
 */
function extractRegistroHintsFromText(text) {
  const raw = compact(text);
  if (!raw) return {};
  const out = {};
  const curso = raw.match(/\bcurso\s*[:=]?\s*([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ.\- ]{1,20})/i);
  if (curso) out.curso = compact(curso[1]);
  const pago = raw.match(/\bpago\s*[:=]?\s*([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ.%/ ]{1,40})/i);
  if (pago) out.pago = compact(pago[1]);
  const forma = raw.match(/\bforma\s*(?:de\s*)?pago\s*[:=]?\s*([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ.\-_/ ]{1,40})/i);
  if (forma) out.forma_pago = compact(forma[1]);
  const nequi = /\bnequi\b/i.test(raw);
  const banco = /\bbancolombia\b|\bconsignaci[oó]n\b|\bkatu\b/i.test(raw);
  if (nequi && !out.forma_pago) out.forma_pago = "Nequi";
  if (banco && !out.forma_pago) {
    if (/\bkatu\b/i.test(raw)) out.forma_pago = "Katu";
    else if (/\bconsignaci/i.test(raw)) out.forma_pago = "Consignación";
    else if (/\bbancolombia\b/i.test(raw)) out.forma_pago = "Bancolombia";
  }
  return out;
}

function parseFormatoLifeRow(row, cols, ctx) {
  const nombre = cellScalar(row[cols.cn]);
  const talla = cellScalar(row[cols.ct]);
  const jersey = resolveJerseyNumber(row, cols);
  const cantidad = resolveRowCantidad(row, cols);
  const manga = cols.cmanga != null ? cellScalar(row[cols.cmanga]) : "";
  const comentario = readComentarioCells(row, cols);
  const delantera = cols.cdelantera != null ? cellScalar(row[cols.cdelantera]) : "";
  const trasera = cols.ctrasera != null ? cellScalar(row[cols.ctrasera]) : "";

  const camisetaCell = cols.ccamiseta != null ? row[cols.ccamiseta] : "";
  const uniformeCell = cols.cuniforme != null ? row[cols.cuniforme] : "";

  const masMarked = cols.cmas != null && isCheckboxMark(row[cols.cmas]);
  const femMarked = cols.cfem != null && isCheckboxMark(row[cols.cfem]);
  const camisetaMarked = cols.ccamiseta != null && isCheckboxMark(camisetaCell);
  const uniformeMarked = cols.cuniforme != null && isCheckboxMark(uniformeCell);
  const camisetaNote = cellInlineNote(camisetaCell);
  const uniformeNote = cellInlineNote(uniformeCell);
  const impresionParts = buildImpresionParts(row, cols);
  if (ctx.sectionPrintNote) impresionParts.push(ctx.sectionPrintNote);
  const impresionNote = impresionParts.join(" · ");
  const mergedComentario = [comentario, camisetaNote, uniformeNote, impresionNote]
    .filter(Boolean)
    .join(" · ");
  const pantalonetaOnly = isPantalonetaOnlyText(mergedComentario, camisetaNote, uniformeNote);

  const arqueroMarked = cols.carquero != null && isCheckboxMark(row[cols.carquero]);
  const arqueroFromComment = isArqueroFromComment(mergedComentario, {
    pantalonetaOnly,
    camisetaMarked,
    uniformeMarked,
  });
  const arquero = arqueroMarked || arqueroFromComment;

  const hasData =
    Boolean(nombre) ||
    Boolean(talla) ||
    Boolean(delantera) ||
    Boolean(trasera) ||
    masMarked ||
    femMarked ||
    camisetaMarked ||
    uniformeMarked ||
    arqueroMarked ||
    Boolean(comentario) ||
    (cols.ccantidad != null && cantidad > 1 && Boolean(manga));
  if (!hasData) return null;

  const inFemSection = ctx.sawMascRow && !ctx.mascSectionActive;

  let genero = null;
  if (masMarked) genero = "masculino";
  else if (femMarked) genero = "femenino";
  else if (ctx.sectionGender) genero = ctx.sectionGender;
  else if (inFemSection && !masMarked) genero = "femenino";
  else if (ctx.inferFem && nombre) genero = "femenino";
  else genero = "masculino";

  let camiseta = camisetaMarked;
  let uniforme = uniformeMarked;
  const section = ctx.section || null;

  if (pantalonetaOnly) {
    camiseta = false;
    uniforme = false;
  } else if (section && (section.uniforme !== undefined || section.camiseta !== undefined)) {
    if (section.uniforme === true) {
      uniforme = true;
      camiseta = false;
    } else if (section.camiseta === true) {
      camiseta = true;
      uniforme = false;
    } else {
      uniforme = false;
      camiseta = false;
    }
  } else if (!camiseta && !uniforme) {
    if (arquero && (masMarked || genero === "masculino")) uniforme = true;
    else if (arquero) camiseta = true;
    else if (masMarked) uniforme = true;
    else if (genero === "femenino") camiseta = true;
    else if (femMarked) camiseta = true;
    else uniforme = true;
  } else if (arquero && !uniformeMarked && !camisetaMarked) {
    if (masMarked || genero === "masculino") {
      uniforme = true;
      camiseta = false;
    } else {
      camiseta = true;
      uniforme = false;
    }
  }

  const nombreBlankIntentional =
    !nombre &&
    !pantalonetaOnly &&
    (uniforme || camiseta) &&
    Boolean(talla || (jersey && (delantera || trasera || comentario)));

  const registro = extractRegistroHintsFromText(mergedComentario || comentario);
  const manga_parts = parseMangaUnitParts(manga, cantidad);
  const unidades = manga_parts.reduce((s, p) => s + (p.qty || 0), 0);

  return toDetailRow({
    nombre_uniforme: nombre || null,
    talla,
    numero: jersey,
    cantidad: unidades || cantidad,
    manga,
    manga_parts,
    genero,
    mas: masMarked ? "x" : null,
    fem: femMarked ? "x" : null,
    // Validación pre-ingreso / pista de producto — no columnas Formulario Life
    camiseta,
    uniforme,
    product_choice_hint: uniforme
      ? "uniforme"
      : camiseta
        ? "camiseta"
        : pantalonetaOnly
          ? "pantaloneta"
          : null,
    arquero,
    pantaloneta: pantalonetaOnly,
    comentario: mergedComentario || comentario,
    nota_celda: camisetaNote || uniformeNote || "",
    registro: Object.keys(registro).length ? registro : null,
    nombre_vacio_impresion: nombreBlankIntentional,
    impresion_delantera: delantera || null,
    impresion_trasera: trasera || null,
    product_line_key: section?.key || null,
    product_text: section?.product_text || null,
    garment_type: section?.garment_type || null,
    category: section?.category || null,
    variant_notes: section?.variant_notes || null,
  });
}

function isArqueroFromComment(mergedComentario, opts = {}) {
  if (opts.pantalonetaOnly || !mergedComentario) return false;
  const c = mergedComentario.trim();
  const low = c.toLowerCase();
  if (!/arquer|porter/.test(low)) return false;
  if (/^(uniforme|camiseta)\s+arquero\b/i.test(c)) return true;
  if (/^arquero\b/i.test(c)) return true;
  if (/\bde\s+arquero\b/i.test(low)) return true;
  if (/\barquero\b/i.test(low) && (opts.camisetaMarked || opts.uniformeMarked)) return true;
  return false;
}

function cellScalar(v) {
  if (v == null) return "";
  if (typeof v === "number") {
    if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
    return String(v).trim();
  }
  const s = String(v).trim();
  if (/^\d+\.0+$/.test(s)) return String(parseInt(s, 10));
  return s;
}

function detectExcelSectionFromRow(row, cols = {}) {
  const cn = cols.cn;
  const ct = cols.ct;
  const nombre = cn != null ? compact(row[cn]) : "";
  const talla = ct != null ? compact(row[ct]) : "";
  // Fila de persona (nombre + talla) nunca es encabezado de sección — aunque diga «chaqueta» en la talla.
  if (nombre && talla) return null;
  const masMarked = cols.cmas != null && isCheckboxMark(row[cols.cmas]);
  const femMarked = cols.cfem != null && isCheckboxMark(row[cols.cfem]);
  if (masMarked || femMarked) return null;

  const labelParts = [];
  for (let c = 0; c < Math.min(row.length, 6); c++) {
    const t = compact(row[c]);
    if (!t) continue;
    labelParts.push(t);
    if (labelParts.length >= 2) break;
  }
  const label = labelParts.join(" ").trim();
  if (!label) return null;
  // Evitar «Nombre Camiseta…» de una sola celda larga: solo sección si parece título corto.
  if (labelParts.length === 1 && label.length > 48 && !/:$/.test(label)) return null;
  return detectListSectionHeader(label.endsWith(":") ? label : `${label}:`);
}

function isExcelPrintSpecRow(row, cols) {
  const nombre = cellScalar(row[cols.cn]);
  const talla = cellScalar(row[cols.ct]);
  const jersey = resolveJerseyNumber(row, cols);
  if (nombre || talla || jersey) return false;
  const delantera = cols.cdelantera != null ? cellScalar(row[cols.cdelantera]) : "";
  const trasera = cols.ctrasera != null ? cellScalar(row[cols.ctrasera]) : "";
  const comentario = readComentarioCells(row, cols);
  if (!delantera && !trasera && !comentario) return false;
  const hasMarks =
    (cols.ccamiseta != null && isCheckboxMark(row[cols.ccamiseta])) ||
    (cols.cuniforme != null && isCheckboxMark(row[cols.cuniforme])) ||
    (cols.carquero != null && isCheckboxMark(row[cols.carquero]));
  return !hasMarks;
}

function buildSectionPrintNote(row, cols) {
  const comentario = readComentarioCells(row, cols);
  const parts = [...buildImpresionParts(row, cols)];
  if (comentario) parts.push(comentario);
  return parts.join(" · ");
}

function extractRowsFromLifeGrid(grid) {
  const layout = analyzeLifeExcelLayout(grid);
  const cols = layout.cols;
  let { cn, ct, startIdx } = cols;
  if (cn == null || ct == null) {
    cn = 1;
    ct = 2;
    startIdx = 5;
  }

  const out = [];
  const skipLabels = new Set(["NOMBRE EN UNIFORME", "NOMBRE", "TOTAL", "SUBTOTAL"]);
  let blank = 0;
  let sawMascRow = false;
  let mascSectionActive = true;
  let currentSection = null;
  let sectionPrintNote = "";

  for (let r = startIdx; r < grid.length; r++) {
    const row = [...(grid[r] || [])];
    const comentarioCols = Array.isArray(cols.ccomentarios) ? cols.ccomentarios : [];
    const extend =
      Math.max(
        cn,
        ct,
        cols.cnum ?? 0,
        cols.ccamiseta ?? 0,
        cols.cuniforme ?? 0,
        cols.carquero ?? 0,
        cols.ccomentario ?? 0,
        cols.cdelantera ?? 0,
        cols.ctrasera ?? 0,
        ...comentarioCols
      ) + 1;
    while (row.length < extend) row.push("");

    const sectionHeader = detectExcelSectionFromRow(row, cols);
    if (sectionHeader) {
      currentSection = sectionHeader;
      sectionPrintNote = "";
      blank = 0;
      continue;
    }

    if (isExcelPrintSpecRow(row, cols)) {
      sectionPrintNote = buildSectionPrintNote(row, cols);
      blank = 0;
      continue;
    }

    const nombreRaw = row[cn];
    const hasNombre = nombreRaw != null && String(nombreRaw).trim() !== "";

    if (!hasNombre) {
      const talla = cellScalar(row[ct]);
      const jersey = resolveJerseyNumber(row, cols);
      const hasMarks =
        (cols.ccamiseta != null && isCheckboxMark(row[cols.ccamiseta])) ||
        (cols.cuniforme != null && isCheckboxMark(row[cols.cuniforme])) ||
        (cols.carquero != null && isCheckboxMark(row[cols.carquero]));
      if (!talla && !jersey && !hasMarks) {
        blank += 1;
        if (blank >= 25) break;
        continue;
      }
    } else {
      blank = 0;
      const nsUp = normCellHeader(String(nombreRaw).trim());
      if (skipLabels.has(nsUp) || nsUp.includes("TOTAL UNIFORMES")) continue;
    }

    if (layout.schema === "formato_life_v1") {
      const tallaCell = cellScalar(row[ct]);
      const jerseyCell = resolveJerseyNumber(row, cols);
      const mangaCell = cols.cmanga != null ? cellScalar(row[cols.cmanga]) : "";
      const rowHasMarks =
        (cols.ccamiseta != null && isCheckboxMark(row[cols.ccamiseta])) ||
        (cols.cuniforme != null && isCheckboxMark(row[cols.cuniforme])) ||
        (cols.carquero != null && isCheckboxMark(row[cols.carquero])) ||
        (cols.cmas != null && isCheckboxMark(row[cols.cmas])) ||
        (cols.cfem != null && isCheckboxMark(row[cols.cfem]));
      // Pie de hoja / nota (ej. especificación pantaloneta) sin fila de pedido.
      if (hasNombre && !tallaCell && !jerseyCell && !mangaCell && !rowHasMarks) {
        blank = 0;
        continue;
      }

      const masMarked = cols.cmas != null && isCheckboxMark(row[cols.cmas]);
      if (masMarked) sawMascRow = true;
      if (sawMascRow && !masMarked && mascSectionActive) {
        const femMarked = cols.cfem != null && isCheckboxMark(row[cols.cfem]);
        const camisetaOnly = cols.ccamiseta != null && isCheckboxMark(row[cols.ccamiseta]);
        const hasRowData =
          hasNombre ||
          femMarked ||
          camisetaOnly ||
          tallaCell ||
          jerseyCell;
        if (hasRowData) mascSectionActive = false;
      }

      const parsed = parseFormatoLifeRow(row, cols, {
        inferFem: !mascSectionActive && hasNombre && !masMarked,
        sawMascRow,
        mascSectionActive,
        section: currentSection,
        sectionPrintNote,
      });
      if (parsed) out.push(parsed);
      continue;
    }

    // generic fallback
    if (!hasNombre) continue;
    const jersey = resolveJerseyNumber(row, cols);
    const comentario = cols.ccomentario != null ? cellScalar(row[cols.ccomentario]) : "";
    const talla = cellScalar(row[ct]);
    const blob = `${talla} ${comentario}`.toLowerCase();
    const soloCamisa = /\bsolo\s+camisa\b|\bsolo\s+camiseta\b/.test(blob);
    const mencionaCamisa = /\bcamisa\b|\bcamiseta\b/.test(blob);
    const mencionaChaqueta = /\bchaqueta\b|\bbuso\b|\bsudadera\b|\bpantalon\b/.test(blob);
    out.push(
      toDetailRow({
        nombre_uniforme: String(nombreRaw).trim(),
        talla,
        numero: jersey,
        manga: cols.cmanga != null ? cellScalar(row[cols.cmanga]) : "",
        mas: cols.cmas != null && isCheckboxMark(row[cols.cmas]) ? "x" : null,
        fem: cols.cfem != null && isCheckboxMark(row[cols.cfem]) ? "x" : null,
        arquero: cols.carquero != null && isCheckboxMark(row[cols.carquero]),
        comentario: comentario || undefined,
        camiseta: soloCamisa || (mencionaCamisa && !mencionaChaqueta),
        uniforme: !(soloCamisa || (mencionaCamisa && !mencionaChaqueta)),
      })
    );
  }
  return out.filter(Boolean);
}

function colLettersToIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function decodeXmlEntities(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml) {
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const chunk = m[1];
    const texts = [...chunk.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) =>
      decodeXmlEntities(x[1])
    );
    out.push(texts.join(""));
  }
  return out;
}

function sheetXmlToGrid(sheetXml, sharedStrings) {
  const grid = [];
  const rowRe = /<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(sheetXml))) {
    const rowNum = Number(rowMatch[1]);
    const rowBody = rowMatch[2];
    const row = [];
    // Soportar <c .../> y <c ...>...</c> (celdas vacías con estilo no deben absorber la siguiente).
    const cellRe = /<c[^>]*\br="([A-Z]+)(\d+)"([^>]*?)(\s*\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowBody))) {
      const col = colLettersToIndex(cellMatch[1]);
      const attrs = cellMatch[3] || "";
      const isSelfClosing = /^\s*\/>$/.test(cellMatch[4] || "");
      const inner = isSelfClosing ? "" : cellMatch[5] || "";
      if (isSelfClosing) {
        row[col] = "";
        continue;
      }
      let value = "";
      if (/t="s"/.test(attrs)) {
        const idx = Number((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || -1);
        value = sharedStrings[idx] ?? "";
      } else if (/<is>/.test(inner)) {
        value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((x) => decodeXmlEntities(x[1]))
          .join("");
      } else {
        value = decodeXmlEntities((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || "");
      }
      row[col] = value;
    }
    grid[rowNum - 1] = row;
  }
  const dense = [];
  for (let i = 0; i < grid.length; i++) {
    dense.push(grid[i] || []);
  }
  return dense;
}

async function listZipEntries(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip_eocd_not_found");

  const cdOffset = view.getUint32(eocd + 16, true);
  const cdSize = view.getUint32(eocd + 12, true);
  let ptr = cdOffset;
  const end = cdOffset + cdSize;
  const entries = [];

  while (ptr < end) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const compMethod = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const uncompSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(data.slice(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;
    entries.push({ name, localOffset, compMethod, compSize, uncompSize });
  }
  return { view, entries };
}

async function readZipEntry(data, entry) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const lh = entry.localOffset;
  if (view.getUint32(lh, true) !== 0x04034b50) throw new Error("zip_bad_local_header");
  const lNameLen = view.getUint16(lh + 26, true);
  const lExtraLen = view.getUint16(lh + 28, true);
  const dataStart = lh + 30 + lNameLen + lExtraLen;
  const compressed = data.slice(dataStart, dataStart + entry.compSize);

  if (entry.compMethod === 0) return compressed.slice(0, entry.uncompSize);
  if (entry.compMethod === 8) {
    const ds = new DecompressionStream("deflate-raw");
    const blob = new Blob([compressed]);
    const stream = blob.stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error(`zip_unsupported_method:${entry.compMethod}`);
}

async function findZipEntry(data, nameSuffix) {
  const { entries } = await listZipEntries(data);
  const hit = entries.find((e) => e.name.endsWith(nameSuffix) || e.name === nameSuffix);
  if (!hit) return null;
  return readZipEntry(data, hit);
}

function parseWorkbookRelationships(relsXml) {
  const relMap = {};
  const re = /<Relationship\b([^>]+)\/?>/g;
  let m;
  while ((m = re.exec(relsXml))) {
    const attrs = m[1];
    const id = (attrs.match(/\bId="([^"]+)"/) || [])[1];
    const target = (attrs.match(/\bTarget="([^"]+)"/) || [])[1];
    const type = (attrs.match(/\bType="([^"]+)"/) || [])[1] || "";
    if (!id || !target || !type.includes("worksheet")) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    relMap[id] = path;
  }
  return relMap;
}

function parseWorkbookSheets(workbookXml, relMap) {
  const sheets = [];
  const re = /<sheet\b([^>]+)\/?>/g;
  let m;
  while ((m = re.exec(workbookXml))) {
    const attrs = m[1];
    const name = (attrs.match(/\bname="([^"]*)"/) || [])[1];
    const rid = (attrs.match(/\br:id="([^"]+)"/) || [])[1];
    const path = rid ? relMap[rid] : null;
    if (!name || !path) continue;
    sheets.push({ name, path });
  }
  return sheets;
}

async function listWorkbookSheets(bytes) {
  const workbookEntry =
    (await findZipEntry(bytes, "xl/workbook.xml")) || (await findZipEntry(bytes, "workbook.xml"));
  if (!workbookEntry) return [];

  const relsEntry =
    (await findZipEntry(bytes, "xl/_rels/workbook.xml.rels")) ||
    (await findZipEntry(bytes, "_rels/workbook.xml.rels"));
  const relMap = relsEntry
    ? parseWorkbookRelationships(new TextDecoder().decode(relsEntry))
    : {};

  return parseWorkbookSheets(new TextDecoder().decode(workbookEntry), relMap);
}

async function readSheetGrid(bytes, sheetPath, sharedStrings) {
  const normalized = sheetPath.replace(/^\//, "");
  const sheetEntry =
    (await findZipEntry(bytes, normalized)) ||
    (await findZipEntry(bytes, normalized.split("/").pop()));
  if (!sheetEntry) return [];
  return sheetXmlToGrid(new TextDecoder().decode(sheetEntry), sharedStrings);
}

async function readXlsxGrid(bytes, options = {}) {
  const sharedEntry =
    (await findZipEntry(bytes, "xl/sharedStrings.xml")) ||
    (await findZipEntry(bytes, "sharedStrings.xml"));
  const sharedStrings = sharedEntry
    ? parseSharedStrings(new TextDecoder().decode(sharedEntry))
    : [];

  const sheets = await listWorkbookSheets(bytes);
  const forcedName = compact(options.sheetName || options.sheet_name || "");

  if (forcedName) {
    const forced = sheets.find(
      (s) => normalizeSheetLabel(s.name) === normalizeSheetLabel(forcedName)
    );
    if (!forced) {
      throw new Error(`sheet_not_found:${forcedName}`);
    }
    const grid = await readSheetGrid(bytes, forced.path, sharedStrings);
    return { grid, sheetName: forced.name, sheetPath: forced.path };
  }

  const selection = pickLifeExcelSheet(sheets);
  if (selection.needsChoice) {
    // Auto-elegir pestaña con más contenido (Hoja2/3 vacías frecuentes).
    let best = null;
    let bestCount = 0;
    const scored = [];
    for (const candidate of sheets) {
      const g = await readSheetGrid(bytes, candidate.path, sharedStrings);
      const count = g.reduce(
        (n, row) => n + (row || []).filter((c) => compact(c)).length,
        0
      );
      scored.push({ name: candidate.name, count });
      if (count > bestCount) {
        bestCount = count;
        best = { candidate, grid: g };
      }
    }
    if (best && bestCount >= 8) {
      return {
        grid: best.grid,
        sheetName: best.candidate.name,
        sheetPath: best.candidate.path,
      };
    }
    return {
      grid: [],
      sheetName: null,
      sheetPath: null,
      needsChoice: true,
      choices: selection.choices,
      message: selection.message,
      sheet_scores: scored,
    };
  }

  if (!selection.pick) {
    throw new Error("xlsx_sheet_not_found");
  }

  let grid = await readSheetGrid(bytes, selection.pick.path, sharedStrings);
  let sheetName = selection.pick.name;
  let sheetPath = selection.pick.path;

  if (!grid.length) {
    const formatoCandidates = sheets.filter((s) => isFormatoLifeSheet(s.name));
    for (const candidate of formatoCandidates) {
      if (candidate.path === sheetPath) continue;
      const altGrid = await readSheetGrid(bytes, candidate.path, sharedStrings);
      if (altGrid.length) {
        grid = altGrid;
        sheetName = candidate.name;
        sheetPath = candidate.path;
        break;
      }
    }
  }

  if (!grid.length && sheets.length > 1) {
    for (const candidate of sheets) {
      if (candidate.path === sheetPath) continue;
      const altGrid = await readSheetGrid(bytes, candidate.path, sharedStrings);
      if (altGrid.length) {
        grid = altGrid;
        sheetName = candidate.name;
        sheetPath = candidate.path;
        break;
      }
    }
  }

  return { grid, sheetName, sheetPath };
}

async function parseLifeExcelBytes(bytes, filename = "lista.xlsx", options = {}) {
  const lower = compact(filename).toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const grid = text.split(/\r?\n/).map((line) => line.split(/[,;\t]/));
    const rows = extractRowsFromLifeGrid(grid);
    return { ok: rows.length > 0, rows, sheetName: "csv", error: rows.length ? null : "no_rows_parsed" };
  }

  const sheetResult = await readXlsxGrid(bytes, options);
  if (sheetResult.needsChoice) {
    return {
      ok: false,
      rows: [],
      sheetName: null,
      needs_sheet_choice: true,
      sheet_choices: sheetResult.choices || [],
      error: "ambiguous_sheet",
      message: sheetResult.message,
    };
  }

  const { grid, sheetName } = sheetResult;
  const layout = analyzeLifeExcelLayout(grid);
  const rows = extractRowsFromLifeGrid(grid);
  const headerMeta =
    layout.schema === "formato_life_v1" ? extractFormatoLifeHeaderMeta(grid) : {};
  const parseReport = buildFormatoLifeParseReport(rows, {
    layout: layout.schema,
    sheetName,
    ...headerMeta,
  });
  const warnings = [];
  if (layout.schema === "generic") {
    warnings.push("Excel sin columnas estándar formato life; organización genérica de datos.");
  }
  if (layout.notes?.length) {
    warnings.push(...layout.notes.slice(0, 3));
  }
  if (parseReport.hints?.length) {
    warnings.push(...parseReport.hints.slice(0, 4));
  }
  const mirrorGrid =
    layout.schema === "formato_life_v1"
      ? null
      : (() => {
          const headerIdx =
            typeof layout.cols?.headerRowIdx === "number" ? layout.cols.headerRowIdx : 0;
          const sliced = Array.isArray(grid) ? grid.slice(Math.max(0, headerIdx)) : [];
          // trim trailing empties
          let last = -1;
          for (let r = 0; r < sliced.length; r++) {
            if ((sliced[r] || []).some((c) => compact(c))) last = r;
          }
          return last < 0 ? [] : sliced.slice(0, last + 1);
        })();
  return {
    ok: rows.length > 0 || (mirrorGrid && mirrorGrid.length > 1),
    rows,
    sheetName,
    layout: layout.schema,
    layout_notes: layout.notes,
    parse_report: parseReport,
    color_media: headerMeta.color_media || null,
    disciplina: headerMeta.disciplina || null,
    // Grilla para espejo en nota cuando layout ≠ formato_life (ADR diagnóstico).
    grid: mirrorGrid,
    use_mirror: layout.schema !== "formato_life_v1" && Array.isArray(mirrorGrid) && mirrorGrid.length > 1,
    warnings: warnings.length ? warnings : null,
    error: rows.length || (mirrorGrid && mirrorGrid.length > 1) ? null : "no_rows_parsed",
  };
}


/**
 * Parser lista Word — formato Día de la Familia (tabla docx).
 *
 * Cada fila = una familia. El producto lo define la COLUMNA, no el texto de la celda:
 *   UNIFORME NIÑOS | CAMISETA DAMA | CAMISETA CABALLERO
 * Una familia puede tener 0–3 productos (uno por columna con contenido).
 */

const PRODUCT_SPECS = [
  {
    key: "uniforme_ninos",
    header: /uniforme\s*ni[nñ]os/i,
    grupo: "masculino",
    rol: "Uniforme niños",
    uniforme: true,
    camiseta: false,
  },
  {
    key: "camiseta_dama",
    header: /camiseta\s*dama/i,
    grupo: "femenino",
    rol: "Camiseta dama",
    uniforme: false,
    camiseta: true,
  },
  {
    key: "camiseta_caballero",
    header: /camiseta\s*caballero/i,
    grupo: "masculino",
    rol: "Camiseta caballero",
    uniforme: false,
    camiseta: true,
  },
];

const FALLBACK_COL_INDEX = [1, 2, 3];

function normalizeNumero(raw) {
  return String(raw || "")
    .replace(/^[oO]/, "")
    .trim();
}

function normalizeCellText(text) {
  return compact(text)
    .replace(/talla\s*(?=[0-9])/gi, "talla ")
    .replace(/\s+/g, " ")
    .trim();
}

function familyNombreFallback(label) {
  const l = compact(label);
  if (!l || /^profe$/i.test(l)) return "";
  const lower = l.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Detecta columnas de producto desde la fila de encabezado.
 * @returns {{ index: number, spec: typeof PRODUCT_SPECS[0] }[]}
 */
function detectFamilyDayProductColumns(headerRow = []) {
  const found = [];
  for (let i = 0; i < headerRow.length; i++) {
    const h = compact(headerRow[i]);
    if (!h) continue;
    const spec = PRODUCT_SPECS.find((s) => s.header.test(h));
    if (spec) found.push({ index: i, spec });
  }
  if (found.length) return found;
  return FALLBACK_COL_INDEX.map((index, i) => ({ index, spec: PRODUCT_SPECS[i] }));
}

function splitCellChunks(text) {
  const normalized = normalizeCellText(text);
  if (!normalized) return [];

  const chunks = [];
  const parenRe = /\(([^)]+)\)/g;
  let m;
  let hasParen = false;
  while ((m = parenRe.exec(normalized)) !== null) {
    hasParen = true;
    const inner = compact(m[1]);
    if (inner) chunks.push(inner);
  }
  if (hasParen) return chunks;

  return [normalized];
}

/**
 * Extrae personas de una celda (puede haber varias en la misma columna).
 * @param {string} cell
 * @param {{ nombreFallback?: string }} [options]
 */
function parseEntriesFromListCell(cell, options = {}) {
  const nombreFallback = compact(options.nombreFallback || "");
  const entries = [];
  const used = new Set();

  const add = (nombre, numero, talla) => {
    let n = compact(nombre);
    const num = normalizeNumero(numero);
    const t = compact(talla);
    if (!n && nombreFallback) n = nombreFallback;
    if (!n && num) n = `#${num}`;
    if (!n) return;
    const key = `${n.toLowerCase()}|${num}|${t.toLowerCase()}`;
    if (used.has(key)) return;
    used.add(key);
    entries.push({ nombre: n, numero: num, talla: t });
  };

  for (const chunk of splitCellChunks(cell)) {
    const text = normalizeCellText(chunk);
    if (!text) continue;

    const withHash =
      /([A-Za-zÁÉÍÓÚáéíóúñÑ][A-Za-zÁÉÍÓÚáéíóúñÑ\s.]*?)\s*#\s*([oO]?\d+)\s+talla\s+([A-Za-z0-9\-]+)/gi;
    let m;
    while ((m = withHash.exec(text)) !== null) {
      add(m[1], m[2], m[3]);
    }

    const withNum =
      /([A-Za-zÁÉÍÓÚáéíóúñÑ][A-Za-zÁÉÍÓÚáéíóúñÑ\s.]*?)\s+(\d+)\s+talla\s+([A-Za-z0-9\-]+)/gi;
    while ((m = withNum.exec(text)) !== null) {
      add(m[1], m[2], m[3]);
    }

    const hashOnly = /^#\s*([oO]?\d+)\s+talla\s+([A-Za-z0-9\-]+)$/i;
    const ho = text.match(hashOnly);
    if (ho) {
      add(nombreFallback, ho[1], ho[2]);
      continue;
    }

    const noNum = /([A-Za-zÁÉÍÓÚáéíóúñÑ][A-Za-zÁÉÍÓÚáéíóúñÑ\s.]*?)\s+talla\s+([A-Za-z0-9\-]+)/gi;
    while ((m = noNum.exec(text)) !== null) {
      add(m[1], "", m[2]);
    }
  }

  return entries;
}

function parseFamilyDayDocxGrid(grid) {
  const rows = [];
  if (!grid?.length) return rows;

  const productCols = detectFamilyDayProductColumns(grid[0]);
  const familyColIdx = productCols[0]?.index > 0 ? 0 : 0;

  for (let ri = 1; ri < grid.length; ri++) {
    const row = grid[ri] || [];
    const label = compact(row[familyColIdx]);
    if (!label || /^total/i.test(label)) break;

    const nombreFallback = familyNombreFallback(label);

    for (const { index, spec } of productCols) {
      const cell = row[index] || "";
      if (!compact(cell)) continue;

      for (const entry of parseEntriesFromListCell(cell, { nombreFallback })) {
        let nombre = entry.nombre;
        if (/^profe$/i.test(label) && !/profe/i.test(nombre)) {
          nombre = `Profe ${nombre}`.trim();
        }
        const detail = toDetailRow({
          nombre,
          numero: entry.numero,
          talla: entry.talla,
          grupo: spec.grupo,
          rol: spec.rol,
          manga: "Corta",
          uniforme: spec.uniforme,
          camiseta: spec.camiseta,
          comentario: label && !/^profe$/i.test(label) ? `Familia ${label}` : "",
        });
        if (detail) rows.push(detail);
      }
    }
  }
  return rows;
}

async function readDocxXml(bytes) {
  const decoder = new TextDecoder();
  const entries = [];
  const sig = [0x50, 0x4b, 0x03, 0x04];
  for (let i = 0; i < bytes.length - 30; i++) {
    if (!sig.every((b, j) => bytes[i + j] === b)) continue;
    let p = i + 30;
    const fnLen = bytes[i + 26] | (bytes[i + 27] << 8);
    const exLen = bytes[i + 28] | (bytes[i + 29] << 8);
    const name = decoder.decode(bytes.slice(p, p + fnLen));
    p += fnLen + exLen;
    const comp = bytes[i + 8] | (bytes[i + 9] << 8);
    const csize = bytes[i + 18] | (bytes[i + 19] << 8) | (bytes[i + 20] << 16) | (bytes[i + 21] << 24);
    entries.push({ name: name.replace(/\\/g, "/"), comp, data: bytes.slice(p, p + csize) });
  }
  const doc = entries.find((e) => e.name === "word/document.xml");
  if (!doc?.data) return "";
  let xmlBytes = doc.data;
  if (doc.comp === 8 && typeof DecompressionStream !== "undefined") {
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([xmlBytes]).stream().pipeThrough(ds);
    xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return new TextDecoder().decode(xmlBytes);
}

function decodeXmlText(s) {
  return String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function cellTextFromTc(tcXml) {
  const parts = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)/g;
  let m;
  while ((m = re.exec(tcXml)) !== null) {
    parts.push(decodeXmlText(m[1]));
  }
  return parts.join("").trim();
}

function parseDocxTable(xml) {
  const rows = [];
  const trRe = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/gi;
  let trM;
  while ((trM = trRe.exec(xml)) !== null) {
    const cells = [];
    const tcRe = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/gi;
    let tcM;
    while ((tcM = tcRe.exec(trM[1])) !== null) {
      cells.push(cellTextFromTc(tcM[1]));
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

async function parseFamilyDayDocxBytesImpl(bytes) {
  const xml = await readDocxXml(bytes);
  if (!xml) return { ok: false, rows: [], error: "docx_xml_not_found" };
  const grid = parseDocxTable(xml);
  if (!grid.length) return { ok: false, rows: [], error: "docx_table_empty" };
  const rows = parseFamilyDayDocxGrid(grid);
  const counts = {
    uniforme_ninos: rows.filter((r) => /uniforme niños/i.test(r.rol)).length,
    camiseta_dama: rows.filter((r) => /camiseta dama/i.test(r.rol)).length,
    camiseta_caballero: rows.filter((r) => /caballero/i.test(r.rol)).length,
    total: rows.length,
  };
  return {
    ok: rows.length > 0,
    rows,
    layout: "family_day_docx_v1",
    sheet_name: "docx",
    sheetName: "docx",
    parse_report: {
      summary_text: `Lista Word · ${counts.total} filas · ${counts.uniforme_ninos} uniforme niños · ${counts.camiseta_dama} camiseta dama · ${counts.camiseta_caballero} camiseta caballero`,
      counts,
    },
    error: rows.length ? null : "no_rows_parsed",
  };
}

async function parseWordDocxBytes(bytes, _filename = "lista.docx") {
  return parseFamilyDayDocxBytesImpl(bytes);
}

/** @deprecated use parseWordDocxBytes */
const parseFamilyDayDocxBytes = parseWordDocxBytes;


/**
 * Parseo unificado de adjuntos lista: Excel (formato life) y Word (tabla familia).
 */

function isWordListFilename(filename) {
  return /\.docx$/i.test(compact(filename));
}

function isExcelListFilename(filename) {
  return /\.(xlsx|xlsm|xltx|xls|csv)$/i.test(compact(filename));
}

/**
 * @param {Uint8Array} bytes
 * @param {string} filename
 * @param {object} [options] — sheet_name para Excel
 */
async function parseListAttachmentBytes(bytes, filename = "lista", options = {}) {
  const name = compact(filename) || "lista";

  if (isWordListFilename(name)) {
    return parseWordDocxBytes(bytes, name);
  }

  if (!isExcelListFilename(name) && !options.forceExcel) {
    return {
      ok: false,
      rows: [],
      error: "unsupported_list_format",
      message: "Formato no soportado. Use Excel FORMATO PEDIDO LIFE (.xlsx) o lista Word (.docx).",
    };
  }

  let parsed = await parseLifeExcelBytes(bytes, name, {
    sheetName: compact(options.sheet_name || options.sheetName || ""),
  });

  if (!parsed.ok && parsed.needs_sheet_choice && parsed.sheet_choices?.length) {
    let best = parsed;
    for (const sheetName of parsed.sheet_choices) {
      const attempt = await parseLifeExcelBytes(bytes, name, { sheetName });
      if (attempt.ok && attempt.rows?.length) {
        if (!best.ok || attempt.rows.length > (best.rows?.length || 0)) best = attempt;
      }
    }
    parsed = best;
  }

  return parsed;
}



// DEFLATE is a complex format; to read this code, you should probably check the RFC first:
// https://tools.ietf.org/html/rfc1951
// You may also wish to take a look at the guide I made about this program:
// https://gist.github.com/101arrowz/253f31eb5abc3d9275ab943003ffecad
// Some of the following code is similar to that of UZIP.js:
// https://github.com/photopea/UZIP.js
// However, the vast majority of the codebase has diverged from UZIP.js to increase performance and reduce bundle size.
// Sometimes 0 will appear where -1 would be more appropriate. This is because using a uint
// is better for memory in most engines (I *think*).
var ch2 = {};
var wk = (function (c, id, msg, transfer, cb) {
    var w = new Worker(ch2[id] || (ch2[id] = URL.createObjectURL(new Blob([
        c + ';addEventListener("error",function(e){e=e.error;postMessage({$e$:[e.message,e.code,e.stack]})})'
    ], { type: 'text/javascript' }))));
    w.onmessage = function (e) {
        var d = e.data, ed = d.$e$;
        if (ed) {
            var err = new Error(ed[0]);
            err['code'] = ed[1];
            err.stack = ed[2];
            cb(err, null);
        }
        else
            cb(null, d);
    };
    w.postMessage(msg, transfer);
    return w;
});

// aliases for shorter compressed code (most minifers don't do this)
var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
// fixed length extra bits
var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0]);
// fixed distance extra bits
var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0]);
// code length index map
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
// get base, reverse index map from extra bits
var freb = function (eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
        b[i] = start += 1 << eb[i - 1];
    }
    // numbers here are at max 18 bits
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
        for (var j = b[i]; j < b[i + 1]; ++j) {
            r[j] = ((j - b[i]) << 5) | i;
        }
    }
    return { b: b, r: r };
};
var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
// we can ignore the fact that the other numbers are wrong; they never happen anyway
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), fd = _b.b, revfd = _b.r;
// map of value to reverse (assuming 16 bits)
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
    // reverse table algorithm from SO
    var x = ((i & 0xAAAA) >> 1) | ((i & 0x5555) << 1);
    x = ((x & 0xCCCC) >> 2) | ((x & 0x3333) << 2);
    x = ((x & 0xF0F0) >> 4) | ((x & 0x0F0F) << 4);
    rev[i] = (((x & 0xFF00) >> 8) | ((x & 0x00FF) << 8)) >> 1;
}
// create huffman tree from u8 "map": index -> code length for code index
// mb (max bits) must be at most 15
// TODO: optimize/split up?
var hMap = (function (cd, mb, r) {
    var s = cd.length;
    // index
    var i = 0;
    // u16 "map": index -> # of codes with bit length = index
    var l = new u16(mb);
    // length of cd must be 288 (total # of codes)
    for (; i < s; ++i) {
        if (cd[i])
            ++l[cd[i] - 1];
    }
    // u16 "map": index -> minimum code for bit length = index
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
        le[i] = (le[i - 1] + l[i - 1]) << 1;
    }
    var co;
    if (r) {
        // u16 "map": index -> number of actual bits, symbol for code
        co = new u16(1 << mb);
        // bits to remove for reverser
        var rvb = 15 - mb;
        for (i = 0; i < s; ++i) {
            // ignore 0 lengths
            if (cd[i]) {
                // num encoding both symbol and bits read
                var sv = (i << 4) | cd[i];
                // free bits
                var r_1 = mb - cd[i];
                // start value
                var v = le[cd[i] - 1]++ << r_1;
                // m is end value
                for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
                    // every 16 bit value starting with the code yields the same result
                    co[rev[v] >> rvb] = sv;
                }
            }
        }
    }
    else {
        co = new u16(s);
        for (i = 0; i < s; ++i) {
            if (cd[i]) {
                co[i] = rev[le[cd[i] - 1]++] >> (15 - cd[i]);
            }
        }
    }
    return co;
});
// fixed length tree
var flt = new u8(288);
for (var i = 0; i < 144; ++i)
    flt[i] = 8;
for (var i = 144; i < 256; ++i)
    flt[i] = 9;
for (var i = 256; i < 280; ++i)
    flt[i] = 7;
for (var i = 280; i < 288; ++i)
    flt[i] = 8;
// fixed distance tree
var fdt = new u8(32);
for (var i = 0; i < 32; ++i)
    fdt[i] = 5;
// fixed length map
var flm = /*#__PURE__*/ hMap(flt, 9, 0), flrm = /*#__PURE__*/ hMap(flt, 9, 1);
// fixed distance map
var fdm = /*#__PURE__*/ hMap(fdt, 5, 0), fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
// find max of array
var max = function (a) {
    var m = a[0];
    for (var i = 1; i < a.length; ++i) {
        if (a[i] > m)
            m = a[i];
    }
    return m;
};
// read d, starting at bit p and mask with m
var bits = function (d, p, m) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8)) >> (p & 7)) & m;
};
// read d, starting at bit p continuing for at least 16 bits
var bits16 = function (d, p) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >> (p & 7));
};
// get end of byte
var shft = function (p) { return ((p + 7) / 8) | 0; };
// typed array slice - allows garbage collector to free original reference,
// while being more compatible than .slice
var slc = function (v, s, e) {
    if (s == null || s < 0)
        s = 0;
    if (e == null || e > v.length)
        e = v.length;
    // can't use .constructor in case user-supplied
    return new u8(v.subarray(s, e));
};
/**
 * Codes for errors generated within this library
 */
var FlateErrorCode = {
    UnexpectedEOF: 0,
    InvalidBlockType: 1,
    InvalidLengthLiteral: 2,
    InvalidDistance: 3,
    StreamFinished: 4,
    NoStreamHandler: 5,
    InvalidHeader: 6,
    NoCallback: 7,
    InvalidUTF8: 8,
    ExtraFieldTooLong: 9,
    InvalidDate: 10,
    FilenameTooLong: 11,
    StreamFinishing: 12,
    InvalidZipData: 13,
    UnknownCompressionMethod: 14
};
// error codes
var ec = [
    'unexpected EOF',
    'invalid block type',
    'invalid length/literal',
    'invalid distance',
    'stream finished',
    'no stream handler',
    , // determined by compression function
    'no callback',
    'invalid UTF-8 data',
    'extra field too long',
    'date not in range 1980-2099',
    'filename too long',
    'stream finishing',
    'invalid zip data'
    // determined by unknown compression method
];
;
var err = function (ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
        Error.captureStackTrace(e, err);
    if (!nt)
        throw e;
    return e;
};
// expands raw DEFLATE data
var inflt = function (dat, st, buf, dict) {
    // source length       dict length
    var sl = dat.length, dl = dict ? dict.length : 0;
    if (!sl || st.f && !st.l)
        return buf || new u8(0);
    var noBuf = !buf;
    // have to estimate size
    var resize = noBuf || st.i != 2;
    // no state
    var noSt = st.i;
    // Assumes roughly 33% compression ratio average
    if (noBuf)
        buf = new u8(sl * 3);
    // ensure buffer can fit at least l elements
    var cbuf = function (l) {
        var bl = buf.length;
        // need to increase size to fit
        if (l > bl) {
            // Double or set to necessary, whichever is greater
            var nbuf = new u8(Math.max(bl * 2, l));
            nbuf.set(buf);
            buf = nbuf;
        }
    };
    //  last chunk         bitpos           bytes
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    // total bits
    var tbts = sl * 8;
    do {
        if (!lm) {
            // BFINAL - this is only 1 when last chunk is next
            final = bits(dat, pos, 1);
            // type: 0 = no compression, 1 = fixed huffman, 2 = dynamic huffman
            var type = bits(dat, pos + 1, 3);
            pos += 3;
            if (!type) {
                // go to end of byte boundary
                var s = shft(pos) + 4, l = dat[s - 4] | (dat[s - 3] << 8), t = s + l;
                if (t > sl) {
                    if (noSt)
                        err(0);
                    break;
                }
                // ensure size
                if (resize)
                    cbuf(bt + l);
                // Copy over uncompressed data
                buf.set(dat.subarray(s, t), bt);
                // Get new bitpos, update byte count
                st.b = bt += l, st.p = pos = t * 8, st.f = final;
                continue;
            }
            else if (type == 1)
                lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
            else if (type == 2) {
                //  literal                            lengths
                var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
                var tl = hLit + bits(dat, pos + 5, 31) + 1;
                pos += 14;
                // length+distance tree
                var ldt = new u8(tl);
                // code length tree
                var clt = new u8(19);
                for (var i = 0; i < hcLen; ++i) {
                    // use index map to get real code
                    clt[clim[i]] = bits(dat, pos + i * 3, 7);
                }
                pos += hcLen * 3;
                // code lengths bits
                var clb = max(clt), clbmsk = (1 << clb) - 1;
                // code lengths map
                var clm = hMap(clt, clb, 1);
                for (var i = 0; i < tl;) {
                    var r = clm[bits(dat, pos, clbmsk)];
                    // bits read
                    pos += r & 15;
                    // symbol
                    var s = r >> 4;
                    // code length to copy
                    if (s < 16) {
                        ldt[i++] = s;
                    }
                    else {
                        //  copy   count
                        var c = 0, n = 0;
                        if (s == 16)
                            n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
                        else if (s == 17)
                            n = 3 + bits(dat, pos, 7), pos += 3;
                        else if (s == 18)
                            n = 11 + bits(dat, pos, 127), pos += 7;
                        while (n--)
                            ldt[i++] = c;
                    }
                }
                //    length tree                 distance tree
                var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
                // max length bits
                lbt = max(lt);
                // max dist bits
                dbt = max(dt);
                lm = hMap(lt, lbt, 1);
                dm = hMap(dt, dbt, 1);
            }
            else
                err(1);
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
        }
        // Make sure the buffer can hold this + the largest possible addition
        // Maximum chunk size (practically, theoretically infinite) is 2^17
        if (resize)
            cbuf(bt + 131072);
        var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
        var lpos = pos;
        for (;; lpos = pos) {
            // bits read, code
            var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
            pos += c & 15;
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
            if (!c)
                err(2);
            if (sym < 256)
                buf[bt++] = sym;
            else if (sym == 256) {
                lpos = pos, lm = null;
                break;
            }
            else {
                var add = sym - 254;
                // no extra bits needed if less
                if (sym > 264) {
                    // index
                    var i = sym - 257, b = fleb[i];
                    add = bits(dat, pos, (1 << b) - 1) + fl[i];
                    pos += b;
                }
                // dist
                var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
                if (!d)
                    err(3);
                pos += d & 15;
                var dt = fd[dsym];
                if (dsym > 3) {
                    var b = fdeb[dsym];
                    dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
                }
                if (pos > tbts) {
                    if (noSt)
                        err(0);
                    break;
                }
                if (resize)
                    cbuf(bt + 131072);
                var end = bt + add;
                if (bt < dt) {
                    var shift = dl - dt, dend = Math.min(dt, end);
                    if (shift + bt < 0)
                        err(3);
                    for (; bt < dend; ++bt)
                        buf[bt] = dict[shift + bt];
                }
                for (; bt < end; ++bt)
                    buf[bt] = buf[bt - dt];
            }
        }
        st.l = lm, st.p = lpos, st.b = bt, st.f = final;
        if (lm)
            final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    // don't reallocate for streams or user buffers
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
// starting at p, write the minimum number of bits that can hold v to d
var wbits = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
};
// starting at p, write the minimum number of bits (>8) that can hold v to d
var wbits16 = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
    d[o + 2] |= v >> 16;
};
// creates code lengths from a frequency table
var hTree = function (d, mb) {
    // Need extra info to make a tree
    var t = [];
    for (var i = 0; i < d.length; ++i) {
        if (d[i])
            t.push({ s: i, f: d[i] });
    }
    var s = t.length;
    var t2 = t.slice();
    if (!s)
        return { t: et, l: 0 };
    if (s == 1) {
        var v = new u8(t[0].s + 1);
        v[t[0].s] = 1;
        return { t: v, l: 1 };
    }
    t.sort(function (a, b) { return a.f - b.f; });
    // after i2 reaches last ind, will be stopped
    // freq must be greater than largest possible number of symbols
    t.push({ s: -1, f: 25001 });
    var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
    t[0] = { s: -1, f: l.f + r.f, l: l, r: r };
    // efficient algorithm from UZIP.js
    // i0 is lookbehind, i2 is lookahead - after processing two low-freq
    // symbols that combined have high freq, will start processing i2 (high-freq,
    // non-composite) symbols instead
    // see https://reddit.com/r/photopea/comments/ikekht/uzipjs_questions/
    while (i1 != s - 1) {
        l = t[t[i0].f < t[i2].f ? i0++ : i2++];
        r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
        t[i1++] = { s: -1, f: l.f + r.f, l: l, r: r };
    }
    var maxSym = t2[0].s;
    for (var i = 1; i < s; ++i) {
        if (t2[i].s > maxSym)
            maxSym = t2[i].s;
    }
    // code lengths
    var tr = new u16(maxSym + 1);
    // max bits in tree
    var mbt = ln(t[i1 - 1], tr, 0);
    if (mbt > mb) {
        // more algorithms from UZIP.js
        // TODO: find out how this code works (debt)
        //  ind    debt
        var i = 0, dt = 0;
        //    left            cost
        var lft = mbt - mb, cst = 1 << lft;
        t2.sort(function (a, b) { return tr[b.s] - tr[a.s] || a.f - b.f; });
        for (; i < s; ++i) {
            var i2_1 = t2[i].s;
            if (tr[i2_1] > mb) {
                dt += cst - (1 << (mbt - tr[i2_1]));
                tr[i2_1] = mb;
            }
            else
                break;
        }
        dt >>= lft;
        while (dt > 0) {
            var i2_2 = t2[i].s;
            if (tr[i2_2] < mb)
                dt -= 1 << (mb - tr[i2_2]++ - 1);
            else
                ++i;
        }
        for (; i >= 0 && dt; --i) {
            var i2_3 = t2[i].s;
            if (tr[i2_3] == mb) {
                --tr[i2_3];
                ++dt;
            }
        }
        mbt = mb;
    }
    return { t: new u8(tr), l: mbt };
};
// get the max length and assign length codes
var ln = function (n, l, d) {
    return n.s == -1
        ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1))
        : (l[n.s] = d);
};
// length codes generation
var lc = function (c) {
    var s = c.length;
    // Note that the semicolon was intentional
    while (s && !c[--s])
        ;
    var cl = new u16(++s);
    //  ind      num         streak
    var cli = 0, cln = c[0], cls = 1;
    var w = function (v) { cl[cli++] = v; };
    for (var i = 1; i <= s; ++i) {
        if (c[i] == cln && i != s)
            ++cls;
        else {
            if (!cln && cls > 2) {
                for (; cls > 138; cls -= 138)
                    w(32754);
                if (cls > 2) {
                    w(cls > 10 ? ((cls - 11) << 5) | 28690 : ((cls - 3) << 5) | 12305);
                    cls = 0;
                }
            }
            else if (cls > 3) {
                w(cln), --cls;
                for (; cls > 6; cls -= 6)
                    w(8304);
                if (cls > 2)
                    w(((cls - 3) << 5) | 8208), cls = 0;
            }
            while (cls--)
                w(cln);
            cls = 1;
            cln = c[i];
        }
    }
    return { c: cl.subarray(0, cli), n: s };
};
// calculate the length of output from tree, code lengths
var clen = function (cf, cl) {
    var l = 0;
    for (var i = 0; i < cl.length; ++i)
        l += cf[i] * cl[i];
    return l;
};
// writes a fixed block
// returns the new bit pos
var wfblk = function (out, pos, dat) {
    // no need to write 00 as type: TypedArray defaults to 0
    var s = dat.length;
    var o = shft(pos + 2);
    out[o] = s & 255;
    out[o + 1] = s >> 8;
    out[o + 2] = out[o] ^ 255;
    out[o + 3] = out[o + 1] ^ 255;
    for (var i = 0; i < s; ++i)
        out[o + i + 4] = dat[i];
    return (o + 4 + s) * 8;
};
// writes a block
var wblk = function (dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
    wbits(out, p++, final);
    ++lf[256];
    var _a = hTree(lf, 15), dlt = _a.t, mlb = _a.l;
    var _b = hTree(df, 15), ddt = _b.t, mdb = _b.l;
    var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
    var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
    var lcfreq = new u16(19);
    for (var i = 0; i < lclt.length; ++i)
        ++lcfreq[lclt[i] & 31];
    for (var i = 0; i < lcdt.length; ++i)
        ++lcfreq[lcdt[i] & 31];
    var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
    var nlcc = 19;
    for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
        ;
    var flen = (bl + 5) << 3;
    var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
    var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
    if (bs >= 0 && flen <= ftlen && flen <= dtlen)
        return wfblk(out, p, dat.subarray(bs, bs + bl));
    var lm, ll, dm, dl;
    wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
    if (dtlen < ftlen) {
        lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
        var llm = hMap(lct, mlcb, 0);
        wbits(out, p, nlc - 257);
        wbits(out, p + 5, ndc - 1);
        wbits(out, p + 10, nlcc - 4);
        p += 14;
        for (var i = 0; i < nlcc; ++i)
            wbits(out, p + 3 * i, lct[clim[i]]);
        p += 3 * nlcc;
        var lcts = [lclt, lcdt];
        for (var it = 0; it < 2; ++it) {
            var clct = lcts[it];
            for (var i = 0; i < clct.length; ++i) {
                var len = clct[i] & 31;
                wbits(out, p, llm[len]), p += lct[len];
                if (len > 15)
                    wbits(out, p, (clct[i] >> 5) & 127), p += clct[i] >> 12;
            }
        }
    }
    else {
        lm = flm, ll = flt, dm = fdm, dl = fdt;
    }
    for (var i = 0; i < li; ++i) {
        var sym = syms[i];
        if (sym > 255) {
            var len = (sym >> 18) & 31;
            wbits16(out, p, lm[len + 257]), p += ll[len + 257];
            if (len > 7)
                wbits(out, p, (sym >> 23) & 31), p += fleb[len];
            var dst = sym & 31;
            wbits16(out, p, dm[dst]), p += dl[dst];
            if (dst > 3)
                wbits16(out, p, (sym >> 5) & 8191), p += fdeb[dst];
        }
        else {
            wbits16(out, p, lm[sym]), p += ll[sym];
        }
    }
    wbits16(out, p, lm[256]);
    return p + ll[256];
};
// deflate options (nice << 13) | chain
var deo = /*#__PURE__*/ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
// empty
var et = /*#__PURE__*/ new u8(0);
// compresses data into a raw DEFLATE buffer
var dflt = function (dat, lvl, plvl, pre, post, st) {
    var s = st.z || dat.length;
    var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7000)) + post);
    // writing to this writes to the output buffer
    var w = o.subarray(pre, o.length - post);
    var lst = st.l;
    var pos = (st.r || 0) & 7;
    if (lvl) {
        if (pos)
            w[0] = st.r >> 3;
        var opt = deo[lvl - 1];
        var n = opt >> 13, c = opt & 8191;
        var msk_1 = (1 << plvl) - 1;
        //    prev 2-byte val map    curr 2-byte val map
        var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
        var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
        var hsh = function (i) { return (dat[i] ^ (dat[i + 1] << bs1_1) ^ (dat[i + 2] << bs2_1)) & msk_1; };
        // 24576 is an arbitrary number of maximum symbols per block
        // 424 buffer for last block
        var syms = new i32(25000);
        // length/literal freq   distance freq
        var lf = new u16(288), df = new u16(32);
        //  l/lcnt  exbits  index          l/lind  waitdx          blkpos
        var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
        for (; i + 2 < s; ++i) {
            // hash value
            var hv = hsh(i);
            // index mod 32768    previous index mod
            var imod = i & 32767, pimod = head[hv];
            prev[imod] = pimod;
            head[hv] = imod;
            // We always should modify head and prev, but only add symbols if
            // this data is not yet processed ("wait" for wait index)
            if (wi <= i) {
                // bytes remaining
                var rem = s - i;
                if ((lc_1 > 7000 || li > 24576) && (rem > 423 || !lst)) {
                    pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
                    li = lc_1 = eb = 0, bs = i;
                    for (var j = 0; j < 286; ++j)
                        lf[j] = 0;
                    for (var j = 0; j < 30; ++j)
                        df[j] = 0;
                }
                //  len    dist   chain
                var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
                if (rem > 2 && hv == hsh(i - dif)) {
                    var maxn = Math.min(n, rem) - 1;
                    var maxd = Math.min(32767, i);
                    // max possible length
                    // not capped at dif because decompressors implement "rolling" index population
                    var ml = Math.min(258, rem);
                    while (dif <= maxd && --ch_1 && imod != pimod) {
                        if (dat[i + l] == dat[i + l - dif]) {
                            var nl = 0;
                            for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                                ;
                            if (nl > l) {
                                l = nl, d = dif;
                                // break out early when we reach "nice" (we are satisfied enough)
                                if (nl > maxn)
                                    break;
                                // now, find the rarest 2-byte sequence within this
                                // length of literals and search for that instead.
                                // Much faster than just using the start
                                var mmd = Math.min(dif, nl - 2);
                                var md = 0;
                                for (var j = 0; j < mmd; ++j) {
                                    var ti = i - dif + j & 32767;
                                    var pti = prev[ti];
                                    var cd = ti - pti & 32767;
                                    if (cd > md)
                                        md = cd, pimod = ti;
                                }
                            }
                        }
                        // check the previous match
                        imod = pimod, pimod = prev[imod];
                        dif += imod - pimod & 32767;
                    }
                }
                // d will be nonzero only when a match was found
                if (d) {
                    // store both dist and len data in one int32
                    // Make sure this is recognized as a len/dist with 28th bit (2^28)
                    syms[li++] = 268435456 | (revfl[l] << 18) | revfd[d];
                    var lin = revfl[l] & 31, din = revfd[d] & 31;
                    eb += fleb[lin] + fdeb[din];
                    ++lf[257 + lin];
                    ++df[din];
                    wi = i + l;
                    ++lc_1;
                }
                else {
                    syms[li++] = dat[i];
                    ++lf[dat[i]];
                }
            }
        }
        for (i = Math.max(i, wi); i < s; ++i) {
            syms[li++] = dat[i];
            ++lf[dat[i]];
        }
        pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
        if (!lst) {
            st.r = (pos & 7) | w[(pos / 8) | 0] << 3;
            // shft(pos) now 1 less if pos & 7 != 0
            pos -= 7;
            st.h = head, st.p = prev, st.i = i, st.w = wi;
        }
    }
    else {
        for (var i = st.w || 0; i < s + lst; i += 65535) {
            // end
            var e = i + 65535;
            if (e >= s) {
                // write final block
                w[(pos / 8) | 0] = lst;
                e = s;
            }
            pos = wfblk(w, pos + 1, dat.subarray(i, e));
        }
        st.i = s;
    }
    return slc(o, 0, pre + shft(pos) + post);
};
// CRC32 table
var crct = /*#__PURE__*/ (function () {
    var t = new Int32Array(256);
    for (var i = 0; i < 256; ++i) {
        var c = i, k = 9;
        while (--k)
            c = ((c & 1) && -306674912) ^ (c >>> 1);
        t[i] = c;
    }
    return t;
})();
// CRC32
var crc = function () {
    var c = -1;
    return {
        p: function (d) {
            // closures have awful performance
            var cr = c;
            for (var i = 0; i < d.length; ++i)
                cr = crct[(cr & 255) ^ d[i]] ^ (cr >>> 8);
            c = cr;
        },
        d: function () { return ~c; }
    };
};
// Adler32
var adler = function () {
    var a = 1, b = 0;
    return {
        p: function (d) {
            // closures have awful performance
            var n = a, m = b;
            var l = d.length | 0;
            for (var i = 0; i != l;) {
                var e = Math.min(i + 2655, l);
                for (; i < e; ++i)
                    m += n += d[i];
                n = (n & 65535) + 15 * (n >> 16), m = (m & 65535) + 15 * (m >> 16);
            }
            a = n, b = m;
        },
        d: function () {
            a %= 65521, b %= 65521;
            return (a & 255) << 24 | (a & 0xFF00) << 8 | (b & 255) << 8 | (b >> 8);
        }
    };
};
;
// deflate with opts
var dopt = function (dat, opt, pre, post, st) {
    if (!st) {
        st = { l: 1 };
        if (opt.dictionary) {
            var dict = opt.dictionary.subarray(-32768);
            var newDat = new u8(dict.length + dat.length);
            newDat.set(dict);
            newDat.set(dat, dict.length);
            dat = newDat;
            st.w = dict.length;
        }
    }
    return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? (st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20) : (12 + opt.mem), pre, post, st);
};
// Walmart object spread
var mrg = function (a, b) {
    var o = {};
    for (var k in a)
        o[k] = a[k];
    for (var k in b)
        o[k] = b[k];
    return o;
};
// worker clone
// This is possibly the craziest part of the entire codebase, despite how simple it may seem.
// The only parameter to this function is a closure that returns an array of variables outside of the function scope.
// We're going to try to figure out the variable names used in the closure as strings because that is crucial for workerization.
// We will return an object mapping of true variable name to value (basically, the current scope as a JS object).
// The reason we can't just use the original variable names is minifiers mangling the toplevel scope.
// This took me three weeks to figure out how to do.
var wcln = function (fn, fnStr, td) {
    var dt = fn();
    var st = fn.toString();
    var ks = st.slice(st.indexOf('[') + 1, st.lastIndexOf(']')).replace(/\s+/g, '').split(',');
    for (var i = 0; i < dt.length; ++i) {
        var v = dt[i], k = ks[i];
        if (typeof v == 'function') {
            fnStr += ';' + k + '=';
            var st_1 = v.toString();
            if (v.prototype) {
                // for global objects
                if (st_1.indexOf('[native code]') != -1) {
                    var spInd = st_1.indexOf(' ', 8) + 1;
                    fnStr += st_1.slice(spInd, st_1.indexOf('(', spInd));
                }
                else {
                    fnStr += st_1;
                    for (var t in v.prototype)
                        fnStr += ';' + k + '.prototype.' + t + '=' + v.prototype[t].toString();
                }
            }
            else
                fnStr += st_1;
        }
        else
            td[k] = v;
    }
    return fnStr;
};
var ch = [];
// clone bufs
var cbfs = function (v) {
    var tl = [];
    for (var k in v) {
        if (v[k].buffer) {
            tl.push((v[k] = new v[k].constructor(v[k])).buffer);
        }
    }
    return tl;
};
// use a worker to execute code
var wrkr = function (fns, init, id, cb) {
    if (!ch[id]) {
        var fnStr = '', td_1 = {}, m = fns.length - 1;
        for (var i = 0; i < m; ++i)
            fnStr = wcln(fns[i], fnStr, td_1);
        ch[id] = { c: wcln(fns[m], fnStr, td_1), e: td_1 };
    }
    var td = mrg({}, ch[id].e);
    return wk(ch[id].c + ';onmessage=function(e){for(var k in e.data)self[k]=e.data[k];onmessage=' + init.toString() + '}', id, td, cbfs(td), cb);
};
// base async inflate fn
var bInflt = function () { return [u8, u16, i32, fleb, fdeb, clim, fl, fd, flrm, fdrm, rev, ec, hMap, max, bits, bits16, shft, slc, err, inflt, inflateSync, pbf, gopt]; };
var bDflt = function () { return [u8, u16, i32, fleb, fdeb, clim, revfl, revfd, flm, flt, fdm, fdt, rev, deo, et, hMap, wbits, wbits16, hTree, ln, lc, clen, wfblk, wblk, shft, slc, dflt, dopt, deflateSync, pbf]; };
// gzip extra
var gze = function () { return [gzh, gzhl, wbytes, crc, crct]; };
// gunzip extra
var guze = function () { return [gzs, gzl]; };
// zlib extra
var zle = function () { return [zlh, wbytes, adler]; };
// unzlib extra
var zule = function () { return [zls]; };
// post buf
var pbf = function (msg) { return postMessage(msg, [msg.buffer]); };
// get opts
var gopt = function (o) { return o && {
    out: o.size && new u8(o.size),
    dictionary: o.dictionary
}; };
// async helper
var cbify = function (dat, opts, fns, init, id, cb) {
    var w = wrkr(fns, init, id, function (err, dat) {
        w.terminate();
        cb(err, dat);
    });
    w.postMessage([dat, opts], opts.consume ? [dat.buffer] : []);
    return function () { w.terminate(); };
};
// auto stream
var astrm = function (strm) {
    strm.ondata = function (dat, final) { return postMessage([dat, final], [dat.buffer]); };
    return function (ev) {
        if (ev.data[0]) {
            strm.push(ev.data[0], ev.data[1]);
            postMessage([ev.data[0].length]);
        }
        else
            strm.flush(ev.data[1]);
    };
};
// async stream attach
var astrmify = function (fns, strm, opts, init, id, flush, ext) {
    var t;
    var w = wrkr(fns, init, id, function (err, dat) {
        if (err)
            w.terminate(), strm.ondata.call(strm, err);
        else if (!Array.isArray(dat))
            ext(dat);
        else if (dat.length == 1) {
            strm.queuedSize -= dat[0];
            if (strm.ondrain)
                strm.ondrain(dat[0]);
        }
        else {
            if (dat[1])
                w.terminate();
            strm.ondata.call(strm, err, dat[0], dat[1]);
        }
    });
    w.postMessage(opts);
    strm.queuedSize = 0;
    strm.push = function (d, f) {
        if (!strm.ondata)
            err(5);
        if (t)
            strm.ondata(err(4, 0, 1), null, !!f);
        strm.queuedSize += d.length;
        // can fail for cross-realm Uint8Array, but ok - only a small performance penalty
        w.postMessage([d, t = f], d.buffer instanceof ArrayBuffer ? [d.buffer] : []);
    };
    strm.terminate = function () { w.terminate(); };
    if (flush) {
        strm.flush = function (sync) { w.postMessage([0, sync]); };
    }
};
// read 2 bytes
var b2 = function (d, b) { return d[b] | (d[b + 1] << 8); };
// read 4 bytes
var b4 = function (d, b) { return (d[b] | (d[b + 1] << 8) | (d[b + 2] << 16) | (d[b + 3] << 24)) >>> 0; };
// read 8 bytes
var b8 = function (d, b) { return b4(d, b) + (b4(d, b + 4) * 4294967296); };
// write bytes
var wbytes = function (d, b, v) {
    for (; v; ++b)
        d[b] = v, v >>>= 8;
};
// gzip header
var gzh = function (c, o) {
    var fn = o.filename;
    c[0] = 31, c[1] = 139, c[2] = 8, c[8] = o.level < 2 ? 4 : o.level == 9 ? 2 : 0, c[9] = 3; // assume Unix
    if (o.mtime != 0)
        wbytes(c, 4, Math.floor(new Date(o.mtime || Date.now()) / 1000));
    if (fn) {
        c[3] = 8;
        for (var i = 0; i <= fn.length; ++i)
            c[i + 10] = fn.charCodeAt(i);
    }
};
// gzip footer: -8 to -4 = CRC, -4 to -0 is length
// gzip start
var gzs = function (d) {
    if (d[0] != 31 || d[1] != 139 || d[2] != 8)
        err(6, 'invalid gzip data');
    var flg = d[3];
    var st = 10;
    if (flg & 4)
        st += (d[10] | d[11] << 8) + 2;
    for (var zs = (flg >> 3 & 1) + (flg >> 4 & 1); zs > 0; zs -= !d[st++])
        ;
    return st + (flg & 2);
};
// gzip length
var gzl = function (d) {
    var l = d.length;
    return (d[l - 4] | d[l - 3] << 8 | d[l - 2] << 16 | d[l - 1] << 24) >>> 0;
};
// gzip header length
var gzhl = function (o) { return 10 + (o.filename ? o.filename.length + 1 : 0); };
// zlib header
var zlh = function (c, o) {
    var lv = o.level, fl = lv == 0 ? 0 : lv < 6 ? 1 : lv == 9 ? 3 : 2;
    c[0] = 120, c[1] = (fl << 6) | (o.dictionary && 32);
    c[1] |= 31 - ((c[0] << 8) | c[1]) % 31;
    if (o.dictionary) {
        var h = adler();
        h.p(o.dictionary);
        wbytes(c, 2, h.d());
    }
};
// zlib start
var zls = function (d, dict) {
    if ((d[0] & 15) != 8 || (d[0] >> 4) > 7 || ((d[0] << 8 | d[1]) % 31))
        err(6, 'invalid zlib data');
    if ((d[1] >> 5 & 1) == +!dict)
        err(6, 'invalid zlib data: ' + (d[1] & 32 ? 'need' : 'unexpected') + ' dictionary');
    return (d[1] >> 3 & 4) + 2;
};
function StrmOpt(opts, cb) {
    if (typeof opts == 'function')
        cb = opts, opts = {};
    this.ondata = cb;
    return opts;
}
/**
 * Streaming DEFLATE compression
 */
var Deflate = /*#__PURE__*/ (function () {
    function Deflate(opts, cb) {
        if (typeof opts == 'function')
            cb = opts, opts = {};
        this.ondata = cb;
        this.o = opts || {};
        this.s = { l: 0, i: 32768, w: 32768, z: 32768 };
        // Buffer length must always be 0 mod 32768 for index calculations to be correct when modifying head and prev
        // 98304 = 32768 (lookback) + 65536 (common chunk size)
        this.b = new u8(98304);
        if (this.o.dictionary) {
            var dict = this.o.dictionary.subarray(-32768);
            this.b.set(dict, 32768 - dict.length);
            this.s.i = 32768 - dict.length;
        }
    }
    Deflate.prototype.p = function (c, f) {
        this.ondata(dopt(c, this.o, 0, 0, this.s), f);
    };
    /**
     * Pushes a chunk to be deflated
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Deflate.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        if (this.s.l)
            err(4);
        var endLen = chunk.length + this.s.z;
        if (endLen > this.b.length) {
            if (endLen > 2 * this.b.length - 32768) {
                var newBuf = new u8(endLen & -32768);
                newBuf.set(this.b.subarray(0, this.s.z));
                this.b = newBuf;
            }
            var split = this.b.length - this.s.z;
            this.b.set(chunk.subarray(0, split), this.s.z);
            this.s.z = this.b.length;
            this.p(this.b, false);
            this.b.set(this.b.subarray(-32768));
            this.b.set(chunk.subarray(split), 32768);
            this.s.z = chunk.length - split + 32768;
            this.s.i = 32766, this.s.w = 32768;
        }
        else {
            this.b.set(chunk, this.s.z);
            this.s.z += chunk.length;
        }
        this.s.l = final & 1;
        if (this.s.z > this.s.w + 8191 || final) {
            this.p(this.b, final || false);
            this.s.w = this.s.i, this.s.i -= 2;
        }
        if (final) {
            // cleanup unneeded buffers/state to reduce memory usage
            this.s = this.o = {};
            this.b = et;
        }
    };
    /**
     * Flushes buffered uncompressed data. Useful to immediately retrieve the
     * deflated output for small inputs.
     * @param sync Whether to flush to a byte boundary. A sync flush takes 4-5
     *             extra bytes, but guarantees all pushed data is immediately
     *             decompressible. A separate DEFLATE stream may be concatenated
     *             with the current output after a sync flush.
     */
    Deflate.prototype.flush = function (sync) {
        if (!this.ondata)
            err(5);
        if (this.s.l)
            err(4);
        this.p(this.b, false);
        this.s.w = this.s.i, this.s.i -= 2;
        // could technically skip writing the type-0 block for (this.s.r & 7) == 0,
        // but the deterministic trailer (00 00 FF FF) is useful in some situations
        if (sync) {
            var c = new u8(6);
            c[0] = this.s.r >> 3;
            // write empty, non-final type-0 block
            var ep = wfblk(c, this.s.r, et);
            this.s.r = 0;
            this.ondata(c.subarray(0, ep >> 3), false);
        }
    };
    return Deflate;
}());
/**
 * Asynchronous streaming DEFLATE compression
 */
var AsyncDeflate = /*#__PURE__*/ (function () {
    function AsyncDeflate(opts, cb) {
        astrmify([
            bDflt,
            function () { return [astrm, Deflate]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Deflate(ev.data);
            onmessage = astrm(strm);
        }, 6, 1);
    }
    return AsyncDeflate;
}());
function deflate(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bDflt,
    ], function (ev) { return pbf(deflateSync(ev.data[0], ev.data[1])); }, 0, cb);
}
/**
 * Compresses data with DEFLATE without any wrapper
 * @param data The data to compress
 * @param opts The compression options
 * @returns The deflated version of the data
 */
function deflateSync(data, opts) {
    return dopt(data, opts || {}, 0, 0);
}
/**
 * Streaming DEFLATE decompression
 */
var Inflate = /*#__PURE__*/ (function () {
    function Inflate(opts, cb) {
        // no StrmOpt here to avoid adding to workerizer
        if (typeof opts == 'function')
            cb = opts, opts = {};
        this.ondata = cb;
        var dict = opts && opts.dictionary && opts.dictionary.subarray(-32768);
        this.s = { i: 0, b: dict ? dict.length : 0 };
        this.o = new u8(32768);
        this.p = new u8(0);
        if (dict)
            this.o.set(dict);
    }
    Inflate.prototype.e = function (c) {
        if (!this.ondata)
            err(5);
        if (this.d)
            err(4);
        if (!this.p.length)
            this.p = c;
        else if (c.length) {
            var n = new u8(this.p.length + c.length);
            n.set(this.p), n.set(c, this.p.length), this.p = n;
        }
    };
    Inflate.prototype.c = function (final) {
        this.s.i = +(this.d = final || false);
        var bts = this.s.b;
        var dt = inflt(this.p, this.s, this.o);
        this.ondata(slc(dt, bts, this.s.b), this.d);
        this.o = slc(dt, this.s.b - 32768), this.s.b = this.o.length;
        this.p = slc(this.p, (this.s.p / 8) | 0), this.s.p &= 7;
    };
    /**
     * Pushes a chunk to be inflated
     * @param chunk The chunk to push
     * @param final Whether this is the final chunk
     */
    Inflate.prototype.push = function (chunk, final) {
        this.e(chunk), this.c(final);
    };
    return Inflate;
}());
/**
 * Asynchronous streaming DEFLATE decompression
 */
var AsyncInflate = /*#__PURE__*/ (function () {
    function AsyncInflate(opts, cb) {
        astrmify([
            bInflt,
            function () { return [astrm, Inflate]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Inflate(ev.data);
            onmessage = astrm(strm);
        }, 7, 0);
    }
    return AsyncInflate;
}());
function inflate(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bInflt
    ], function (ev) { return pbf(inflateSync(ev.data[0], gopt(ev.data[1]))); }, 1, cb);
}
function inflateSync(data, opts) {
    return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
// before you yell at me for not just using extends, my reason is that TS inheritance is hard to workerize.
/**
 * Streaming GZIP compression
 */
var Gzip = /*#__PURE__*/ (function () {
    function Gzip(opts, cb) {
        this.c = crc();
        this.l = 0;
        this.v = 1;
        Deflate.call(this, opts, cb);
    }
    /**
     * Pushes a chunk to be GZIPped
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Gzip.prototype.push = function (chunk, final) {
        this.c.p(chunk);
        this.l += chunk.length;
        Deflate.prototype.push.call(this, chunk, final);
    };
    Gzip.prototype.p = function (c, f) {
        var raw = dopt(c, this.o, this.v && gzhl(this.o), f && 8, this.s);
        if (this.v)
            gzh(raw, this.o), this.v = 0;
        if (f)
            wbytes(raw, raw.length - 8, this.c.d()), wbytes(raw, raw.length - 4, this.l);
        this.ondata(raw, f);
    };
    /**
     * Flushes buffered uncompressed data. Useful to immediately retrieve the
     * GZIPped output for small inputs.
     * @param sync Whether to flush to a byte boundary. A sync flush takes 4-5
     *             extra bytes, but guarantees all pushed data is immediately
     *             decompressible.
     */
    Gzip.prototype.flush = function (sync) {
        Deflate.prototype.flush.call(this, sync);
    };
    return Gzip;
}());
/**
 * Asynchronous streaming GZIP compression
 */
var AsyncGzip = /*#__PURE__*/ (function () {
    function AsyncGzip(opts, cb) {
        astrmify([
            bDflt,
            gze,
            function () { return [astrm, Deflate, Gzip]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Gzip(ev.data);
            onmessage = astrm(strm);
        }, 8, 1);
    }
    return AsyncGzip;
}());
function gzip(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bDflt,
        gze,
        function () { return [gzipSync]; }
    ], function (ev) { return pbf(gzipSync(ev.data[0], ev.data[1])); }, 2, cb);
}
/**
 * Compresses data with GZIP
 * @param data The data to compress
 * @param opts The compression options
 * @returns The gzipped version of the data
 */
function gzipSync(data, opts) {
    if (!opts)
        opts = {};
    var c = crc(), l = data.length;
    c.p(data);
    var d = dopt(data, opts, gzhl(opts), 8), s = d.length;
    return gzh(d, opts), wbytes(d, s - 8, c.d()), wbytes(d, s - 4, l), d;
}
/**
 * Streaming single or multi-member GZIP decompression
 */
var Gunzip = /*#__PURE__*/ (function () {
    function Gunzip(opts, cb) {
        this.v = 1;
        this.r = 0;
        Inflate.call(this, opts, cb);
    }
    /**
     * Pushes a chunk to be GUNZIPped
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Gunzip.prototype.push = function (chunk, final) {
        Inflate.prototype.e.call(this, chunk);
        this.r += chunk.length;
        if (this.v) {
            var p = this.p.subarray(this.v - 1);
            var s = p.length > 3 ? gzs(p) : 4;
            if (s > p.length) {
                if (!final)
                    return;
            }
            else if (this.v > 1 && this.onmember) {
                this.onmember(this.r - p.length);
            }
            this.p = p.subarray(s), this.v = 0;
        }
        // necessary to prevent TS from using the closure value
        // This allows for workerization to function correctly
        Inflate.prototype.c.call(this, 0);
        // process concatenated GZIP
        if (this.s.f && !this.s.l) {
            this.v = shft(this.s.p) + 9;
            this.s = { i: 0 };
            this.o = new u8(0);
            this.push(new u8(0), final);
        }
        else if (final) {
            Inflate.prototype.c.call(this, final);
        }
    };
    return Gunzip;
}());
/**
 * Asynchronous streaming single or multi-member GZIP decompression
 */
var AsyncGunzip = /*#__PURE__*/ (function () {
    function AsyncGunzip(opts, cb) {
        var _this = this;
        astrmify([
            bInflt,
            guze,
            function () { return [astrm, Inflate, Gunzip]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Gunzip(ev.data);
            strm.onmember = function (offset) { return postMessage(offset); };
            onmessage = astrm(strm);
        }, 9, 0, function (offset) { return _this.onmember && _this.onmember(offset); });
    }
    return AsyncGunzip;
}());
function gunzip(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bInflt,
        guze,
        function () { return [gunzipSync]; }
    ], function (ev) { return pbf(gunzipSync(ev.data[0], ev.data[1])); }, 3, cb);
}
function gunzipSync(data, opts) {
    var st = gzs(data);
    if (st + 8 > data.length)
        err(6, 'invalid gzip data');
    return inflt(data.subarray(st, -8), { i: 2 }, opts && opts.out || new u8(gzl(data)), opts && opts.dictionary);
}
/**
 * Streaming Zlib compression
 */
var Zlib = /*#__PURE__*/ (function () {
    function Zlib(opts, cb) {
        this.c = adler();
        this.v = 1;
        Deflate.call(this, opts, cb);
    }
    /**
     * Pushes a chunk to be zlibbed
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Zlib.prototype.push = function (chunk, final) {
        this.c.p(chunk);
        Deflate.prototype.push.call(this, chunk, final);
    };
    Zlib.prototype.p = function (c, f) {
        var raw = dopt(c, this.o, this.v && (this.o.dictionary ? 6 : 2), f && 4, this.s);
        if (this.v)
            zlh(raw, this.o), this.v = 0;
        if (f)
            wbytes(raw, raw.length - 4, this.c.d());
        this.ondata(raw, f);
    };
    /**
     * Flushes buffered uncompressed data. Useful to immediately retrieve the
     * zlibbed output for small inputs.
     * @param sync Whether to flush to a byte boundary. A sync flush takes 4-5
     *             extra bytes, but guarantees all pushed data is immediately
     *             decompressible.
     */
    Zlib.prototype.flush = function (sync) {
        Deflate.prototype.flush.call(this, sync);
    };
    return Zlib;
}());
/**
 * Asynchronous streaming Zlib compression
 */
var AsyncZlib = /*#__PURE__*/ (function () {
    function AsyncZlib(opts, cb) {
        astrmify([
            bDflt,
            zle,
            function () { return [astrm, Deflate, Zlib]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Zlib(ev.data);
            onmessage = astrm(strm);
        }, 10, 1);
    }
    return AsyncZlib;
}());
function zlib(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bDflt,
        zle,
        function () { return [zlibSync]; }
    ], function (ev) { return pbf(zlibSync(ev.data[0], ev.data[1])); }, 4, cb);
}
/**
 * Compress data with Zlib
 * @param data The data to compress
 * @param opts The compression options
 * @returns The zlib-compressed version of the data
 */
function zlibSync(data, opts) {
    if (!opts)
        opts = {};
    var a = adler();
    a.p(data);
    var d = dopt(data, opts, opts.dictionary ? 6 : 2, 4);
    return zlh(d, opts), wbytes(d, d.length - 4, a.d()), d;
}
/**
 * Streaming Zlib decompression
 */
var Unzlib = /*#__PURE__*/ (function () {
    function Unzlib(opts, cb) {
        Inflate.call(this, opts, cb);
        this.v = opts && opts.dictionary ? 2 : 1;
    }
    /**
     * Pushes a chunk to be unzlibbed
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Unzlib.prototype.push = function (chunk, final) {
        Inflate.prototype.e.call(this, chunk);
        if (this.v) {
            if (this.p.length < 6 && !final)
                return;
            this.p = this.p.subarray(zls(this.p, this.v - 1)), this.v = 0;
        }
        if (final) {
            if (this.p.length < 4)
                err(6, 'invalid zlib data');
            this.p = this.p.subarray(0, -4);
        }
        // necessary to prevent TS from using the closure value
        // This allows for workerization to function correctly
        Inflate.prototype.c.call(this, final);
    };
    return Unzlib;
}());
/**
 * Asynchronous streaming Zlib decompression
 */
var AsyncUnzlib = /*#__PURE__*/ (function () {
    function AsyncUnzlib(opts, cb) {
        astrmify([
            bInflt,
            zule,
            function () { return [astrm, Inflate, Unzlib]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Unzlib(ev.data);
            onmessage = astrm(strm);
        }, 11, 0);
    }
    return AsyncUnzlib;
}());
function unzlib(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bInflt,
        zule,
        function () { return [unzlibSync]; }
    ], function (ev) { return pbf(unzlibSync(ev.data[0], gopt(ev.data[1]))); }, 5, cb);
}
function unzlibSync(data, opts) {
    return inflt(data.subarray(zls(data, opts && opts.dictionary), -4), { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
// Default algorithm for compression (used because having a known output size allows faster decompression)
/**
 * Streaming GZIP, Zlib, or raw DEFLATE decompression
 */
var Decompress = /*#__PURE__*/ (function () {
    function Decompress(opts, cb) {
        this.o = StrmOpt.call(this, opts, cb) || {};
        this.G = Gunzip;
        this.I = Inflate;
        this.Z = Unzlib;
    }
    // init substream
    // overriden by AsyncDecompress
    Decompress.prototype.i = function () {
        var _this = this;
        this.s.ondata = function (dat, final) {
            _this.ondata(dat, final);
        };
    };
    /**
     * Pushes a chunk to be decompressed
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Decompress.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        if (!this.s) {
            if (this.p && this.p.length) {
                var n = new u8(this.p.length + chunk.length);
                n.set(this.p), n.set(chunk, this.p.length);
            }
            else
                this.p = chunk;
            if (this.p.length > 2) {
                this.s = (this.p[0] == 31 && this.p[1] == 139 && this.p[2] == 8)
                    ? new this.G(this.o)
                    : ((this.p[0] & 15) != 8 || (this.p[0] >> 4) > 7 || ((this.p[0] << 8 | this.p[1]) % 31))
                        ? new this.I(this.o)
                        : new this.Z(this.o);
                this.i();
                this.s.push(this.p, final);
                this.p = null;
            }
        }
        else
            this.s.push(chunk, final);
    };
    return Decompress;
}());
/**
 * Asynchronous streaming GZIP, Zlib, or raw DEFLATE decompression
 */
var AsyncDecompress = /*#__PURE__*/ (function () {
    function AsyncDecompress(opts, cb) {
        Decompress.call(this, opts, cb);
        this.queuedSize = 0;
        this.G = AsyncGunzip;
        this.I = AsyncInflate;
        this.Z = AsyncUnzlib;
    }
    AsyncDecompress.prototype.i = function () {
        var _this = this;
        this.s.ondata = function (err, dat, final) {
            _this.ondata(err, dat, final);
        };
        this.s.ondrain = function (size) {
            _this.queuedSize -= size;
            if (_this.ondrain)
                _this.ondrain(size);
        };
    };
    /**
     * Pushes a chunk to be decompressed
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    AsyncDecompress.prototype.push = function (chunk, final) {
        this.queuedSize += chunk.length;
        Decompress.prototype.push.call(this, chunk, final);
    };
    return AsyncDecompress;
}());
function decompress(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return (data[0] == 31 && data[1] == 139 && data[2] == 8)
        ? gunzip(data, opts, cb)
        : ((data[0] & 15) != 8 || (data[0] >> 4) > 7 || ((data[0] << 8 | data[1]) % 31))
            ? inflate(data, opts, cb)
            : unzlib(data, opts, cb);
}
/**
 * Expands compressed GZIP, Zlib, or raw DEFLATE data, automatically detecting the format
 * @param data The data to decompress
 * @param opts The decompression options
 * @returns The decompressed version of the data
 */
function decompressSync(data, opts) {
    return (data[0] == 31 && data[1] == 139 && data[2] == 8)
        ? gunzipSync(data, opts)
        : ((data[0] & 15) != 8 || (data[0] >> 4) > 7 || ((data[0] << 8 | data[1]) % 31))
            ? inflateSync(data, opts)
            : unzlibSync(data, opts);
}
// flatten a directory structure
var fltn = function (d, p, t, o) {
    for (var k in d) {
        var val = d[k], n = p + k, op = o;
        if (Array.isArray(val))
            op = mrg(o, val[1]), val = val[0];
        if (ArrayBuffer.isView(val))
            t[n] = [val, op];
        else {
            t[n += '/'] = [new u8(0), op];
            fltn(val, n, t, o);
        }
    }
};
// text encoder
var te = typeof TextEncoder != 'undefined' && /*#__PURE__*/ new TextEncoder();
// text decoder
var td = typeof TextDecoder != 'undefined' && /*#__PURE__*/ new TextDecoder();
// text decoder stream
var tds = 0;
try {
    td.decode(et, { stream: true });
    tds = 1;
}
catch (e) { }
// decode UTF8
var dutf8 = function (d) {
    for (var r = '', i = 0;;) {
        var c = d[i++];
        var eb = (c > 127) + (c > 223) + (c > 239);
        if (i + eb > d.length)
            return { s: r, r: slc(d, i - 1) };
        if (!eb)
            r += String.fromCharCode(c);
        else if (eb == 3) {
            c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | (d[i++] & 63)) - 65536,
                r += String.fromCharCode(55296 | (c >> 10), 56320 | (c & 1023));
        }
        else if (eb & 1)
            r += String.fromCharCode((c & 31) << 6 | (d[i++] & 63));
        else
            r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | (d[i++] & 63));
    }
};
/**
 * Streaming UTF-8 decoding
 */
var DecodeUTF8 = /*#__PURE__*/ (function () {
    /**
     * Creates a UTF-8 decoding stream
     * @param cb The callback to call whenever data is decoded
     */
    function DecodeUTF8(cb) {
        this.ondata = cb;
        if (tds)
            this.t = new TextDecoder();
        else
            this.p = et;
    }
    /**
     * Pushes a chunk to be decoded from UTF-8 binary
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    DecodeUTF8.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        final = !!final;
        if (this.t) {
            this.ondata(this.t.decode(chunk, { stream: true }), final);
            if (final) {
                if (this.t.decode().length)
                    err(8);
                this.t = null;
            }
            return;
        }
        if (!this.p)
            err(4);
        var dat = new u8(this.p.length + chunk.length);
        dat.set(this.p);
        dat.set(chunk, this.p.length);
        var _a = dutf8(dat), s = _a.s, r = _a.r;
        if (final) {
            if (r.length)
                err(8);
            this.p = null;
        }
        else
            this.p = r;
        this.ondata(s, final);
    };
    return DecodeUTF8;
}());
/**
 * Streaming UTF-8 encoding
 */
var EncodeUTF8 = /*#__PURE__*/ (function () {
    /**
     * Creates a UTF-8 decoding stream
     * @param cb The callback to call whenever data is encoded
     */
    function EncodeUTF8(cb) {
        this.ondata = cb;
    }
    /**
     * Pushes a chunk to be encoded to UTF-8
     * @param chunk The string data to push
     * @param final Whether this is the last chunk
     */
    EncodeUTF8.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        if (this.d)
            err(4);
        this.ondata(strToU8(chunk), this.d = final || false);
    };
    return EncodeUTF8;
}());
/**
 * Converts a string into a Uint8Array for use with compression/decompression methods
 * @param str The string to encode
 * @param latin1 Whether or not to interpret the data as Latin-1. This should
 *               not need to be true unless decoding a binary string.
 * @returns The string encoded in UTF-8/Latin-1 binary
 */
function strToU8(str, latin1) {
    if (latin1) {
        var ar_1 = new u8(str.length);
        for (var i = 0; i < str.length; ++i)
            ar_1[i] = str.charCodeAt(i);
        return ar_1;
    }
    if (te)
        return te.encode(str);
    var l = str.length;
    var ar = new u8(str.length + (str.length >> 1));
    var ai = 0;
    var w = function (v) { ar[ai++] = v; };
    for (var i = 0; i < l; ++i) {
        if (ai + 5 > ar.length) {
            var n = new u8(ai + 8 + ((l - i) << 1));
            n.set(ar);
            ar = n;
        }
        var c = str.charCodeAt(i);
        if (c < 128 || latin1)
            w(c);
        else if (c < 2048)
            w(192 | (c >> 6)), w(128 | (c & 63));
        else if (c > 55295 && c < 57344)
            c = 65536 + (c & 1023 << 10) | (str.charCodeAt(++i) & 1023),
                w(240 | (c >> 18)), w(128 | ((c >> 12) & 63)), w(128 | ((c >> 6) & 63)), w(128 | (c & 63));
        else
            w(224 | (c >> 12)), w(128 | ((c >> 6) & 63)), w(128 | (c & 63));
    }
    return slc(ar, 0, ai);
}
/**
 * Converts a Uint8Array to a string
 * @param dat The data to decode to string
 * @param latin1 Whether or not to interpret the data as Latin-1. This should
 *               not need to be true unless encoding to binary string.
 * @returns The original UTF-8/Latin-1 string
 */
function strFromU8(dat, latin1) {
    if (latin1) {
        var r = '';
        for (var i = 0; i < dat.length; i += 16384)
            r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
        return r;
    }
    else if (td) {
        return td.decode(dat);
    }
    else {
        var _a = dutf8(dat), s = _a.s, r = _a.r;
        if (r.length)
            err(8);
        return s;
    }
}
;
// deflate bit flag
var dbf = function (l) { return l == 1 ? 3 : l < 6 ? 2 : l == 9 ? 1 : 0; };
// skip local zip header
var slzh = function (d, b) { return b + 30 + b2(d, b + 26) + b2(d, b + 28); };
// read zip header
var zh = function (d, b, z) {
    var fnl = b2(d, b + 28), efl = b2(d, b + 30), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl;
    var _a = z64hs(d, es, efl, z, b4(d, b + 20), b4(d, b + 24), b4(d, b + 42)), sc = _a[0], su = _a[1], off = _a[2];
    return [b2(d, b + 10), sc, su, fn, es + efl + b2(d, b + 32), off];
};
// read zip64 header sizes
var z64hs = function (d, b, l, z, sc, su, off) {
    var nsc = sc == 4294967295, nsu = su == 4294967295, noff = off == 4294967295, e = b + l;
    var nf = nsc + nsu + noff;
    if (z && nf) {
        for (; b + 4 < e; b += 4 + b2(d, b + 2)) {
            if (b2(d, b) == 1) {
                return [
                    nsc ? b8(d, b + 4 + 8 * nsu) : sc,
                    nsu ? b8(d, b + 4) : su,
                    noff ? b8(d, b + 4 + 8 * (nsu + nsc)) : off,
                    1
                ];
            }
        }
        // z == 2 for unknown whether or not zip64
        if (z < 2)
            err(13);
    }
    return [sc, su, off, 0];
};
// extra field length
var exfl = function (ex) {
    var le = 0;
    if (ex) {
        for (var k in ex) {
            var l = ex[k].length;
            if (l > 65535)
                err(9);
            le += l + 4;
        }
    }
    return le;
};
// write zip header
var wzh = function (d, b, f, fn, u, c, ce, co) {
    var fl = fn.length, ex = f.extra, col = co && co.length;
    var exl = exfl(ex);
    wbytes(d, b, ce != null ? 0x2014B50 : 0x4034B50), b += 4;
    if (ce != null)
        d[b++] = 20, d[b++] = f.os;
    d[b] = 20, b += 2; // spec compliance? what's that?
    d[b++] = (f.flag << 1) | (c < 0 && 8), d[b++] = u && 8;
    d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
    var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
    if (y < 0 || y > 119)
        err(10);
    wbytes(d, b, (y << 25) | ((dt.getMonth() + 1) << 21) | (dt.getDate() << 16) | (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1)), b += 4;
    if (c != -1) {
        wbytes(d, b, f.crc);
        wbytes(d, b + 4, c < 0 ? -c - 2 : c);
        wbytes(d, b + 8, f.size);
    }
    wbytes(d, b + 12, fl);
    wbytes(d, b + 14, exl), b += 16;
    if (ce != null) {
        wbytes(d, b, col);
        wbytes(d, b + 6, f.attrs);
        wbytes(d, b + 10, ce), b += 14;
    }
    d.set(fn, b);
    b += fl;
    if (exl) {
        for (var k in ex) {
            var exf = ex[k], l = exf.length;
            wbytes(d, b, +k);
            wbytes(d, b + 2, l);
            d.set(exf, b + 4), b += 4 + l;
        }
    }
    if (col)
        d.set(co, b), b += col;
    return b;
};
// write zip footer (end of central directory)
var wzf = function (o, b, c, d, e) {
    wbytes(o, b, 0x6054B50); // skip disk
    wbytes(o, b + 8, c);
    wbytes(o, b + 10, c);
    wbytes(o, b + 12, d);
    wbytes(o, b + 16, e);
};
/**
 * A pass-through stream to keep data uncompressed in a ZIP archive.
 */
var ZipPassThrough = /*#__PURE__*/ (function () {
    /**
     * Creates a pass-through stream that can be added to ZIP archives
     * @param filename The filename to associate with this data stream
     */
    function ZipPassThrough(filename) {
        this.filename = filename;
        this.c = crc();
        this.size = 0;
        this.compression = 0;
    }
    /**
     * Processes a chunk and pushes to the output stream. You can override this
     * method in a subclass for custom behavior, but by default this passes
     * the data through. You must call this.ondata(err, chunk, final) at some
     * point in this method.
     * @param chunk The chunk to process
     * @param final Whether this is the last chunk
     */
    ZipPassThrough.prototype.process = function (chunk, final) {
        this.ondata(null, chunk, final);
    };
    /**
     * Pushes a chunk to be added. If you are subclassing this with a custom
     * compression algorithm, note that you must push data from the source
     * file only, pre-compression.
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    ZipPassThrough.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        this.c.p(chunk);
        this.size += chunk.length;
        if (final)
            this.crc = this.c.d();
        // we shouldn't really do this cast, but properly handling ArrayBufferLike
        // makes the API unergonomic with Buffer
        this.process(chunk, final || false);
    };
    return ZipPassThrough;
}());
// I don't extend because TypeScript extension adds 1kB of runtime bloat
/**
 * Streaming DEFLATE compression for ZIP archives. Prefer using AsyncZipDeflate
 * for better performance
 */
var ZipDeflate = /*#__PURE__*/ (function () {
    /**
     * Creates a DEFLATE stream that can be added to ZIP archives
     * @param filename The filename to associate with this data stream
     * @param opts The compression options
     */
    function ZipDeflate(filename, opts) {
        var _this = this;
        if (!opts)
            opts = {};
        ZipPassThrough.call(this, filename);
        this.d = new Deflate(opts, function (dat, final) {
            _this.ondata(null, dat, final);
        });
        this.compression = 8;
        this.flag = dbf(opts.level);
    }
    ZipDeflate.prototype.process = function (chunk, final) {
        try {
            this.d.push(chunk, final);
        }
        catch (e) {
            this.ondata(e, null, final);
        }
    };
    /**
     * Pushes a chunk to be deflated
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    ZipDeflate.prototype.push = function (chunk, final) {
        ZipPassThrough.prototype.push.call(this, chunk, final);
    };
    return ZipDeflate;
}());
/**
 * Asynchronous streaming DEFLATE compression for ZIP archives
 */
var AsyncZipDeflate = /*#__PURE__*/ (function () {
    /**
     * Creates an asynchronous DEFLATE stream that can be added to ZIP archives
     * @param filename The filename to associate with this data stream
     * @param opts The compression options
     */
    function AsyncZipDeflate(filename, opts) {
        var _this = this;
        if (!opts)
            opts = {};
        ZipPassThrough.call(this, filename);
        this.d = new AsyncDeflate(opts, function (err, dat, final) {
            _this.ondata(err, dat, final);
        });
        this.compression = 8;
        this.flag = dbf(opts.level);
        this.terminate = this.d.terminate;
    }
    AsyncZipDeflate.prototype.process = function (chunk, final) {
        this.d.push(chunk, final);
    };
    /**
     * Pushes a chunk to be deflated
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    AsyncZipDeflate.prototype.push = function (chunk, final) {
        ZipPassThrough.prototype.push.call(this, chunk, final);
    };
    return AsyncZipDeflate;
}());
// TODO: Better tree shaking
/**
 * A zippable archive to which files can incrementally be added
 */
var Zip = /*#__PURE__*/ (function () {
    /**
     * Creates an empty ZIP archive to which files can be added
     * @param cb The callback to call whenever data for the generated ZIP archive
     *           is available
     */
    function Zip(cb) {
        this.ondata = cb;
        this.u = [];
        this.d = 1;
    }
    /**
     * Adds a file to the ZIP archive
     * @param file The file stream to add
     */
    Zip.prototype.add = function (file) {
        var _this = this;
        if (!this.ondata)
            err(5);
        // finishing or finished
        if (this.d & 2)
            this.ondata(err(4 + (this.d & 1) * 8, 0, 1), null, false);
        else {
            var f = strToU8(file.filename), fl_1 = f.length;
            var com = file.comment, o = com && strToU8(com);
            var u = fl_1 != file.filename.length || (o && (com.length != o.length));
            var hl_1 = fl_1 + exfl(file.extra) + 30;
            if (fl_1 > 65535)
                this.ondata(err(11, 0, 1), null, false);
            var header = new u8(hl_1);
            wzh(header, 0, file, f, u, -1);
            var chks_1 = [header];
            var pAll_1 = function () {
                for (var _i = 0, chks_2 = chks_1; _i < chks_2.length; _i++) {
                    var chk = chks_2[_i];
                    _this.ondata(null, chk, false);
                }
                chks_1 = [];
            };
            var tr_1 = this.d;
            this.d = 0;
            var ind_1 = this.u.length;
            var uf_1 = mrg(file, {
                f: f,
                u: u,
                o: o,
                t: function () {
                    if (file.terminate)
                        file.terminate();
                },
                r: function () {
                    pAll_1();
                    if (tr_1) {
                        var nxt = _this.u[ind_1 + 1];
                        if (nxt)
                            nxt.r();
                        else
                            _this.d = 1;
                    }
                    tr_1 = 1;
                }
            });
            var cl_1 = 0;
            file.ondata = function (err, dat, final) {
                if (err) {
                    _this.ondata(err, dat, final);
                    _this.terminate();
                }
                else {
                    cl_1 += dat.length;
                    chks_1.push(dat);
                    if (final) {
                        var dd = new u8(16);
                        wbytes(dd, 0, 0x8074B50);
                        wbytes(dd, 4, file.crc);
                        wbytes(dd, 8, cl_1);
                        wbytes(dd, 12, file.size);
                        chks_1.push(dd);
                        uf_1.c = cl_1, uf_1.b = hl_1 + cl_1 + 16, uf_1.crc = file.crc, uf_1.size = file.size;
                        if (tr_1)
                            uf_1.r();
                        tr_1 = 1;
                    }
                    else if (tr_1)
                        pAll_1();
                }
            };
            this.u.push(uf_1);
        }
    };
    /**
     * Ends the process of adding files and prepares to emit the final chunks.
     * This *must* be called after adding all desired files for the resulting
     * ZIP file to work properly.
     */
    Zip.prototype.end = function () {
        var _this = this;
        if (this.d & 2) {
            this.ondata(err(4 + (this.d & 1) * 8, 0, 1), null, true);
            return;
        }
        if (this.d)
            this.e();
        else
            this.u.push({
                r: function () {
                    if (!(_this.d & 1))
                        return;
                    _this.u.splice(-1, 1);
                    _this.e();
                },
                t: function () { }
            });
        this.d = 3;
    };
    Zip.prototype.e = function () {
        var bt = 0, l = 0, tl = 0;
        for (var _i = 0, _a = this.u; _i < _a.length; _i++) {
            var f = _a[_i];
            tl += 46 + f.f.length + exfl(f.extra) + (f.o ? f.o.length : 0);
        }
        var out = new u8(tl + 22);
        for (var _b = 0, _c = this.u; _b < _c.length; _b++) {
            var f = _c[_b];
            wzh(out, bt, f, f.f, f.u, -f.c - 2, l, f.o);
            bt += 46 + f.f.length + exfl(f.extra) + (f.o ? f.o.length : 0), l += f.b;
        }
        wzf(out, bt, this.u.length, tl, l);
        this.ondata(null, out, true);
        this.d = 2;
    };
    /**
     * A method to terminate any internal workers used by the stream. Subsequent
     * calls to add() will fail.
     */
    Zip.prototype.terminate = function () {
        for (var _i = 0, _a = this.u; _i < _a.length; _i++) {
            var f = _a[_i];
            f.t();
        }
        this.d = 2;
    };
    return Zip;
}());
function zip(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    var r = {};
    fltn(data, '', r, opts);
    var k = Object.keys(r);
    var lft = k.length, o = 0, tot = 0;
    var slft = lft, files = new Array(lft);
    var term = [];
    var tAll = function () {
        for (var i = 0; i < term.length; ++i)
            term[i]();
    };
    var cbd = function (a, b) {
        mt(function () { cb(a, b); });
    };
    mt(function () { cbd = cb; });
    var cbf = function () {
        var out = new u8(tot + 22), oe = o, cdl = tot - o;
        tot = 0;
        for (var i = 0; i < slft; ++i) {
            var f = files[i];
            try {
                var l = f.c.length;
                wzh(out, tot, f, f.f, f.u, l);
                var badd = 30 + f.f.length + exfl(f.extra);
                var loc = tot + badd;
                out.set(f.c, loc);
                wzh(out, o, f, f.f, f.u, l, tot, f.m), o += 16 + badd + (f.m ? f.m.length : 0), tot = loc + l;
            }
            catch (e) {
                return cbd(e, null);
            }
        }
        wzf(out, o, files.length, cdl, oe);
        cbd(null, out);
    };
    if (!lft)
        cbf();
    var _loop_1 = function (i) {
        var fn = k[i];
        var _a = r[fn], file = _a[0], p = _a[1];
        var c = crc(), size = file.length;
        c.p(file);
        var f = strToU8(fn), s = f.length;
        var com = p.comment, m = com && strToU8(com), ms = m && m.length;
        var exl = exfl(p.extra);
        var compression = p.level == 0 ? 0 : 8;
        var cbl = function (e, d) {
            if (e) {
                tAll();
                cbd(e, null);
            }
            else {
                var l = d.length;
                files[i] = mrg(p, {
                    size: size,
                    crc: c.d(),
                    c: d,
                    f: f,
                    m: m,
                    u: s != fn.length || (m && (com.length != ms)),
                    compression: compression
                });
                o += 30 + s + exl + l;
                tot += 76 + 2 * (s + exl) + (ms || 0) + l;
                if (!--lft)
                    cbf();
            }
        };
        if (s > 65535)
            cbl(err(11, 0, 1), null);
        if (!compression)
            cbl(null, file);
        else if (size < 160000) {
            try {
                cbl(null, deflateSync(file, p));
            }
            catch (e) {
                cbl(e, null);
            }
        }
        else
            term.push(deflate(file, p, cbl));
    };
    // Cannot use lft because it can decrease
    for (var i = 0; i < slft; ++i) {
        _loop_1(i);
    }
    return tAll;
}
/**
 * Synchronously creates a ZIP file. Prefer using `zip` for better performance
 * with more than one file.
 * @param data The directory structure for the ZIP archive
 * @param opts The main options, merged with per-file options
 * @returns The generated ZIP archive
 */
function zipSync(data, opts) {
    if (!opts)
        opts = {};
    var r = {};
    var files = [];
    fltn(data, '', r, opts);
    var o = 0;
    var tot = 0;
    for (var fn in r) {
        var _a = r[fn], file = _a[0], p = _a[1];
        var compression = p.level == 0 ? 0 : 8;
        var f = strToU8(fn), s = f.length;
        var com = p.comment, m = com && strToU8(com), ms = m && m.length;
        var exl = exfl(p.extra);
        if (s > 65535)
            err(11);
        var d = compression ? deflateSync(file, p) : file, l = d.length;
        var c = crc();
        c.p(file);
        files.push(mrg(p, {
            size: file.length,
            crc: c.d(),
            c: d,
            f: f,
            m: m,
            u: s != fn.length || (m && (com.length != ms)),
            o: o,
            compression: compression
        }));
        o += 30 + s + exl + l;
        tot += 76 + 2 * (s + exl) + (ms || 0) + l;
    }
    var out = new u8(tot + 22), oe = o, cdl = tot - o;
    for (var i = 0; i < files.length; ++i) {
        var f = files[i];
        wzh(out, f.o, f, f.f, f.u, f.c.length);
        var badd = 30 + f.f.length + exfl(f.extra);
        out.set(f.c, f.o + badd);
        wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
    }
    wzf(out, o, files.length, cdl, oe);
    return out;
}
/**
 * Streaming pass-through decompression for ZIP archives
 */
var UnzipPassThrough = /*#__PURE__*/ (function () {
    function UnzipPassThrough() {
    }
    UnzipPassThrough.prototype.push = function (chunk, final) {
        // same as ZipPassThrough: cast to retain Buffer ergonomics
        this.ondata(null, chunk, final);
    };
    UnzipPassThrough.compression = 0;
    return UnzipPassThrough;
}());
/**
 * Streaming DEFLATE decompression for ZIP archives. Prefer AsyncZipInflate for
 * better performance.
 */
var UnzipInflate = /*#__PURE__*/ (function () {
    /**
     * Creates a DEFLATE decompression that can be used in ZIP archives
     */
    function UnzipInflate() {
        var _this = this;
        this.i = new Inflate(function (dat, final) {
            _this.ondata(null, dat, final);
        });
    }
    UnzipInflate.prototype.push = function (chunk, final) {
        try {
            this.i.push(chunk, final);
        }
        catch (e) {
            this.ondata(e, null, final);
        }
    };
    UnzipInflate.compression = 8;
    return UnzipInflate;
}());
/**
 * Asynchronous streaming DEFLATE decompression for ZIP archives
 */
var AsyncUnzipInflate = /*#__PURE__*/ (function () {
    /**
     * Creates a DEFLATE decompression that can be used in ZIP archives
     */
    function AsyncUnzipInflate(_, sz) {
        var _this = this;
        if (sz < 320000) {
            this.i = new Inflate(function (dat, final) {
                _this.ondata(null, dat, final);
            });
        }
        else {
            this.i = new AsyncInflate(function (err, dat, final) {
                _this.ondata(err, dat, final);
            });
            this.terminate = this.i.terminate;
        }
    }
    AsyncUnzipInflate.prototype.push = function (chunk, final) {
        if (this.i.terminate)
            chunk = slc(chunk, 0);
        this.i.push(chunk, final);
    };
    AsyncUnzipInflate.compression = 8;
    return AsyncUnzipInflate;
}());
/**
 * A ZIP archive decompression stream that emits files as they are discovered
 */
var Unzip = /*#__PURE__*/ (function () {
    /**
     * Creates a ZIP decompression stream
     * @param cb The callback to call whenever a file in the ZIP archive is found
     */
    function Unzip(cb) {
        this.onfile = cb;
        this.k = [];
        this.o = {
            0: UnzipPassThrough
        };
        this.p = et;
    }
    /**
     * Pushes a chunk to be unzipped
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Unzip.prototype.push = function (chunk, final) {
        var _this = this;
        if (!this.onfile)
            err(5);
        if (!this.p)
            err(4);
        if (this.c > 0) {
            var len = Math.min(this.c, chunk.length);
            var toAdd = chunk.subarray(0, len);
            this.c -= len;
            if (this.d)
                this.d.push(toAdd, !this.c);
            else
                this.k[0].push(toAdd);
            chunk = chunk.subarray(len);
            if (chunk.length)
                return this.push(chunk, final);
        }
        else {
            var f = 0, i = 0, is = void 0, buf = void 0;
            if (!this.p.length)
                buf = chunk;
            else if (!chunk.length)
                buf = this.p;
            else {
                buf = new u8(this.p.length + chunk.length);
                buf.set(this.p), buf.set(chunk, this.p.length);
            }
            var l = buf.length, oc = this.c, add = oc && this.d;
            var _loop_2 = function () {
                var sig = b4(buf, i);
                if (sig == 0x4034B50) {
                    f = 1, is = i;
                    this_1.d = null;
                    this_1.c = 0;
                    var bf = b2(buf, i + 6), cmp_1 = b2(buf, i + 8), u = bf & 2048, dd = bf & 8, fnl = b2(buf, i + 26), es = b2(buf, i + 28);
                    if (l > i + 30 + fnl + es) {
                        var chks_3 = [];
                        this_1.k.unshift(chks_3);
                        f = 2;
                        var lsc = b4(buf, i + 18), lsu = b4(buf, i + 22);
                        var fn_1 = strFromU8(buf.subarray(i + 30, i += 30 + fnl), !u);
                        var _a = z64hs(buf, i, es, 2, lsc, lsu, 0), sc_1 = _a[0], su_1 = _a[1], z64 = _a[3];
                        if (dd)
                            sc_1 = -1 - z64;
                        i += es;
                        this_1.c = sc_1;
                        var d_1;
                        var file_1 = {
                            name: fn_1,
                            compression: cmp_1,
                            start: function () {
                                if (!file_1.ondata)
                                    err(5);
                                if (!sc_1)
                                    file_1.ondata(null, et, true);
                                else {
                                    var ctr = _this.o[cmp_1];
                                    if (!ctr)
                                        file_1.ondata(err(14, 'unknown compression type ' + cmp_1, 1), null, false);
                                    d_1 = sc_1 < 0 ? new ctr(fn_1) : new ctr(fn_1, sc_1, su_1);
                                    d_1.ondata = function (err, dat, final) { file_1.ondata(err, dat, final); };
                                    for (var _i = 0, chks_4 = chks_3; _i < chks_4.length; _i++) {
                                        var dat = chks_4[_i];
                                        d_1.push(dat, false);
                                    }
                                    if (_this.k[0] == chks_3 && _this.c)
                                        _this.d = d_1;
                                    else
                                        d_1.push(et, true);
                                }
                            },
                            terminate: function () {
                                if (d_1 && d_1.terminate)
                                    d_1.terminate();
                            }
                        };
                        if (sc_1 >= 0)
                            file_1.size = sc_1, file_1.originalSize = su_1;
                        this_1.onfile(file_1);
                    }
                    return "break";
                }
                else if (oc) {
                    if (sig == 0x8074B50) {
                        is = i += 12 + (oc == -2 && 8), f = 3, this_1.c = 0;
                        return "break";
                    }
                    else if (sig == 0x2014B50) {
                        is = i -= 4, f = 3, this_1.c = 0;
                        return "break";
                    }
                }
            };
            var this_1 = this;
            for (; i < l - 4; ++i) {
                var state_1 = _loop_2();
                if (state_1 === "break")
                    break;
            }
            this.p = et;
            if (oc < 0) {
                var dat = f ? buf.subarray(0, is - 12 - (oc == -2 && 8) - (b4(buf, is - 16) == 0x8074B50 && 4)) : buf.subarray(0, i);
                if (add)
                    add.push(dat, !!f);
                else
                    this.k[+(f == 2)].push(dat);
            }
            if (f & 2)
                return this.push(buf.subarray(i), final);
            this.p = buf.subarray(i);
        }
        if (final) {
            if (this.c)
                err(13);
            this.p = null;
        }
    };
    /**
     * Registers a decoder with the stream, allowing for files compressed with
     * the compression type provided to be expanded correctly
     * @param decoder The decoder constructor
     */
    Unzip.prototype.register = function (decoder) {
        this.o[decoder.compression] = decoder;
    };
    return Unzip;
}());
var mt = typeof queueMicrotask == 'function' ? queueMicrotask : typeof setTimeout == 'function' ? setTimeout : function (fn) { fn(); };
function unzip(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    var term = [];
    var tAll = function () {
        for (var i = 0; i < term.length; ++i)
            term[i]();
    };
    var files = {};
    var cbd = function (a, b) {
        mt(function () { cb(a, b); });
    };
    mt(function () { cbd = cb; });
    var e = data.length - 22;
    for (; b4(data, e) != 0x6054B50; --e) {
        if (!e || data.length - e > 65558) {
            cbd(err(13, 0, 1), null);
            return tAll;
        }
    }
    ;
    var lft = b2(data, e + 8);
    if (lft) {
        var c = lft;
        var o = b4(data, e + 16);
        var z = b4(data, e - 20) == 0x7064B50;
        if (z) {
            var ze = b4(data, e - 12);
            z = b4(data, ze) == 0x6064B50;
            if (z) {
                c = lft = b4(data, ze + 32);
                o = b4(data, ze + 48);
            }
        }
        var fltr = opts && opts.filter;
        var _loop_3 = function (i) {
            var _a = zh(data, o, z), c_1 = _a[0], sc = _a[1], su = _a[2], fn = _a[3], no = _a[4], off = _a[5], b = slzh(data, off);
            o = no;
            var cbl = function (e, d) {
                if (e) {
                    tAll();
                    cbd(e, null);
                }
                else {
                    if (d)
                        files[fn] = d;
                    if (!--lft)
                        cbd(null, files);
                }
            };
            if (!fltr || fltr({
                name: fn,
                size: sc,
                originalSize: su,
                compression: c_1
            })) {
                if (!c_1)
                    cbl(null, slc(data, b, b + sc));
                else if (c_1 == 8) {
                    var infl = data.subarray(b, b + sc);
                    // Synchronously decompress under 512KB, or barely-compressed data
                    if (su < 524288 || sc > 0.8 * su) {
                        try {
                            cbl(null, inflateSync(infl, { out: new u8(su) }));
                        }
                        catch (e) {
                            cbl(e, null);
                        }
                    }
                    else
                        term.push(inflate(infl, { size: su }, cbl));
                }
                else
                    cbl(err(14, 'unknown compression type ' + c_1, 1), null);
            }
            else
                cbl(null, null);
        };
        for (var i = 0; i < c; ++i) {
            _loop_3(i);
        }
    }
    else
        cbd(null, {});
    return tAll;
}
/**
 * Synchronously decompresses a ZIP archive. Prefer using `unzip` for better
 * performance with more than one file.
 * @param data The raw compressed ZIP file
 * @param opts The ZIP extraction options
 * @returns The decompressed files
 */
function unzipSync(data, opts) {
    var files = {};
    var e = data.length - 22;
    for (; b4(data, e) != 0x6054B50; --e) {
        if (!e || data.length - e > 65558)
            err(13);
    }
    ;
    var c = b2(data, e + 8);
    if (!c)
        return {};
    var o = b4(data, e + 16);
    var z = b4(data, e - 20) == 0x7064B50;
    if (z) {
        var ze = b4(data, e - 12);
        z = b4(data, ze) == 0x6064B50;
        if (z) {
            c = b4(data, ze + 32);
            o = b4(data, ze + 48);
        }
    }
    var fltr = opts && opts.filter;
    for (var i = 0; i < c; ++i) {
        var _a = zh(data, o, z), c_2 = _a[0], sc = _a[1], su = _a[2], fn = _a[3], no = _a[4], off = _a[5], b = slzh(data, off);
        o = no;
        if (!fltr || fltr({
            name: fn,
            size: sc,
            originalSize: su,
            compression: c_2
        })) {
            if (!c_2)
                files[fn] = slc(data, b, b + sc);
            else if (c_2 == 8)
                files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
            else
                err(14, 'unknown compression type ' + c_2);
        }
    }
    return files;
}


/**
 * Lista FORMATO PEDIDO LIFE en PDF (texto embebido, típicamente export del Excel).
 * Extrae strings de streams FlateDecode y reconstruye filas nombre/talla/número.
 * PDF solo-imagen → needs_ocr (ask_about_file / visión).
 */

function trimPdfStreamTail(u8) {
  // PDF often appends \n or \r\n after Flate bytes and before endstream.
  let end = u8.length;
  while (end > 0 && (u8[end - 1] === 0x0a || u8[end - 1] === 0x0d || u8[end - 1] === 0x20)) {
    end -= 1;
  }
  return end === u8.length ? u8 : u8.subarray(0, end);
}

/**
 * Binary ↔ string without TextDecoder("latin1").
 * In CF Workers / Kapso, "latin1" is windows-1252 and remaps 0x80–0x9F
 * (e.g. 0x9C → U+0153 → &0xff = 83), which corrupts PDF Flate streams.
 */
function bytesToBinaryString(u8) {
  const CHUNK = 0x8000;
  let out = "";
  for (let i = 0; i < u8.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CHUNK, u8.length)));
  }
  return out;
}

function binaryStringToBytes(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function inflateWithFflate(u8) {
  const input = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  const trimmed = trimPdfStreamTail(input);
  let lastErr = null;
  for (const buf of [trimmed, input]) {
    try {
      return { ok: true, bytes: unzlibSync(buf) };
    } catch (e) {
      lastErr = e;
    }
    try {
      return { ok: true, bytes: inflateSync(buf) };
    } catch (e) {
      lastErr = e;
    }
    if (buf.length > 6 && buf[0] === 0x78) {
      try {
        return { ok: true, bytes: inflateSync(buf.subarray(2)) };
      } catch (e) {
        lastErr = e;
      }
    }
  }
  return { ok: false, error: String(lastErr?.message || lastErr || "fflate_fail").slice(0, 120) };
}

async function tryDecompressionStream(u8, format) {
  const ds = new DecompressionStream(format);
  const stream = new Blob([u8]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateBytes(raw) {
  const input = raw instanceof Uint8Array ? raw : new Uint8Array(raw);

  // Pure JS (works in Kapso CF Workers + Node) — preferred
  const viaFflate = inflateWithFflate(input);
  if (viaFflate.ok) return viaFflate.bytes;

  // Prefer Node zlib only on real Node
  const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);
  if (isNode) {
    try {
      const zlib = await import("node:zlib");
      const trimmed = trimPdfStreamTail(input);
      for (const buf of [trimmed, input]) {
        try {
          return zlib.inflateSync(buf);
        } catch {
          try {
            return zlib.inflateRawSync(buf);
          } catch {
            /* next */
          }
        }
      }
    } catch {
      /* fall through */
    }
  }

  // Fallback: DecompressionStream (trim trailing PDF EOL)
  if (typeof DecompressionStream !== "undefined") {
    const trimmed = trimPdfStreamTail(input);
    const candidates = [];
    for (const buf of [trimmed, input]) {
      candidates.push(["deflate", buf]);
      if (buf.length > 6 && buf[0] === 0x78) {
        candidates.push(["deflate-raw", buf.subarray(2)]);
        candidates.push(["deflate-raw", buf.subarray(2, buf.length - 4)]);
      } else {
        candidates.push(["deflate-raw", buf]);
      }
    }
    for (const [format, buf] of candidates) {
      try {
        return await tryDecompressionStream(buf, format);
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

function extractLiteralStrings(content) {
  const out = [];
  const reLit = /\((?:\\.|[^\\)])*\)/g;
  let m;
  while ((m = reLit.exec(content))) {
    let s = m[0]
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (s) out.push(s);
  }
  return out;
}

/** Une fragmentos PDF tipo S|AR|A → SARA */
async function extractPdfEmbeddedText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const latin = bytesToBinaryString(u8);
  const frags = [];
  const reStream = /stream\r?\n([\s\S]*?)endstream/g;
  let sm;
  let streamsFound = 0;
  let inflateOk = 0;
  let firstInflateErr = null;
  let firstHead = null;
  while ((sm = reStream.exec(latin))) {
    streamsFound += 1;
    const raw = binaryStringToBytes(sm[1]);
    if (!firstHead) firstHead = Array.from(raw.slice(0, 4));
    const inflated = await inflateBytes(raw);
    if (!inflated) {
      if (!firstInflateErr) {
        const via = inflateWithFflate(raw);
        firstInflateErr = via.error || "inflate_null";
      }
      continue;
    }
    inflateOk += 1;
    const content = bytesToBinaryString(
      inflated instanceof Uint8Array ? inflated : new Uint8Array(inflated)
    );
    // Fuentes / binario: suelen tener NUL; el contenido de página tiene Tj/TJ + literales.
    if (content.includes("\u0000") && !/\(NOMBRE|\(TALLA|\(Camiseta|\([A-ZÁÉÍÓÚÑ]{3,}/.test(content)) {
      continue;
    }
    if (!/\bTj\b|\bTJ\b/.test(content)) continue;
    const lits = extractLiteralStrings(content);
    if (lits.length < 8) continue;
    frags.push(...lits);
  }
  const joined = frags.join("");
  const hasUsefulText =
    /NOMBRE|TALLA|UNIFORME|Camiseta|BALONCESTO|FUTBOL/i.test(joined) &&
    /\d[A-ZÁÉÍÓÚÑ]/i.test(joined);
  return {
    joined,
    fragmentCount: frags.length,
    hasUsefulText,
    debug: {
      streamsFound,
      inflateOk,
      firstInflateErr,
      firstHead,
      typeofUnzlib: typeof unzlibSync,
      typeofInflate: typeof inflateSync,
      hasBuffer: typeof Buffer !== "undefined",
      hasDS: typeof DecompressionStream !== "undefined",
    },
  };
}

function splitNameTallaNumero(mid) {
  const s = compact(mid);
  if (!s) return null;

  // 14 (S) / 12 (M)
  let m = s.match(/^(.*?)(\d{1,2}\s*\([A-Za-z]+\))(\d{1,3})$/);
  if (m && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(m[1])) {
    return {
      nombre: compact(m[1]),
      talla: compact(m[2]).toUpperCase().replace(/\s+/g, ""),
      numero: m[3],
    };
  }

  // Letter sizes (XL before L/S)
  m = s.match(/^(.*?)(2XL|3XL|4XL|XL|XS|S|M|L)(\d{1,3})$/i);
  if (m && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(m[1])) {
    return {
      nombre: compact(m[1]),
      talla: m[2].toUpperCase(),
      numero: m[3],
    };
  }

  // Numeric talla 2 digits + dorsal
  m = s.match(/^(.*[A-Za-zÁÉÍÓÚÑáéíóúñ.])(\d{2})(\d{1,3})$/);
  if (m) {
    return { nombre: compact(m[1]), talla: m[2], numero: m[3] };
  }

  // Numeric talla 1 digit
  m = s.match(/^(.*[A-Za-zÁÉÍÓÚÑáéíóúñ.])(\d)(\d{1,3})$/);
  if (m) {
    return { nombre: compact(m[1]), talla: m[2], numero: m[3] };
  }

  return null;
}

/**
 * Parsea texto reconstruido FORMATO PEDIDO LIFE (PDF export).
 * @returns {{ ok: boolean, rows: object[], layout: string, meta: object, message?: string }}
 */
function parseFormatoLifePdfText(joinedText) {
  const joined = String(joinedText || "");
  if (!joined || joined.length < 40) {
    return {
      ok: false,
      rows: [],
      layout: "pdf_empty",
      meta: {},
      error: "no_text",
      message: "PDF sin texto útil; usar ask_about_file (visión/OCR).",
    };
  }

  const disciplinaMatch = joined.match(
    /\b(BALONCESTO|FUTBOL|FÚTBOL|VOLEIBOL|VOLEY|ATLETISMO)\b/i
  );
  const disciplina = disciplinaMatch ? disciplinaMatch[1].toUpperCase() : null;
  const mediaColor = /\bBLANCO\b/i.test(joined)
    ? "BLANCO"
    : /\bNEGRO\b/i.test(joined)
      ? "NEGRO"
      : null;

  const camisetaIdx = joined.search(/Camiseta/i);
  const body =
    camisetaIdx >= 0 ? joined.slice(camisetaIdx + "Camiseta".length) : joined;
  // Cortar cola de género / arquero headers
  const cut = body.search(/GENERO|Uniforme\s*ARQUERO|COMENTARIO/i);
  const playerZone = cut > 0 ? body.slice(0, cut) : body;

  const rowRe = /(\d{1,2})([\s\S]*?)ESQUELETO\s*X/gi;
  const rows = [];
  let m;
  while ((m = rowRe.exec(playerZone))) {
    const idx = m[1];
    const mid = m[2];
    const split = splitNameTallaNumero(mid);
    if (!split?.nombre) continue;
    const camiseta = true; // columna Camiseta marcada con X en este layout
    rows.push(
      toDetailRow({
        nombre_uniforme: split.nombre,
        talla: split.talla,
        numero: split.numero,
        grupo: null,
        camiseta,
        uniforme: !camiseta,
        comentario: [
          "ESQUELETO",
          disciplina ? `disciplina ${disciplina}` : null,
          mediaColor ? `media ${mediaColor}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        product_text: camiseta
          ? "Camiseta deportiva dry-fit"
          : disciplina
            ? `Uniforme de ${disciplina}`
            : "Uniforme",
        category: camiseta ? "camiseta" : "uniforme",
        garment_type: camiseta ? "camiseta" : "uniforme",
        raw_text: `${idx} ${split.nombre} ${split.talla} ${split.numero}`,
      })
    );
  }

  // Fallback: filas sin token ESQUELETO (otros exports)
  if (!rows.length) {
    const altRe =
      /(\d{1,2})([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-z0-9. ]{1,40}?)(?=\d{1,2}[A-ZÁÉÍÓÚÑ]|$)/g;
    // too loose — skip
  }

  if (!rows.length) {
    return {
      ok: false,
      rows: [],
      layout: "pdf_unparsed",
      meta: { disciplina, mediaColor },
      error: "formato_no_reconocido",
      message:
        "PDF con texto pero no FORMATO LIFE reconocible. Usar ask_about_file o Excel.",
    };
  }

  return {
    ok: true,
    rows,
    layout: "formato_life_pdf_v1",
    meta: {
      disciplina,
      media_color: mediaColor,
      print_style: "ESQUELETO",
      source: "pdf_embedded_text",
    },
    sheetName: "PDF",
  };
}

/**
 * @param {Uint8Array} bytes
 * @param {string} filename
 */
async function parseLifePdfListBytes(bytes, filename = "lista.pdf") {
  const name = compact(filename) || "lista.pdf";
  if (!/\.pdf$/i.test(name) && bytes?.[0] !== 0x25) {
    // %PDF
    const head = new TextDecoder("latin1").decode(bytes.slice(0, 5));
    if (head !== "%PDF-") {
      return {
        ok: false,
        rows: [],
        error: "not_pdf",
        message: "El archivo no es PDF.",
      };
    }
  }

  const extracted = await extractPdfEmbeddedText(bytes);
  if (!extracted.hasUsefulText) {
    return {
      ok: false,
      rows: [],
      layout: "pdf_image_only",
      error: "needs_ocr",
      needs_ocr: true,
      message:
        "PDF sin capa de texto (solo imagen). En staff: ask_about_file con la pregunta fija de lista, luego parsear_lista_pdf_pedido / imagen.",
      fragmentCount: extracted.fragmentCount,
      extract_debug: extracted.debug || null,
    };
  }

  const parsed = parseFormatoLifePdfText(extracted.joined);
  return {
    ...parsed,
    filename: name,
    fragmentCount: extracted.fragmentCount,
  };
}

const FIXED_PDF_LIST_QUESTION =
  "Este archivo es una lista de pedido Life (FORMATO PEDIDO LIFE en PDF). Extrae SOLO un JSON array de objetos con keys: numero, nombre, talla, manga, genero (masculino|femenino), arquero (true|false). Incluye todas las filas. Sin markdown ni texto extra.";


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
  const showManga = rows.some((r) => compact(r.manga));
  const hasExtra = rows.some(
    (r) => compact(r.nombre_completo) || (r.impresion_trasera && !r.nombre_completo)
  );

  const formatMangaVal = (m) => {
    const v = compact(m).toUpperCase();
    if (v === "C" || v.includes("CORTA")) return "Corta";
    if (v === "L" || v.includes("LARGA")) return "Larga";
    if (v === "S" || v.includes("SISA")) return "Sisa";
    return v || "Corta";
  };

  const body = rows
    .map((row, idx) => {
      const bg = idx % 2 ? ' style="background-color:#f9f9f9;"' : "";
      const mangaCell = showManga
        ? `<td style="text-align:center; padding: 8px;">${escapeHtml(formatMangaVal(row.manga))}</td>`
        : "";
      const qtyCell = showQty
        ? `<td style="text-align:center; padding: 8px;">${escapeHtml(String(row.cantidad || 1))}</td>`
        : "";
      const productCell = showProduct
        ? `<td style="padding: 8px;">${escapeHtml(row.rol_variante || "—")}</td>`
        : "";
      const commentCell = hasComment
        ? `<td style="padding: 8px;">${escapeHtml(compact(row.comentario) || "")}</td>`
        : "";
      const extraCell = hasExtra
        ? `<td style="padding: 8px;">${escapeHtml(compact(row.nombre_completo || row.impresion_trasera) || "")}</td>`
        : "";
      return `<tr${bg}><td style="text-align:center; padding: 8px;">${escapeHtml(row.numero || "—")}</td><td style="padding: 8px;">${escapeHtml(row.nombre || "—")}</td><td style="text-align:center; padding: 8px;">${escapeHtml(row.talla || "—")}</td>${mangaCell}${qtyCell}${productCell}${commentCell}${extraCell}</tr>`;
    })
    .join("\n    ");

  const mangaHead = showManga
    ? `<th style="text-align:center; padding: 8px;">Manga</th>`
    : "";
  const qtyHead = showQty
    ? `<th style="text-align:center; padding: 8px;">Cant.</th>`
    : "";
  const productHead = showProduct
    ? `<th style="text-align:left; padding: 8px;">${escapeHtml(colProduct)}</th>`
    : "";
  const commentHead = hasComment
    ? `<th style="text-align:left; padding: 8px;">Comentario</th>`
    : "";
  const extraHead = hasExtra
    ? `<th style="text-align:left; padding: 8px;">Nombre completo / Registro</th>`
    : "";

  return `<h2>${escapeHtml(title)}</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      ${mangaHead}
      ${qtyHead}
      ${productHead}
      ${commentHead}
      ${extraHead}
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
  const title = stripOppPrefix(compact(opts.title) || "Pedido") || "Pedido";
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
    stripOppPrefix(
      compact(orderDraft.title) ||
        compact(draftPayload.order_or_team_name_for_billing) ||
        compact(vars.quote?.order_or_team_name_for_billing) ||
        compact(vars.quote?.customer_display_name) ||
        compact(vars.lead?.name) ||
        compact(vars.crm?.opportunity_name) ||
        ""
    ) || "Pedido";

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
 * Tras Proposition→SO: crear/actualizar líneas comerciales del presupuesto.
 * Fuentes (prioridad):
 *  1) filas parseadas del Excel/lista
 *  2) brief CRM / note (LIFE_DOSSIER qty, «Uniforme × N»)
 *  3) expected_revenue + producto por defecto (uniforme) si solo hay monto
 *
 * Nunca toca la línea Diseño (LIFE_DESIGN_PRODUCT_ID).
 */

function designId(env = {}) {
  return Number(env.LIFE_DESIGN_PRODUCT_ID || 504) || 504;
}

function rowUnitQty(row = {}) {
  return Math.max(1, Number(row.cantidad || row.quantity || row.qty || 1) || 1);
}

/** Extrae estimado { product_text, quantity } desde HTML/texto CRM o note. */
function parseEstimateFromBrief(htmlOrText = "") {
  const text = String(htmlOrText || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

  const candidates = [];
  const dossierQty = text.match(/^\s*qty\s*:\s*(\d{1,4})\b/im);
  const dossierProduct = text.match(
    /^\s*-\s*(.+?)\s*x\s*(\d{1,4})\s*:/im
  );
  if (dossierProduct) {
    candidates.push({
      product_text: compact(dossierProduct[1]),
      quantity: Number(dossierProduct[2]),
      source: "dossier_line",
    });
  } else if (dossierQty) {
    const prod =
      text.match(/Uniforme de [^\n<]+/i)?.[0] ||
      text.match(/Camiseta[^\n<]{0,40}/i)?.[0] ||
      "Uniforme de Fútbol";
    candidates.push({
      product_text: compact(prod),
      quantity: Number(dossierQty[1]),
      source: "dossier_qty",
    });
  }

  const bullet = text.match(
    /(Uniforme[^\n×x]{0,40}|Camiseta[^\n×x]{0,40})\s*[×x]\s*(\d{1,4})/i
  );
  if (bullet) {
    candidates.push({
      product_text: compact(bullet[1]),
      quantity: Number(bullet[2]),
      source: "brief_bullet",
    });
  }

  const units = text.match(
    /(\d{1,4})\s*(?:u(?:nidades?)?)?\s*(uniformes?(?:\s+de\s+\w+)?|camisetas?)/i
  );
  if (units) {
    const kind = units[2];
    candidates.push({
      product_text: /camiseta/i.test(kind)
        ? "Camiseta deportiva dry-fit"
        : /baloncesto/i.test(kind)
          ? "Uniforme de baloncesto"
          : "Uniforme de Fútbol",
      quantity: Number(units[1]),
      source: "brief_units",
    });
  }

  // Prefer highest quantity with a product name
  candidates.sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0));
  const best = candidates.find((c) => c.quantity >= 1 && c.product_text);
  return best || null;
}

function commercialLinesFromDetailRows(rows = []) {
  const inferred = inferCommercialLinesFromDetailRows(rows || []);
  if (inferred.length) {
    return inferred.map((l) => ({
      product_text: l.product_text || l.name,
      quantity: Math.max(1, Number(l.quantity || 0) || 1),
      category: l.category || null,
      source: "list_detail",
    }));
  }
  // Fallback: count units even if product flags were weak
  const qty = (rows || []).reduce((s, r) => s + rowUnitQty(r), 0);
  if (!qty) return [];
  let camiseta = 0;
  let uniforme = 0;
  for (const r of rows) {
    const q = rowUnitQty(r);
    if (r.camiseta && !r.uniforme) camiseta += q;
    else if (r.uniforme === true) uniforme += q;
    else if (/camiseta/i.test(String(r.product_text || r.rol || ""))) camiseta += q;
    else uniforme += q;
  }
  if (camiseta >= uniforme && camiseta > 0) {
    return [
      {
        product_text: "Camiseta deportiva dry-fit",
        quantity: camiseta,
        category: "camiseta",
        source: "list_detail_flags",
      },
    ];
  }
  return [
    {
      product_text: "Uniforme de Fútbol",
      quantity: uniforme || qty,
      category: "uniforme",
      source: "list_detail_flags",
    },
  ];
}

async function resolveProductByText(executeKw, productText) {
  const needle = compact(productText);
  if (!needle) return null;
  const terms = [];
  if (/baloncesto/i.test(needle)) terms.push("Uniforme de baloncesto");
  if (/camiseta/i.test(needle)) terms.push("Camiseta deportiva");
  if (/uniforme/i.test(needle) && /f[uú]tbol|dry/i.test(needle)) {
    terms.push("Uniforme de Fútbol");
  }
  if (/chaqueta|rompe/i.test(needle)) terms.push("Chaqueta");
  terms.push(needle.split(/\s+/).slice(0, 3).join(" "));

  for (const term of [...new Set(terms.filter(Boolean))]) {
    const rows =
      (await executeKw(
        "product.product",
        "search_read",
        [[["sale_ok", "=", true], ["name", "ilike", term]]],
        { fields: ["id", "name", "list_price"], limit: 8 }
      )) || [];
    if (!rows.length) continue;
    if (/baloncesto/i.test(needle)) {
      const hit = rows.find((p) => /baloncesto/i.test(p.name));
      if (hit) return hit;
    }
    if (/camiseta/i.test(needle)) {
      const hit = rows.find((p) => /camiseta/i.test(p.name) && !/uniforme/i.test(p.name));
      if (hit) return hit;
    }
    if (/uniforme/i.test(needle)) {
      const hit = rows.find((p) => /uniforme/i.test(p.name));
      if (hit) return hit;
    }
    return rows[0];
  }
  return null;
}

/**
 * @param {{ executeKw: Function }} odoo
 * @param {{
 *   orderId: number,
 *   leadId?: number,
 *   detailRows?: array,
 *   designProductId?: number,
 *   env?: object,
 * }} opts
 */
async function ensureSoCommercialLines(odoo, opts = {}) {
  const orderId = Number(opts.orderId || 0);
  if (!orderId) return { created: [], updated: [], skipped: true, reason: "no_order_id" };

  const { executeKw } = odoo;
  const designProductId = Number(opts.designProductId || designId(opts.env || {}));

  const existing =
    (await executeKw(
      "sale.order.line",
      "search_read",
      [[["order_id", "=", orderId]]],
      { fields: ["id", "product_id", "product_uom_qty", "price_unit", "name"], limit: 80 }
    )) || [];

  const hasCommercial = existing.some((l) => {
    const pid = Number(Array.isArray(l.product_id) ? l.product_id[0] : l.product_id) || 0;
    return pid && pid !== designProductId && Number(l.product_uom_qty || 0) > 0;
  });

  let wanted = commercialLinesFromDetailRows(opts.detailRows || []);

  if (!wanted.length) {
    // CRM / note brief
    let brief = "";
    if (opts.leadId) {
      const leads = await executeKw(
        "crm.lead",
        "read",
        [[opts.leadId]],
        { fields: ["description", "expected_revenue", "name"] }
      );
      brief = leads?.[0]?.description || "";
      const est = parseEstimateFromBrief(brief);
      if (est) wanted = [{ ...est, category: /camiseta/i.test(est.product_text) ? "camiseta" : "uniforme" }];
      // If only revenue and no qty text, skip inventing qty
    }
    if (!wanted.length) {
      const orders = await executeKw(
        "sale.order",
        "read",
        [[orderId]],
        { fields: ["note"] }
      );
      const est = parseEstimateFromBrief(orders?.[0]?.note || "");
      if (est) wanted = [{ ...est, category: /camiseta/i.test(est.product_text) ? "camiseta" : "uniforme" }];
    }
  }

  if (!wanted.length) {
    return {
      created: [],
      updated: [],
      skipped: true,
      reason: hasCommercial ? "already_has_commercial" : "no_estimate_or_lista",
      existing_commercial: hasCommercial,
    };
  }

  const created = [];
  const updated = [];

  for (const line of wanted) {
    const qty = Math.max(1, Number(line.quantity || 0) || 1);
    const product = await resolveProductByText(executeKw, line.product_text);
    if (!product?.id) {
      created.push({
        error: "product_not_found",
        product_text: line.product_text,
        quantity: qty,
        source: line.source,
      });
      continue;
    }
    if (product.id === designProductId) continue;

    const match = existing.find(
      (l) => Number(Array.isArray(l.product_id) ? l.product_id[0] : l.product_id) === product.id
    );
    if (match) {
      const cur = Number(match.product_uom_qty || 0);
      if (cur !== qty) {
        await executeKw("sale.order.line", "write", [
          [match.id],
          { product_uom_qty: qty },
        ]);
        updated.push({
          line_id: match.id,
          product_id: product.id,
          from: cur,
          to: qty,
          source: line.source,
        });
      } else {
        updated.push({
          line_id: match.id,
          product_id: product.id,
          matched: true,
          qty,
          source: line.source,
        });
      }
      continue;
    }

    // If SO already has another commercial product and this is estimate fallback, still add
    const lineId = await executeKw("sale.order.line", "create", [
      {
        order_id: orderId,
        product_id: product.id,
        product_uom_qty: qty,
        price_unit: Number(line.unit_cop || product.list_price || 0) || 0,
        name: compact(line.product_text) || product.name,
      },
    ]);
    created.push({
      line_id: lineId,
      product_id: product.id,
      quantity: qty,
      product_name: product.name,
      source: line.source,
    });
  }

  return {
    created,
    updated,
    skipped: false,
    reason: "ok",
    wanted,
  };
}


/**
 * Desde adjuntos de sale.order: si hay Excel/Word lista → organizar datos → note SO.
 * Nunca escribe lista en crm.lead.description. Teléfono no va en note.
 */

function stripPhoneFromHtml(html) {
  return String(html || "")
    .replace(/^\s*telefono\s*:.*$/gim, "")
    .replace(/<p[^>]*>\s*<b>\s*Tel[eé]fono\s*:?\s*<\/b>\s*[^<]*<\/p>/gi, "")
    .replace(/<li>\s*Tel[eé]fono[^<]*<\/li>/gi, "")
    .replace(/\sphone=\d+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function base64ToBytes(b64) {
  const raw = String(b64 || "").replace(/\s+/g, "");
  if (!raw) return new Uint8Array(0);
  // Prefer Buffer (Node / workerd nodejs_compat) — more reliable than atob for large payloads
  if (typeof Buffer !== "undefined") {
    try {
      return new Uint8Array(Buffer.from(raw, "base64"));
    } catch {
      /* fall through */
    }
  }
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isListExcelName(name) {
  return /\.(xlsx|xlsm|xltx|xls|csv)$/i.test(compact(name));
}

function isListWordName(name) {
  return /\.docx$/i.test(compact(name));
}

function isListPdfName(name) {
  return /\.pdf$/i.test(compact(name));
}

function looksLikeListFilename(name) {
  const n = compact(name).toLowerCase();
  if (isListExcelName(n) || isListWordName(n) || isListPdfName(n)) return true;
  return /formato\s*pedido|lista|tallas|jugadores/i.test(n) && /\.(xlsx|xlsm|docx|pdf)$/i.test(n);
}

/** Prioridad: Excel FORMATO LIFE → xlsx → PDF lista → docx. */
function pickListAttachment(attachments = []) {
  const list = (attachments || []).filter((a) => a && compact(a.name));
  const excelLife = list.find(
    (a) => isListExcelName(a.name) && /formato|life|pedido|lista/i.test(a.name)
  );
  if (excelLife) return excelLife;
  const excel = list.find((a) => isListExcelName(a.name));
  if (excel) return excel;
  const pdfLife = list.find(
    (a) => isListPdfName(a.name) && /formato|life|pedido|lista/i.test(a.name || "")
  );
  if (pdfLife) return pdfLife;
  const pdf = list.find((a) => isListPdfName(a.name));
  if (pdf) return pdf;
  const docx = list.find((a) => isListWordName(a.name));
  if (docx) return docx;
  return list.find((a) => looksLikeListFilename(a.name)) || null;
}

function noteAlreadyHasLista(noteHtml) {
  const n = String(noteHtml || "");
  return (
    /<table[\s>]/i.test(n) &&
    (/Lista de jugador/i.test(n) ||
      /espejo Excel/i.test(n) ||
      /Resumen por variante/i.test(n) ||
      /organización de los datos/i.test(n))
  );
}

/**
 * @param {{ executeKw: Function }} odoo
 * @param {{ orderId: number, orderName?: string, title?: string, force?: boolean }} opts
 */
async function applyListaFromSoAttachments(odoo, opts = {}) {
  const orderId = Number(opts.orderId || 0);
  if (!orderId) return { applied: false, reason: "no_order_id" };

  const orders = await odoo.executeKw(
    "sale.order",
    "read",
    [[orderId]],
    {
      fields: [
        "id",
        "name",
        "note",
        "x_studio_nombre_del_pedido",
        "partner_id",
      ],
    }
  );
  const order = orders?.[0];
  if (!order) return { applied: false, reason: "so_missing" };

  const currentNote = String(order.note || "");
  if (!opts.force && noteAlreadyHasLista(currentNote)) {
    return {
      applied: false,
      reason: "lista_already_in_note",
      order_id: orderId,
      order_name: order.name,
    };
  }

  const atts = await odoo.executeKw(
    "ir.attachment",
    "search_read",
    [[["res_model", "=", "sale.order"], ["res_id", "=", orderId]]],
    { fields: ["id", "name", "mimetype", "datas"], limit: 40 }
  );

  const pick = pickListAttachment(atts || []);
  if (!pick) {
    return {
      applied: false,
      reason: "no_list_attachment",
      message: "Sin Excel/Word/PDF de lista en el presupuesto.",
      order_id: orderId,
      order_name: order.name,
      attachment_names: (atts || []).map((a) => a.name),
    };
  }

  if (!pick.datas) {
    const full = await odoo.executeKw(
      "ir.attachment",
      "read",
      [[pick.id]],
      { fields: ["id", "name", "datas"] }
    );
    pick.datas = full?.[0]?.datas;
  }

  const bytes = base64ToBytes(pick.datas);
  if (!bytes.length) {
    return { applied: false, reason: "empty_attachment", filename: pick.name };
  }

  const isPdf = isListPdfName(pick.name) || bytes[0] === 0x25;
  const magic = new TextDecoder("latin1").decode(bytes.slice(0, 8));
  const parsed = isPdf
    ? await parseLifePdfListBytes(bytes, pick.name)
    : await parseListAttachmentBytes(bytes, pick.name);

  if (!parsed.ok || !Array.isArray(parsed.rows) || !parsed.rows.length) {
    return {
      applied: false,
      reason: parsed.error || parsed.needs_ocr ? "needs_ocr" : "organize_failed",
      message:
        parsed.message ||
        (parsed.needs_ocr
          ? "PDF sin texto: en staff usar ask_about_file (visión) y luego organizar la lista."
          : "No se pudo organizar la lista del archivo."),
      filename: pick.name,
      order_id: orderId,
      needs_ocr: Boolean(parsed.needs_ocr),
      debug: {
        build: "pdf-fflate-v2-binarystring",
        bytes_len: bytes.length,
        magic,
        datas_b64_len: String(pick.datas || "").length,
        fragmentCount: parsed.fragmentCount ?? null,
        layout: parsed.layout || null,
        error: parsed.error || null,
        extract: parsed.extract_debug || null,
      },
    };
  }

  const title =
    stripOppPrefix(
      compact(opts.title) ||
        compact(order.x_studio_nombre_del_pedido) ||
        (Array.isArray(order.partner_id) ? compact(order.partner_id[1]) : "") ||
        compact(order.name) ||
        ""
    ) || "Pedido";

  const commercialLines = inferCommercialLinesFromDetailRows(parsed.rows).map((l) => ({
    name: l.product_text || l.name,
    product_text: l.product_text || l.name,
    quantity: l.quantity,
    label: l.product_text || l.name,
  }));

  const noteHtml = stripPhoneFromHtml(
    buildOdooOrderNoteHtml({
      title,
      detailRows: parsed.rows,
      listLayout: parsed.layout || parsed.excel_layout || "",
      mirrorGrid: parsed.grid || parsed.mirror_grid || null,
      sheetName: parsed.sheetName || parsed.sheet_name || "",
      commercialLines,
    })
  );

  await odoo.executeKw("sale.order", "write", [[orderId], { note: noteHtml }]);

  return {
    applied: true,
    reason: "ok",
    order_id: orderId,
    order_name: order.name,
    filename: pick.name,
    rows: parsed.rows.length,
    detail_rows: parsed.rows,
    commercial_lines: commercialLines,
    layout: parsed.layout || null,
  };
}



/**
 * on_odoo_presupuesto — webhook Odoo (CRM stage Proposition → SO).
 *
 * Odoo crea el SO draft (Plantilla venta) y notifica aquí.
 * Esta function: valida secret, enriquece SO (template, Diseño $0),
 * organiza Excel/Word/PDF → sale.order.note, y crea líneas comerciales
 * desde la lista o el estimado CRM (LIFE_DOSSIER / brief).
 * Lista NUNCA va a crm.lead.description. Teléfono solo en campo phone.
 *
 * Auth: Header X-Life-Webhook-Secret | Query ?secret=
 * Secrets: LIFE_ODOO_WEBHOOK_SECRET, ODOO_* , LIFE_DESIGN_PRODUCT_ID, LIFE_SALE_ORDER_TEMPLATE_ID
 * public_endpoint=true
 *
 * Source ESM — deploy via: node kapso/scripts/bundle_on_odoo_presupuesto.js
 */

function extractSecret(request, url) {
  return (
    compact(request.headers.get("x-life-webhook-secret")) ||
    compact(request.headers.get("X-Life-Webhook-Secret")) ||
    compact(url.searchParams.get("secret")) ||
    compact(url.searchParams.get("token"))
  );
}

/** Odoo webhook nativo: {_id, _model, _name, phone, order_ids, ...} o payload custom. */
function normalizePayload(raw) {
  const p = raw?.input || raw || {};
  const leadId = Number(p.lead_id || p._id || p.id || 0) || null;
  let orderIds = [];
  if (Array.isArray(p.order_ids)) {
    orderIds = p.order_ids.map((x) => Number(Array.isArray(x) ? x[0] : x)).filter(Boolean);
  } else if (p.so_id) {
    orderIds = [Number(p.so_id)].filter(Boolean);
  }
  const phone =
    digitsOnly(p.partner_phone || p.phone || p.mobile || "") ||
    digitsOnly(Array.isArray(p.partner_id) ? "" : "");
  const partnerName =
    compact(p.partner_name) ||
    compact(p.contact_name) ||
    (Array.isArray(p.partner_id) ? compact(p.partner_id[1]) : "") ||
    null;
  return {
    event: compact(p.event) || "crm.stage.presupuesto",
    lead_id: leadId,
    so_id: orderIds[0] || (Number(p.so_id) || null),
    so_name: compact(p.so_name) || null,
    order_ids: orderIds,
    partner_phone: phone || null,
    partner_name: partnerName,
    order_summary: compact(p.order_summary || p.name) || null,
    description: p.description || null,
    kapso_conversation_id: compact(p.kapso_conversation_id) || null,
    force_lista: Boolean(p.force_lista || p.force),
    raw_keys: Object.keys(p),
  };
}

async function odooAuthenticate(env) {
  const base = compact(env.ODOO_URL).replace(/\/$/, "");
  const db = compact(env.ODOO_DB);
  const login = compact(env.ODOO_USERNAME);
  const password = String(env.ODOO_PASSWORD || "");
  if (!base || !db || !login || !password) {
    return null;
  }
  const authRes = await fetch(`${base}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "common",
        method: "authenticate",
        args: [db, login, password, {}],
      },
      id: 1,
    }),
  });
  const authJson = await authRes.json();
  const uid = authJson?.result;
  if (!uid) return null;

  async function executeKw(model, method, args = [], kwargs = {}) {
    const res = await fetch(`${base}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "object",
          method: "execute_kw",
          args: [db, uid, password, model, method, args, kwargs],
        },
        id: Date.now(),
      }),
    });
    const json = await res.json();
    if (json.error) {
      throw new Error(json.error?.data?.message || JSON.stringify(json.error));
    }
    return json.result;
  }

  return { uid, executeKw };
}

async function enrichSaleOrder(odoo, payload, env) {
  const designProductId = Number(env.LIFE_DESIGN_PRODUCT_ID || 504);
  const templateId = Number(env.LIFE_SALE_ORDER_TEMPLATE_ID || 1);
  const { executeKw } = odoo;

  let orderId = payload.so_id || null;
  let orderName = payload.so_name || null;

  if (!orderId && payload.lead_id) {
    const found = await executeKw(
      "sale.order",
      "search_read",
      [[["opportunity_id", "=", payload.lead_id], ["state", "in", ["draft", "sent"]]]],
      { fields: ["id", "name", "note", "sale_order_template_id"], limit: 1, order: "id desc" }
    );
    if (found?.length) {
      orderId = found[0].id;
      orderName = found[0].name;
    }
  }

  if (!orderId) {
    return { enriched: false, reason: "no_so", order_id: null, order_name: null };
  }

  const orders = await executeKw(
    "sale.order",
    "read",
    [[orderId]],
    {
      fields: [
        "id",
        "name",
        "note",
        "sale_order_template_id",
        "order_line",
        "opportunity_id",
        "x_studio_nombre_del_pedido",
        "partner_id",
      ],
    }
  );
  const order = orders?.[0];
  if (!order) {
    return { enriched: false, reason: "so_missing", order_id: orderId, order_name: null };
  }
  orderName = order.name;

  const writes = {};
  if (templateId && !order.sale_order_template_id) {
    writes.sale_order_template_id = templateId;
  }

  // Brief CRM → note solo si note vacía Y aún no hay lista (provisional).
  // Sin teléfono. Si luego hay Excel, applyLista reemplaza con lista organizada.
  const noteEmpty = !compact(String(order.note || "").replace(/<[^>]+>/g, ""));
  if (noteEmpty && payload.lead_id) {
    const leads = await executeKw(
      "crm.lead",
      "read",
      [[payload.lead_id]],
      { fields: ["description"] }
    );
    const desc = stripPhoneFromHtml(leads?.[0]?.description || "");
    if (compact(String(desc || "").replace(/<[^>]+>/g, ""))) {
      writes.note = desc;
    }
  } else if (order.note) {
    const scrubbed = stripPhoneFromHtml(order.note);
    if (scrubbed !== String(order.note || "").trim()) {
      writes.note = scrubbed;
    }
  }

  if (Object.keys(writes).length) {
    await executeKw("sale.order", "write", [[orderId], writes]);
  }

  const lines = await executeKw(
    "sale.order.line",
    "search_read",
    [[["order_id", "=", orderId]]],
    { fields: ["id", "product_id"], limit: 80 }
  );
  const hasDesign = (lines || []).some(
    (l) => Number(Array.isArray(l.product_id) ? l.product_id[0] : l.product_id) === designProductId
  );
  if (!hasDesign && designProductId) {
    await executeKw("sale.order.line", "create", [
      {
        order_id: orderId,
        product_id: designProductId,
        name: "Diseño",
        product_uom_qty: 1,
        price_unit: 0,
      },
    ]);
  }

  const title =
    stripOppPrefix(
      compact(order.x_studio_nombre_del_pedido) ||
        (Array.isArray(order.partner_id) ? compact(order.partner_id[1]) : "") ||
        compact(payload.partner_name) ||
        compact(payload.order_summary) ||
        compact(payload.opportunity_name) ||
        compact(payload.lead_name) ||
        orderName ||
        ""
    ) || orderName;

  // Sincronizar adjuntos (archivos WhatsApp / ir.attachment crm.lead) a la sale.order
  let mediaSync = { synced: [], errors: [] };
  try {
    mediaSync = await syncAttachmentsToOdoo(odoo, payload, env);
  } catch (err) {
    mediaSync = { synced: [], errors: [String(err?.message || err).slice(0, 200)] };
  }

  let lista = { applied: false, reason: "not_attempted" };
  try {
    lista = await applyListaFromSoAttachments(odoo, {
      orderId,
      title,
      force: Boolean(payload.force_lista),
    });
  } catch (err) {
    lista = {
      applied: false,
      reason: "lista_error",
      error: String(err?.message || err).slice(0, 300),
    };
  }

  // Líneas comerciales: desde Excel parseado o estimado CRM (LIFE_DOSSIER / brief).
  let commercial = { created: [], updated: [], skipped: true, reason: "not_attempted" };
  try {
    commercial = await ensureSoCommercialLines(odoo, {
      orderId,
      leadId: payload.lead_id || null,
      detailRows: lista.detail_rows || [],
      designProductId,
      env,
    });
  } catch (err) {
    commercial = {
      created: [],
      updated: [],
      skipped: true,
      reason: "commercial_error",
      error: String(err?.message || err).slice(0, 300),
    };
  }

  return {
    enriched: true,
    order_id: orderId,
    order_name: orderName,
    wrote_note: Boolean(writes.note),
    wrote_template: Boolean(writes.sale_order_template_id),
    design_line: !hasDesign,
    media_sync: mediaSync,
    lista,
    commercial,
  };
}

function guessMimetype(filename, mimeType) {
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
  if (name.endsWith(".ps")) return "application/postscript";
  if (name.endsWith(".ogg")) return "audio/ogg";
  return "application/octet-stream";
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function syncAttachmentsToOdoo(odoo, payload, env) {
  const { executeKw } = odoo;
  const orderId = payload.so_id || null;
  const leadId = payload.lead_id || null;
  if (!orderId) return { synced: [], errors: [] };

  const synced = [];
  const errors = [];

  // 1. Copiar adjuntos existentes de crm.lead a sale.order
  if (leadId) {
    try {
      const leadAtts = await executeKw(
        "ir.attachment",
        "search_read",
        [[["res_model", "=", "crm.lead"], ["res_id", "=", leadId]]],
        { fields: ["id", "name", "datas", "mimetype"] }
      );
      for (const att of leadAtts || []) {
        if (!att.name || !att.datas) continue;
        const existing = await executeKw(
          "ir.attachment",
          "search",
          [[["res_model", "=", "sale.order"], ["res_id", "=", orderId], ["name", "=", att.name]]],
          { limit: 1 }
        );
        if (existing?.length) continue;

        const newId = await executeKw("ir.attachment", "create", [
          {
            name: att.name,
            res_model: "sale.order",
            res_id: orderId,
            type: "binary",
            mimetype: att.mimetype || "application/octet-stream",
            datas: att.datas,
          },
        ]);
        synced.push({ source: "crm.lead", name: att.name, id: newId });
      }
    } catch (err) {
      errors.push(`lead_copy_error: ${err?.message || err}`);
    }
  }

  // 2. Consultar adjuntos WhatsApp por teléfono desde la API de Kapso
  const phone = digitsOnly(payload.partner_phone || "");
  const baseUrl = compact(env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const apiKey = compact(env.KAPSO_API_KEY || "");

  if (phone && baseUrl && apiKey) {
    try {
      const res = await fetch(`${baseUrl}/platform/v1/whatsapp/messages?phone_number=${phone}&per_page=30`, {
        headers: { "X-API-Key": apiKey, "User-Agent": "Mozilla/5.0" },
      });
      if (res.ok) {
        const json = await res.json();
        const msgs = json.data || json.messages || [];
        for (const m of msgs) {
          if (m.kapso?.direction !== "inbound") continue;

          let mediaUrl = null;
          let filename = null;
          let mime = null;

          const kMedia = m.kapso?.media_data || {};
          const msgId = String(m.id || "").slice(-8);

          if (kMedia.url) {
            mediaUrl = kMedia.url;
            filename = kMedia.filename;
            mime = kMedia.content_type;
          } else if (m.document?.link) {
            mediaUrl = m.document.link;
            filename = m.document.filename;
            mime = m.document.mime_type;
          } else if (m.image?.link) {
            mediaUrl = m.image.link;
            filename = `imagen_${msgId}.jpeg`;
            mime = "image/jpeg";
          } else if (m.audio?.link) {
            mediaUrl = m.audio.link;
            filename = `audio_${msgId}.ogg`;
            mime = "audio/ogg";
          }

          if (!mediaUrl) continue;
          filename = compact(filename) || "adjunto_wa";

          // Verificar si ya existe en la sale.order
          const existingSO = await executeKw(
            "ir.attachment",
            "search",
            [[["res_model", "=", "sale.order"], ["res_id", "=", orderId], ["name", "=", filename]]],
            { limit: 1 }
          );
          if (existingSO?.length) continue;

          // Descargar los bytes de la imagen / archivo
          const fRes = await fetch(mediaUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (!fRes.ok) continue;
          const bytes = new Uint8Array(await fRes.arrayBuffer());
          if (!bytes.length) continue;
          const b64 = bytesToBase64(bytes);

          // Subir a sale.order
          const attSoId = await executeKw("ir.attachment", "create", [
            {
              name: filename,
              res_model: "sale.order",
              res_id: orderId,
              type: "binary",
              mimetype: guessMimetype(filename, mime),
              datas: b64,
            },
          ]);

          // Subir también a crm.lead si existe
          if (leadId) {
            const existingLead = await executeKw(
              "ir.attachment",
              "search",
              [[["res_model", "=", "crm.lead"], ["res_id", "=", leadId], ["name", "=", filename]]],
              { limit: 1 }
            );
            if (!existingLead?.length) {
              await executeKw("ir.attachment", "create", [
                {
                  name: filename,
                  res_model: "crm.lead",
                  res_id: leadId,
                  type: "binary",
                  mimetype: guessMimetype(filename, mime),
                  datas: b64,
                },
              ]);
            }
          }

          synced.push({ source: "whatsapp_media", name: filename, id: attSoId });
        }
      }
    } catch (err) {
      errors.push(`kapso_media_error: ${err?.message || err}`);
    }
  }

  return { synced, errors };
}

async function handler(request, env) {
  const url = new URL(request.url);
  const expected = compact(env.LIFE_ODOO_WEBHOOK_SECRET);
  const got = extractSecret(request, url);
  if (expected && got !== expected) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const payload = normalizePayload(body);
  const now = new Date().toISOString();

  let enrich = { enriched: false, reason: "skipped_no_odoo_env" };
  try {
    const odoo = await odooAuthenticate(env);
    if (odoo) {
      enrich = await enrichSaleOrder(odoo, payload, env);
    }
  } catch (error) {
    enrich = {
      enriched: false,
      reason: "odoo_error",
      error: String(error?.message || error).slice(0, 300),
    };
  }

  const lista = enrich.lista || {};
  let noteMsg =
    "Presupuesto notificado. Sin WhatsApp al cliente. Staff puede subir listas/fotos al SO por WA.";
  if (lista.applied) {
    noteMsg = `Lista organizada desde ${lista.filename} (${lista.rows} filas) → nota del presupuesto ${enrich.order_name}.`;
  } else if (lista.reason === "needs_ocr") {
    noteMsg =
      "Presupuesto OK; PDF de lista sin texto embebido. Staff: ask_about_file (visión) para organizar la lista.";
  } else if (lista.reason === "no_list_attachment" || lista.reason === "no_excel_or_docx") {
    noteMsg =
      "Presupuesto OK sin lista aún. Cuando envíen Excel/PDF/foto/texto de lista, se organiza y pasa a la nota del SO.";
  }

  return jsonResponse({
    ok: true,
    event: payload.event,
    lead_id: payload.lead_id,
    so_id: enrich.order_id || payload.so_id,
    so_name: enrich.order_name || payload.so_name,
    partner_phone: payload.partner_phone,
    partner_name: payload.partner_name,
    at: now,
    enrich,
    vars: {
      quote: {
        status: "presupuesto",
        order_summary: payload.order_summary,
        so_name: enrich.order_name || payload.so_name,
        so_id: enrich.order_id || payload.so_id,
        odoo_lead_id: payload.lead_id,
        presupuesto_at: now,
        lista_applied: Boolean(lista.applied),
        lista_rows: lista.rows || null,
      },
      order_state: {
        stage: "presupuesto",
        source: "odoo_webhook",
        at: now,
        lead_id: payload.lead_id,
        so_id: enrich.order_id || payload.so_id,
        so_name: enrich.order_name || payload.so_name,
        lista: lista,
      },
    },
    note: noteMsg,
  });
}


