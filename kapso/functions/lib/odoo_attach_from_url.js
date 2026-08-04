/**
 * Sube adjuntos de order_draft.attachments a un registro Odoo (ir.attachment).
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

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
export async function attachDraftFiles(executeKw, resModel, resId, attachments, options = {}) {
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
export async function attachOrderDraftFiles(executeKw, orderId, attachments, options = {}) {
  return attachDraftFiles(executeKw, "sale.order", orderId, attachments, options);
}

export async function attachTaskDraftFiles(executeKw, taskId, attachments, options = {}) {
  return attachDraftFiles(executeKw, "project.task", taskId, attachments, options);
}
