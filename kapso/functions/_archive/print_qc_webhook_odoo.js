/**
 * Webhook Odoo Online → Kapso: QC lista (xlsx/json) vs PDF de impresión.
 * - POST cuerpo Odoo Studio: { task_id, attachment_id?, event, db?, list_attachment_id?, print_attachment_id? }
 * - Header: X-LD-QC-Signature = env.LD_PRINT_QC_WEBHOOK_SECRET
 */
async function handler(request, env) {
  const now = new Date().toISOString();
  const url = new URL(request.url);

  if (request.method === "GET") {
    return jsonResponse(200, { ok: true, service: "print_qc_webhook_odoo", at: now });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch (_e) {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const secret = String(request.headers.get("X-LD-QC-Signature") || request.headers.get("x-ld-qc-signature") || "");
  const expected = String(env.LD_PRINT_QC_WEBHOOK_SECRET || "").trim();
  if (!expected || secret !== expected) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  const input = body.input && typeof body.input === "object" ? body.input : body;
  const ODOO_URL = env.ODOO_URL;
  const ODOO_DB = env.ODOO_DB;
  const ODOO_USERNAME = env.ODOO_USERNAME;
  const ODOO_PASSWORD = env.ODOO_PASSWORD;

  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
    return jsonResponse(500, { error: "missing_odoo_env" });
  }

  const rpc = makeRpc(ODOO_URL);
  const executeKw = (uid, model, method, args = [], kw = {}) =>
    rpc("object", "execute_kw", [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, kw]);

  try {
    const uid = await rpc("common", "authenticate", [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}]);
    if (!uid) throw new Error("Odoo authenticate failed");

    const taskId = Number(input.task_id || 0);
    if (!taskId) {
      return jsonResponse(400, { error: "missing_task_id" });
    }
    const attachmentId = input.attachment_id != null && input.attachment_id !== "" ? Number(input.attachment_id) : null;
    const event = String(input.event || "approval_requested");
    const listOverride = input.list_attachment_id != null ? Number(input.list_attachment_id) : null;
    const printOverride = input.print_attachment_id != null ? Number(input.print_attachment_id) : null;
    const debug =
      Boolean(input.debug) ||
      String(env.LD_PRINT_QC_DEBUG || "").trim() === "1" ||
      String(env.LD_PRINT_QC_DEBUG || "").toLowerCase() === "true";

    const sig = `${taskId}|${listOverride || ""}|${printOverride || attachmentId || ""}|${event}`;
    if (!debug) {
      const dup = await wasRecentlyProcessed(executeKw, uid, sig);
      if (dup) {
        return jsonResponse(200, { ok: true, skipped: "duplicate_signature", signature: sig });
      }
    }

    const result = await runPrintQcForTask(executeKw, uid, env, {
      taskId,
      triggerAttachmentId: attachmentId,
      listOverride,
      printOverride,
      debug,
    });

    if (result.didPost) {
      await markProcessed(executeKw, uid, sig);
    }

    const payload = { ok: true, qc: result.summary, at: now };
    if (debug && result.debug) payload.qc_debug = result.debug;
    return jsonResponse(200, payload);
  } catch (err) {
    return jsonResponse(502, { error: String(err?.message || err) });
  }
}

function jsonResponse(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function importEsmFromUrl(url) {
  try {
    return await import(url);
  } catch (_e) {
    // Node (local dev) blocks `import("https://...")` and `import("blob:...")`.
    // Fetch the module and load it via a data: URL (self-contained bundles only).
    // Do not use the esm.sh *entry* shims (e.g. `xlsx@0.18.5` re-exports a path that will not resolve here).
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`failed_to_fetch_module: ${url}`);
    const code = await resp.text();
    const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
    return await import(dataUrl);
  }
}

function makeRpc(baseUrl) {
  return async (service, method, args) => {
    const resp = await fetch(`${baseUrl}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args } }),
    });
    const json = await resp.json();
    if (json?.error) throw new Error(json.error?.message || "Odoo RPC error");
    return json.result;
  };
}

async function wasRecentlyProcessed(executeKw, uid, sig) {
  try {
    const key = "lifedeportes_kapso_print_qc_last_sig";
    const cur = await executeKw(uid, "ir.config_parameter", "get_param", [key, ""]);
    return String(cur || "") === sig;
  } catch (_e) {
    return false;
  }
}

async function markProcessed(executeKw, uid, sig) {
  try {
    await executeKw(uid, "ir.config_parameter", "set_param", [
      "lifedeportes_kapso_print_qc_last_sig",
      sig,
    ]);
  } catch (_e) {
    /* ignore */
  }
}

async function runPrintQcForTask(executeKw, uid, env, opts) {
  const { taskId, triggerAttachmentId, listOverride, printOverride, debug } = opts;

  let tasks;
  try {
    tasks = await executeKw(uid, "project.task", "read", [[taskId]], {
      fields: [
        "id",
        "name",
        "stage_id",
        "sale_order_id",
        "ld_qc_list_attachment_id",
        "ld_qc_print_attachment_id",
      ],
    });
  } catch (_e) {
    tasks = await executeKw(uid, "project.task", "read", [[taskId]], {
      fields: ["id", "name", "stage_id", "sale_order_id"],
    });
  }
  let task = Array.isArray(tasks) ? tasks[0] : null;
  if (!task) {
    if (!debug) {
      await postMessage(executeKw, uid, taskId, "<p><b>QC Kapso:</b> tarea no encontrada.</p>");
    }
    return { summary: "task_missing", didPost: debug ? false : true, debug: { task_id: taskId, error: "task_missing" } };
  }

  let listAttId = listOverride || null;
  let printAttId = printOverride || null;
  try {
    if (!listAttId && task.ld_qc_list_attachment_id) listAttId = task.ld_qc_list_attachment_id[0];
    if (!printAttId && task.ld_qc_print_attachment_id) printAttId = task.ld_qc_print_attachment_id[0];
  } catch (_e) {
    /* campos opcionales no instalados en Online */
  }

  if (!listAttId) {
    listAttId = await resolveListAttachmentId(executeKw, uid, taskId, task);
  }
  if (!printAttId) {
    printAttId = await resolvePrintPdfId(executeKw, uid, taskId, triggerAttachmentId, task);
  }

  const result = {};
  let listRows = [];
  let pdfRows = [];
  if (!listAttId) {
    result.error = "No hay Excel ni JSON de lista en la tarea (ni .xlsx en el pedido vinculado).";
  } else if (!printAttId) {
    result.error = "No hay PDF de impresión candidato en la tarea.";
  } else {
    listRows = await loadListRowsFromOdoo(executeKw, uid, listAttId);
    pdfRows = await loadPdfRowsFromOdoo(executeKw, uid, printAttId, env);
    if (!listRows.length) {
      result.error = "No se pudieron leer filas desde el adjunto de lista.";
    } else {
      const mode = String(env.PRINT_QC_COMPARE_MODE || "dorsal").toLowerCase();
      const nameNormRaw = String(env.PRINT_QC_NAME_NORMALIZE ?? "1").trim().toLowerCase();
      const nameNormalize = !["0", "false", "off", "no"].includes(nameNormRaw);
      const qcNameOpts = {
        nameNormalize,
        equivalenceRules: parseEquivalenceRules(env),
      };
      if (mode === "full") {
        result.compare = compareMultisets(listRows, pdfRows);
      } else {
        const dorsal = compareMultisetsDorsal(listRows, pdfRows, qcNameOpts);
        const tallaM = dorsal.ok ? tallaMismatches(listRows, pdfRows, qcNameOpts) : [];
        result.compare = { ...dorsal, mode: "dorsal", talla_mismatches: tallaM };
      }
    }
  }

  let listName = null;
  let pdfName = null;
  if (listAttId) {
    const listMeta = await executeKw(uid, "ir.attachment", "read", [[listAttId]], { fields: ["name"] });
    listName = listMeta?.[0]?.name || null;
  }
  if (printAttId) {
    const pdfMeta = await executeKw(uid, "ir.attachment", "read", [[printAttId]], { fields: ["name"] });
    pdfName = pdfMeta?.[0]?.name || null;
  }
  const html = formatReportHtml(result, listName, pdfName);
  if (!debug) {
    await postMessage(executeKw, uid, taskId, html);
  }
  let summary = "error";
  if (!result.error && result.compare) {
    const c = result.compare;
    if (c.ok && !c.talla_mismatches?.length) summary = "ok";
    else if (c.ok && c.talla_mismatches?.length) summary = "warn";
    else summary = "diff";
  }
  const debugPayload = debug
    ? {
        task_id: taskId,
        list_attachment_id: listAttId || null,
        print_attachment_id: printAttId || null,
        list_name: listName,
        pdf_name: pdfName,
        error: result.error || null,
        compare: result.compare || null,
        counts: {
          list_rows: listRows.length,
          pdf_rows: pdfRows.length,
        },
      }
    : null;
  return {
    summary,
    didPost: debug ? false : true,
    debug: debugPayload,
  };
}

async function postMessage(executeKw, uid, taskId, body) {
  await executeKw(uid, "project.task", "message_post", [[taskId]], {
    body,
    message_type: "comment",
    subtype_xmlid: "mail.mt_note",
  });
}

async function resolveListAttachmentId(executeKw, uid, taskId, task) {
  const domain = [
    ["res_model", "=", "project.task"],
    ["res_id", "=", taskId],
    "|",
    ["name", "ilike", ".xlsx"],
    ["name", "ilike", ".json"],
  ];
  const atts = await executeKw(uid, "ir.attachment", "search_read", [domain], {
    fields: ["id", "name", "create_date"],
    order: "create_date desc, id desc",
    limit: 40,
  });
  const list = Array.isArray(atts) ? atts : [];
  const jsonFirst = list.find((a) => String(a.name || "").toLowerCase().endsWith(".json"));
  if (jsonFirst) return jsonFirst.id;
  const xlsx = list.filter((a) => String(a.name || "").toLowerCase().endsWith(".xlsx"));
  const pref = xlsx.filter((a) => String(a.name || "").toLowerCase().includes("formato pedido life"));
  if (pref.length) {
    pref.sort((a, b) => String(b.create_date).localeCompare(String(a.create_date)));
    return pref[0].id;
  }
  if (xlsx.length) {
    xlsx.sort((a, b) => String(b.create_date).localeCompare(String(a.create_date)));
    return xlsx[0].id;
  }
  const soId = Array.isArray(task.sale_order_id) ? task.sale_order_id[0] : task.sale_order_id;
  if (!soId) return null;
  const sod = [
    ["res_model", "=", "sale.order"],
    ["res_id", "=", soId],
    ["name", "ilike", ".xlsx"],
  ];
  const sox = await executeKw(uid, "ir.attachment", "search_read", [sod], {
    fields: ["id", "name", "create_date"],
    order: "create_date desc, id desc",
    limit: 8,
  });
  const soList = Array.isArray(sox) ? sox : [];
  const soPref = soList.filter((a) => String(a.name || "").toLowerCase().includes("formato pedido life"));
  if (soPref.length) return soPref[0].id;
  if (soList.length) return soList[0].id;
  return null;
}

/** PDF de pantalón / bermuda / etc.: no usar como arte de camiseta para QC (ej. *PANT*.pdf). */
function isNonJerseyPdfName(name) {
  const low = String(name || "").toLowerCase();
  if (low.includes("pantal") || low.includes("bermuda")) return true;
  if (/\bpant\b|pant\.\.|_pant| pant\.|\bpant\.|\(pant/i.test(low)) return true;
  if (/\bshorts?\b/.test(low)) return true;
  return false;
}

async function resolvePrintPdfId(executeKw, uid, taskId, triggerId, task) {
  const skip = (name) => {
    const low = String(name || "").toLowerCase();
    if (low.includes("muestra") && low.includes("color")) return true;
    if (low.includes("adic") && !low.includes("orden")) return true;
    return false;
  };

  const pickFromPdfList = (list) => {
    const candidates = list.filter((a) => !skip(a.name) && !isNonJerseyPdfName(a.name));
    if (!candidates.length) return null;
    const lowName = (a) => String(a.name || "").toLowerCase();
    if (triggerId) {
      const tr = candidates.find((a) => a.id === triggerId);
      if (tr) return tr.id;
    }
    const orden = candidates.filter((a) => lowName(a).includes("orden de trabajo"));
    if (orden.length === 1) return orden[0].id;
    if (orden.length > 1) {
      orden.sort((a, b) => String(b.create_date).localeCompare(String(a.create_date)));
      return orden[0].id;
    }
    const camHint = candidates.filter((a) => {
      const n = lowName(a);
      return (
        /\bcam\b/.test(n) ||
        n.includes("camiseta") ||
        n.includes("uniforme") ||
        n.includes("espalda")
      );
    });
    if (camHint.length >= 1) {
      camHint.sort((a, b) => String(b.create_date).localeCompare(String(a.create_date)));
      return camHint[0].id;
    }
    if (candidates.length === 1) return candidates[0].id;
    candidates.sort((a, b) => String(b.create_date).localeCompare(String(a.create_date)));
    return candidates[0].id;
  };

  const domain = [
    ["res_model", "=", "project.task"],
    ["res_id", "=", taskId],
    ["mimetype", "=", "application/pdf"],
  ];
  const pdfs = await executeKw(uid, "ir.attachment", "search_read", [domain], {
    fields: ["id", "name", "create_date", "mimetype"],
    order: "create_date desc, id desc",
    limit: 30,
  });
  const list = Array.isArray(pdfs) ? pdfs : [];
  const taskPick = pickFromPdfList(list);
  if (taskPick) return taskPick;

  const soId = Array.isArray(task?.sale_order_id) ? task.sale_order_id[0] : task?.sale_order_id;
  if (!soId) return null;
  const sod = [
    ["res_model", "=", "sale.order"],
    ["res_id", "=", soId],
    ["mimetype", "=", "application/pdf"],
  ];
  const sopdfs = await executeKw(uid, "ir.attachment", "search_read", [sod], {
    fields: ["id", "name", "create_date", "mimetype"],
    order: "create_date desc, id desc",
    limit: 12,
  });
  const soList = Array.isArray(sopdfs) ? sopdfs : [];
  return pickFromPdfList(soList);
}

async function loadListRowsFromOdoo(executeKw, uid, attId) {
  const rows = await executeKw(uid, "ir.attachment", "read", [[attId]], { fields: ["name", "datas"] });
  const att = Array.isArray(rows) ? rows[0] : null;
  if (!att?.datas) return [];
  const raw = base64ToUint8Array(att.datas);
  const name = String(att.name || "").toLowerCase();
  if (name.endsWith(".json")) {
    return parseJsonList(raw);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm") || name.endsWith(".xls") || name.endsWith(".xltx")) {
    return await parseXlsxList(raw);
  }
  return [];
}

async function loadPdfRowsFromOdoo(executeKw, uid, attId, env) {
  const rows = await executeKw(uid, "ir.attachment", "read", [[attId]], { fields: ["datas"] });
  const att = Array.isArray(rows) ? rows[0] : null;
  if (!att?.datas) return [];
  const bytes = base64ToUint8Array(att.datas);
  const text = await extractPdfText(bytes);
  const parsed = parsePdfLines(text);
  if (parsed.length > 0) {
    return parsed;
  }
  const aiRows = await extractPrintRowsWithAi(bytes, env);
  return aiRows.length > 0 ? aiRows : parsed;
}

function base64ToUint8Array(b64) {
  const bin = atob(String(b64).trim());
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

function parseJsonList(bytes) {
  try {
    const txt = new TextDecoder().decode(bytes);
    const payload = JSON.parse(txt);
    const lines = Array.isArray(payload) ? payload : payload.lines;
    if (!Array.isArray(lines)) return [];
    const out = [];
    for (const line of lines) {
      if (!line || typeof line !== "object") continue;
      const nombre =
        line.nombre_uniforme || line.nombre || line.name || line["NOMBRE EN UNIFORME"];
      if (!nombre) continue;
      const tallaRaw =
        line.talla ?? line.TALLA ?? line.Talla ?? line.size ?? line.talla_uniforme ?? "";
      out.push({
        nombre_uniforme: String(nombre).trim(),
        talla: normalizeTalla(tallaRaw),
        numero: String(line.numero || line.NUMERO || line.numero_uniforme || "").trim(),
      });
    }
    return out;
  } catch (_e) {
    return [];
  }
}

async function parseXlsxList(bytes) {
  try {
    const XLSX = await importEsmFromUrl("https://esm.sh/xlsx@0.18.5/es2022/xlsx.mjs");
    const wb = XLSX.read(bytes, { type: "array", cellDates: true });
    const sheetNames = wb.SheetNames || [];
    const preferred = [];
    for (const name of sheetNames) {
      const low = String(name || "").toLowerCase();
      if (low.includes("formato") && low.includes("life")) preferred.push(name);
    }
    const candidates = preferred.length ? preferred : sheetNames;
    for (const sheetName of candidates) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const ref = ws["!ref"];
      if (!ref) continue;
      const range = XLSX.utils.decode_range(ref);
      const grid = [];
      for (let R = range.s.r; R <= range.e.r; R++) {
        const row = [];
        for (let C = range.s.c; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[addr];
          row.push(cell ? cell.v : "");
        }
        grid.push(row);
      }
      const rows = extractRowsFromLifeGrid(grid);
      if (rows.length) return rows;
    }
    return [];
  } catch (_e) {
    return [];
  }
}

function stripDiacritics(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Unifica tallas entre Excel (celdas tipo "talla S", "Talla: 16"), JSON y PDF.
 */
function normalizeTalla(value) {
  let s = String(value ?? "").trim();
  if (!s) return "";
  s = stripDiacritics(s).trim();
  s = s.replace(/^\s*tallas?\s*[.:]?\s*/i, "").trim();
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  const asFloat = /^(\d+)\.0$/;
  const mf = s.match(asFloat);
  if (mf) return String(parseInt(mf[1], 10));
  const asComma = /^(\d+),0$/;
  const mc = s.match(asComma);
  if (mc) return String(parseInt(mc[1], 10));
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  const letterCode = /^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL)$/i;
  if (letterCode.test(s)) return s.toUpperCase();
  if (/^\d+\s*-\s*\d+$/.test(s)) return s.replace(/\s+/g, "").toUpperCase();
  return s.toUpperCase();
}

function normCellHeader(v) {
  return stripDiacritics(String(v || ""))
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function looksLikeNombreHeader(t) {
  if (!t) return false;
  if (t.includes("NOMBRE") && t.includes("UNIFORME")) return true;
  // Common Life templates use long Spanish headers without repeating "UNIFORME".
  if (t.includes("NOMBRE") && t.includes("QUE") && t.includes("LLEVAR")) return true;
  if (t.includes("NOMBRE") && (t.includes("LISTADO") || t.includes("JUGADOR") || t.includes("ALUMNO"))) return true;
  if (t === "NOMBRE EN UNIFORME" || t === "NOMBRE") return true;
  if (t.includes("LISTADO") && t.includes("NOMBRE")) return true;
  return false;
}

function looksLikeTallaHeader(t) {
  if (!t) return false;
  if (t.includes("TALLA")) return true;
  if (t.includes("CAMISETA") || t.includes("CAMISA") || t.includes("POLO") || t.includes("BUSO")) return true;
  return false;
}

function looksLikeNumeroHeader(t) {
  if (!t) return false;
  if (t.includes("NUMERO") || t.includes("NÚMERO")) return true;
  if (t.includes("DORSAL")) return true;
  if (t === "#" || t.includes("N°") || t.includes("NO.") || t.startsWith("NO ")) return true;
  return false;
}

function scanHeaderIndexes(grid) {
  const maxRow = Math.min(80, grid.length);
  const nombreCols = [];
  const tallaCols = [];
  const numeroCols = [];

  for (let r = 0; r < maxRow; r++) {
    const row = grid[r] || [];
    const maxCol = Math.min(40, row.length);
    for (let c = 0; c < maxCol; c++) {
      const t = normCellHeader(row[c]);
      if (!t) continue;
      if (looksLikeNombreHeader(t)) nombreCols.push({ r, c });
      if (looksLikeTallaHeader(t)) tallaCols.push({ r, c });
      if (looksLikeNumeroHeader(t)) numeroCols.push({ r, c });
    }
  }

  let cn = null;
  let ct = null;
  let cnum = null;
  let headerRowIdx = null;

  const strongNombre = nombreCols.find((x) => {
    const t = normCellHeader((grid[x.r] || [])[x.c]);
    return t.includes("NOMBRE") && t.includes("UNIFORME");
  });
  if (strongNombre) {
    cn = strongNombre.c;
    headerRowIdx = strongNombre.r;
  } else if (nombreCols.length) {
    cn = nombreCols[0].c;
    headerRowIdx = nombreCols[0].r;
  }

  const tallaNear =
    cn != null
      ? tallaCols.find((x) => x.r === headerRowIdx || Math.abs(x.c - cn) <= 6)
      : tallaCols[0];
  const numeroNear =
    cn != null
      ? numeroCols.find((x) => x.r === headerRowIdx || Math.abs(x.c - cn) <= 8)
      : numeroCols[0];

  if (tallaNear) ct = tallaNear.c;
  if (numeroNear) cnum = numeroNear.c;

  // Fallback layout used by many Life templates (B/C/D) when headers are nonstandard.
  if (cn == null && ct == null && cnum == null) {
    return { cn: 1, ct: 2, cnum: 3, startIdx: 4 };
  }

  if (cn != null) {
    if (ct == null) ct = cn + 1;
    if (cnum == null) cnum = cn + 2;
  }

  const startIdx =
    headerRowIdx != null ? Math.min(grid.length - 1, headerRowIdx + 1) : 4; // first data row index in `grid`
  return { cn, ct, cnum, startIdx };
}

function extractRowsFromLifeGrid(grid) {
  const picked = scanHeaderIndexes(grid);
  let cn = picked.cn;
  let ct = picked.ct;
  let cnum = picked.cnum;
  let startIdx = picked.startIdx;

  if (cn == null || ct == null || cnum == null) {
    cn = 1;
    ct = 2;
    cnum = 3;
    startIdx = 4;
  }

  const out = [];
  const skipLabels = new Set(["NOMBRE EN UNIFORME", "NOMBRE", "TOTAL", "SUBTOTAL"]);
  let blankStreak = 0;

  for (let r = startIdx; r < grid.length; r++) {
    const row = grid[r] || [];
    const nombre = row[cn];
    if (nombre == null || String(nombre).trim() === "") {
      blankStreak += 1;
      if (blankStreak >= 25) break;
      continue;
    }
    blankStreak = 0;

    const ns = String(nombre).trim();
    const nsUp = stripDiacritics(ns).toUpperCase();
    if (skipLabels.has(nsUp)) continue;
    if (nsUp.includes("TOTAL UNIFORMES")) continue;

    out.push({
      nombre_uniforme: ns,
      talla: normalizeTalla(row[ct] != null ? String(row[ct]) : ""),
      numero: row[cnum] != null ? String(row[cnum]).trim() : "",
    });
  }

  return out;
}

async function extractPdfText(bytes) {
  try {
    const pdfjs = await importEsmFromUrl("https://esm.sh/pdfjs-dist@4.8.69/build/pdf.mjs");
    const getDocument = pdfjs.getDocument || pdfjs.default?.getDocument;
    if (!getDocument) return "";
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.8.69/build/pdf.worker.mjs";
    }
    const loadingTask = getDocument({ data: bytes, useSystemFonts: true });
    const pdf = await loadingTask.promise;
    let text = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n";
    }
    return text;
  } catch (_e) {
    return "";
  }
}

function parsePdfLines(text) {
  const rows = [];
  const lines = String(text || "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length < 5) continue;
    const low = line.toLowerCase();
    if (low.includes("muestra") && low.includes("color")) continue;
    const parsed = parseLineThreeTokens(line);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

function parseLineThreeTokens(line) {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const numRaw = parts[parts.length - 1].replace(/^#/, "");
  if (!/^\d+$/.test(numRaw)) return null;
  const talla = parts[parts.length - 2];
  if (!/^[A-Za-z0-9./-]{1,10}$/.test(talla)) return null;
  const nombre = parts.slice(0, -2).join(" ").trim();
  if (nombre.length < 2) return null;
  return {
    nombre_uniforme: nombre,
    talla: normalizeTalla(talla),
    numero: String(parseInt(numRaw, 10)),
  };
}

function normalizeToken(value) {
  if (value == null) return "";
  let s = String(value).trim().toUpperCase().replace(/\s+/g, " ");
  s = s
    .replace(/Á/g, "A")
    .replace(/É/g, "E")
    .replace(/Í/g, "I")
    .replace(/Ó/g, "O")
    .replace(/Ú/g, "U")
    .replace(/Ñ/g, "N");
  return s;
}

function normalizeNumero(value) {
  const s = String(value || "")
    .trim()
    .replace(/^#/, "");
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return normalizeToken(s);
}

function rowKey(n, t, num) {
  return `${normalizeToken(n)}|${normalizeToken(t)}|${normalizeNumero(num)}`;
}

function normalizeNombreUniformeForQcKey(nombre, enabled) {
  let s = normalizeToken(nombre);
  if (!enabled) return s;
  return s.replace(/(\s+[A-Z])\.\s*$/, "$1");
}

function parseEquivalenceRules(env) {
  const raw = String(env?.PRINT_QC_NAME_EQUIVALENCE_JSON || "").trim();
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data.rules) ? data.rules : [];
  } catch (_e) {
    return [];
  }
}

function resolveEquivalenceToken(token, numero, rules) {
  const n = normalizeNumero(numero);
  for (const rule of rules || []) {
    const want = rule.numero;
    if (want != null && String(want).trim() && normalizeNumero(want) !== n) continue;
    const toks = rule.equivalent_tokens;
    if (!Array.isArray(toks)) continue;
    const tset = new Set(toks.map((t) => normalizeNombreUniformeForQcKey(t, true)));
    if (tset.has(token) && tset.size) return [...tset].sort()[0];
  }
  return token;
}

function rowKeyDorsal(n, num, opts) {
  let tok = normalizeNombreUniformeForQcKey(n, opts?.nameNormalize !== false);
  const rules = opts?.equivalenceRules;
  if (rules?.length) tok = resolveEquivalenceToken(tok, num, rules);
  return `${tok}|${normalizeNumero(num)}`;
}

function parseDorsalKey(k) {
  const i = k.lastIndexOf("|");
  if (i < 0) return [k, ""];
  return [k.slice(0, i), k.slice(i + 1)];
}

function compareMultisetsDorsal(excelRows, pdfRows, opts) {
  const ex = excelRows
    .filter((r) => r.nombre_uniforme)
    .map((r) => rowKeyDorsal(r.nombre_uniforme, r.numero, opts));
  const pr = pdfRows
    .filter((r) => r.nombre_uniforme)
    .map((r) => rowKeyDorsal(r.nombre_uniforme, r.numero, opts));
  const count = (arr) => {
    const m = new Map();
    for (const k of arr) m.set(k, (m.get(k) || 0) + 1);
    return m;
  };
  const cEx = count(ex);
  const cPr = count(pr);
  const missing = [];
  const extra = [];
  for (const [k, n] of cEx) {
    const d = n - (cPr.get(k) || 0);
    for (let i = 0; i < d; i++) {
      const [nk, num] = parseDorsalKey(k);
      missing.push([nk, "", num]);
    }
  }
  for (const [k, n] of cPr) {
    const d = n - (cEx.get(k) || 0);
    for (let i = 0; i < d; i++) {
      const [nk, num] = parseDorsalKey(k);
      extra.push([nk, "", num]);
    }
  }
  const ok = missing.length === 0 && extra.length === 0;
  return {
    ok,
    mode: "dorsal",
    excel_count: ex.length,
    pdf_count: pr.length,
    missing,
    extra,
    pdf_text_empty: pr.length === 0 && ex.length > 0,
  };
}

function tallaMismatches(excelRows, pdfRows, opts) {
  const group = (rows, keyFn) => {
    const m = new Map();
    for (const r of rows) {
      if (!r.nombre_uniforme) continue;
      const k = keyFn(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  };
  const ke = (r) => rowKeyDorsal(r.nombre_uniforme, r.numero, opts);
  const ge = group(excelRows, ke);
  const gp = group(pdfRows, ke);
  const out = [];
  for (const [k, elist] of ge) {
    const plist = gp.get(k) || [];
    if (elist.length !== plist.length) continue;
    const elistS = [...elist].sort((a, b) =>
      normalizeToken(a.nombre_uniforme).localeCompare(normalizeToken(b.nombre_uniforme))
    );
    const plistS = [...plist].sort((a, b) =>
      normalizeToken(a.nombre_uniforme).localeCompare(normalizeToken(b.nombre_uniforme))
    );
    for (let i = 0; i < elistS.length; i++) {
      const e = elistS[i];
      const p = plistS[i];
      const te = normalizeTalla(e.talla);
      const tp = normalizeTalla(p.talla);
      if (te && tp && te !== tp) {
        out.push({
          nombre_uniforme: e.nombre_uniforme,
          numero: normalizeNumero(e.numero),
          talla_excel: te,
          talla_pdf: tp,
          kind: "mismatch",
        });
      } else if (te && !tp) {
        out.push({
          nombre_uniforme: e.nombre_uniforme,
          numero: normalizeNumero(e.numero),
          talla_excel: te,
          talla_pdf: "",
          kind: "talla_missing_pdf",
        });
      }
    }
  }
  return out;
}

function compareMultisets(excelRows, pdfRows) {
  const ex = excelRows.filter((r) => r.nombre_uniforme).map((r) => rowKey(r.nombre_uniforme, r.talla, r.numero));
  const pr = pdfRows.filter((r) => r.nombre_uniforme).map((r) => rowKey(r.nombre_uniforme, r.talla, r.numero));
  const count = (arr) => {
    const m = new Map();
    for (const k of arr) m.set(k, (m.get(k) || 0) + 1);
    return m;
  };
  const cEx = count(ex);
  const cPr = count(pr);
  const missing = [];
  const extra = [];
  for (const [k, n] of cEx) {
    const d = n - (cPr.get(k) || 0);
    for (let i = 0; i < d; i++) missing.push(k.split("|"));
  }
  for (const [k, n] of cPr) {
    const d = n - (cEx.get(k) || 0);
    for (let i = 0; i < d; i++) extra.push(k.split("|"));
  }
  const ok = missing.length === 0 && extra.length === 0;
  return {
    ok,
    mode: "full",
    excel_count: ex.length,
    pdf_count: pr.length,
    missing,
    extra,
    pdf_text_empty: pr.length === 0 && ex.length > 0,
  };
}

function formatReportHtml(result, listName, pdfName) {
  const parts = [`<p><b>Auditoría lista vs impresión (Kapso)</b></p>`];
  parts.push(`<p>Lista: ${listName || "—"}<br/>PDF: ${pdfName || "—"}</p>`);
  if (result.error) {
    parts.push(`<p style="color:#a00"><b>Error:</b> ${escapeHtml(result.error)}</p>`);
    return parts.join("");
  }
  const st = result.compare || {};
  if (st.pdf_text_empty) {
    parts.push(
      "<p style='color:#a00'>No se extrajeron filas del PDF (¿escaneado o solo imagen?). Fase 2: OCR/IA.</p>"
    );
  }
  const tm = st.talla_mismatches || [];
  if (st.ok && !tm.length) {
    parts.push("<p style='color:#080'><b>QC: OK</b> — Lista y PDF coinciden (misma clave nombre+dorsal).</p>");
  } else if (st.ok && tm.length) {
    parts.push(
      "<p style='color:#a60'><b>QC: ADVERTENCIA</b> — Mismo nombre+dorsal pero revisar tallas.</p>"
    );
    parts.push("<p><b>Diferencias de talla (Excel vs PDF):</b></p><ul>");
    for (const t of tm.slice(0, 40)) {
      parts.push(
        `<li>${escapeHtml(t.nombre_uniforme)} #${escapeHtml(t.numero)} — Excel ${escapeHtml(t.talla_excel)} vs PDF ${escapeHtml(t.talla_pdf || "—")}</li>`
      );
    }
    if (tm.length > 40) parts.push(`<li>… y ${tm.length - 40} más</li>`);
    parts.push("</ul>");
  } else {
    parts.push("<p style='color:#a00'><b>QC: CON DIFERENCIAS</b></p>");
    if (st.missing?.length) {
      parts.push("<p><b>Faltan en PDF (vs Excel):</b></p><ul>");
      for (const k of st.missing.slice(0, 50)) {
        parts.push(`<li>${escapeHtml(k[0])} | Talla ${escapeHtml(k[1])} | #${escapeHtml(k[2])}</li>`);
      }
      if (st.missing.length > 50) parts.push(`<li>… y ${st.missing.length - 50} más</li>`);
      parts.push("</ul>");
    }
    if (st.extra?.length) {
      parts.push("<p><b>Sobran en PDF:</b></p><ul>");
      for (const k of st.extra.slice(0, 50)) {
        parts.push(`<li>${escapeHtml(k[0])} | Talla ${escapeHtml(k[1])} | #${escapeHtml(k[2])}</li>`);
      }
      if (st.extra.length > 50) parts.push(`<li>… y ${st.extra.length - 50} más</li>`);
      parts.push("</ul>");
    }
  }
  parts.push(`<p><small>Filas lista: ${st.excel_count || 0} · Filas PDF: ${st.pdf_count || 0}</small></p>`);
  return parts.join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function extractPrintRowsWithAi(pdfBytes, env) {
  const endpoint = String(env?.PRINT_QC_AI_EXTRACTOR_URL || "").trim();
  const token = String(env?.PRINT_QC_AI_EXTRACTOR_TOKEN || "").trim();
  if (!endpoint) return [];
  try {
    const payload = {
      schema: "lifedeportes_print_rows_v1",
      instruction:
        "Extrae filas de camisetas del imprimible. Devuelve array rows con nombre_uniforme, talla, numero. Ignora logos y metadata.",
      file: {
        mime_type: "application/pdf",
        base64: uint8ToBase64(pdfBytes),
      },
    };
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const out = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const nombre = String(row.nombre_uniforme || row.nombre || "").trim();
      if (!nombre) continue;
      out.push({
        nombre_uniforme: nombre,
        talla: normalizeTalla(row.talla ?? row.TALLA ?? row.size ?? ""),
        numero: String(row.numero || "").trim(),
      });
    }
    return out;
  } catch (_e) {
    return [];
  }
}

function uint8ToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}
