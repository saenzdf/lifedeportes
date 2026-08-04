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
 * Kapso tool: parsear-lista-excel-pedido
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role !== "staff") {
    return jsonResponse(
      { ok: false, error: "staff_only", vars: serviceVars("parsear_lista_excel_pedido", "blocked", now) },
      403
    );
  }

  const { primaryUrl, mediaFromMessages } = pickMediaFromContext(body);
  const fileUrl = compact(input.file_url || primaryUrl);
  if (!fileUrl) {
    return jsonResponse({
      ok: false,
      error: "missing_file_url",
      vars: serviceVars("parsear_lista_excel_pedido", "error", now, "Adjunte Excel, Word (.docx) o pase file_url."),
    });
  }

  const filename =
    compact(input.filename) ||
    mediaFromMessages.find((m) => m.url === fileUrl)?.filename ||
    filenameFromUrl(fileUrl);

  try {
    const bytes = await fetchBinary(fileUrl);
    const parsed = await parseListAttachmentBytes(bytes, filename, {
      sheet_name: compact(input.sheet_name || input.sheet || ""),
    });

    if (parsed.needs_sheet_choice) {
      return jsonResponse({
        ok: false,
        status: "needs_sheet_choice",
        error: "ambiguous_sheet",
        message: parsed.message,
        sheet_choices: parsed.sheet_choices || [],
        vars: serviceVars(
          "parsear_lista_excel_pedido",
          "needs_input",
          now,
          parsed.message || "¿Qué pestaña del Excel debo usar? Normalmente «formato life»."
        ),
      });
    }

    if (!parsed.ok) {
      return jsonResponse({
        ok: false,
        error: parsed.error,
        vars: serviceVars(
          "parsear_lista_excel_pedido",
          "error",
          now,
          parsed.message ||
            "Archivo sin filas reconocibles. Use Excel FORMATO PEDIDO LIFE o lista Word (.docx)."
        ),
      });
    }

    const source = /\.docx$/i.test(filename) ? "word" : "excel";

    const merged = mergeOrderDetailDraft(vars, {
      rows: parsed.rows,
      source,
      mode: input.merge_mode === "append" ? "append" : "replace",
      now,
    });

    const detailPatch = {
      ...merged.order_draft.detail,
      excel_layout: parsed.layout || null,
      excel_sheet: parsed.sheetName || null,
      parse_report: parsed.parse_report || null,
      color_media: parsed.color_media || null,
      disciplina: parsed.disciplina || null,
    };

    const staffSummary =
      parsed.parse_report?.summary_text || merged.detail.summary_text;

    const mimeType = /\.docx$/i.test(filename)
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    const attachments = mergeAttachments(vars?.order_draft?.attachments, [
      {
        url: fileUrl,
        filename,
        mime_type: mimeType,
        role: "detail_list",
      },
    ]);

    const order_draft = patchOrderDraft(vars, {
      ...merged.order_draft,
      detail: detailPatch,
      attachments,
    });

    return jsonResponse({
      ok: true,
      status: merged.detail.parse_status,
      row_count: parsed.rows.length,
      sheet_name: parsed.sheetName,
      layout: parsed.layout || null,
      layout_notes: parsed.layout_notes || [],
      parse_report: parsed.parse_report || null,
      color_media: parsed.color_media || null,
      disciplina: parsed.disciplina || null,
      warnings: [...(merged.warnings || []), ...(parsed.warnings || [])].filter(Boolean),
      summary_text: staffSummary,
      vars: {
        order_draft,
        ...serviceVars("parsear_lista_excel_pedido", "ready", now, staffSummary),
      },
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String(err?.message || err),
      vars: serviceVars(
        "parsear_lista_excel_pedido",
        "error",
        now,
        "No pude leer el archivo. Reenvíe Excel o Word (.docx)."
      ),
    });
  }
}


