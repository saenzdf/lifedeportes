/**
 * Busca adjunto lista en tarea o SO: Excel (.xlsx) o Word (.docx).
 */

export function isListAttachmentFilename(name) {
  return /\.(xlsx|xlsm|xltx|xls|docx)$/i.test(String(name || ""));
}

function rankListAttachment(att) {
  const name = String(att.name || "");
  if (/formato pedido life/i.test(name) && /\.xlsx/i.test(name)) return 0;
  if (/\.xlsx$/i.test(name)) return 1;
  if (/listado|camiseta|uniforme|pedido|familia/i.test(name) && /\.docx$/i.test(name)) return 2;
  if (/\.docx$/i.test(name)) return 3;
  return 9;
}

function pickBest(attachments) {
  const list = (attachments || []).filter((a) => isListAttachmentFilename(a.name));
  if (!list.length) return null;
  list.sort((a, b) => rankListAttachment(a) - rankListAttachment(b) || (b.id || 0) - (a.id || 0));
  return list[0];
}

export async function pickListAttachment(executeKw, taskId, saleOrderId) {
  const taskDomain = [
    ["res_model", "=", "project.task"],
    ["res_id", "=", taskId],
    "|",
    ["name", "ilike", ".xlsx"],
    ["name", "ilike", ".docx"],
  ];
  const taskAtts = await executeKw("ir.attachment", "search_read", [taskDomain], {
    fields: ["id", "name", "create_date"],
    order: "create_date desc, id desc",
    limit: 30,
  });
  const taskPick = pickBest(taskAtts);
  if (taskPick) return { id: taskPick.id, name: taskPick.name, source: "task" };

  if (!saleOrderId) return null;
  const soDomain = [
    ["res_model", "=", "sale.order"],
    ["res_id", "=", saleOrderId],
    "|",
    ["name", "ilike", ".xlsx"],
    ["name", "ilike", ".docx"],
  ];
  const soAtts = await executeKw("ir.attachment", "search_read", [soDomain], {
    fields: ["id", "name", "create_date"],
    order: "create_date desc, id desc",
    limit: 20,
  });
  const soPick = pickBest(soAtts);
  if (soPick) return { id: soPick.id, name: soPick.name, source: "sale.order" };
  return null;
}
