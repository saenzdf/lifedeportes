#!/usr/bin/env node
/**
 * Sincroniza lista de pedido (Excel o JSON filas) → project.task.description + sale.order.note
 *
 * Uso:
 *   node kapso/scripts/sync_lista_pedido_to_odoo.js --order 2564 --excel "ruta.xlsx" --prod
 *   node kapso/scripts/sync_lista_pedido_to_odoo.js --order 2564 --rows-json filas.json --prod
 *   node kapso/scripts/sync_lista_pedido_to_odoo.js --task 2358 --excel "ruta.xlsx" --prod
 *
 * Opciones:
 *   --order N        Número corto (2564) o id sale.order
 *   --task ID        id project.task (alternativa a --order)
 *   --excel PATH     FORMATO PEDIDO LIFE (.xlsx) o lista Word (.docx)
 *   --file PATH      Alias de --excel
 *   --rows-json PATH JSON array de filas (tras imagen/visión)
 *   --title TEXT     Solo si staff pidió ese título en la lista (H1). No renombra SO/tarea.
 *                    Por defecto: título note existente → x_studio_nombre_* → partner.
 *   --sync-so        Ajustar cantidades en líneas SO según lista (sin crear producto arquero)
 *   --prod           Odoo producción (ODOO_LIFEDEPORTES_PROD_* en .env)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseListAttachmentBytes } from "../functions/lib/parse_list_bytes.js";
import { buildOdooOrderNoteHtml } from "../functions/lib/build_odoo_order_note.js";
import {
  bareOrderNumber,
  countRowsBySoLineBucket,
  createOdooClient,
  extractTitleFromNoteHtml,
  orderNameCandidates,
  searchStaffOrders,
  syncSoLinesFromProductMix,
} from "../functions/lib/odoo_order_correction.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function parseArgs(argv) {
  const out = { prod: argv.includes("--prod"), syncSo: argv.includes("--sync-so") };
  for (const a of argv) {
    if (a.startsWith("--order=")) out.order = a.split("=")[1];
    if (a.startsWith("--task=")) out.taskId = Number(a.split("=")[1]);
    if (a.startsWith("--excel=")) out.file = a.split("=").slice(1).join("=");
    if (a.startsWith("--file=")) out.file = a.split("=").slice(1).join("=");
    if (a.startsWith("--rows-json=")) out.rowsJson = a.split("=").slice(1).join("=");
    if (a.startsWith("--title=")) out.title = a.split("=").slice(1).join("=");
  }
  return out;
}

async function resolveOrder(executeKw, args) {
  if (args.taskId) {
    const tasks = await executeKw("project.task", "read", [[args.taskId]], {
      fields: ["id", "name", "sale_order_id", "description"],
    });
    const task = tasks?.[0];
    if (!task?.id) throw new Error(`task_not_found:${args.taskId}`);
    const orderId = Array.isArray(task.sale_order_id) ? task.sale_order_id[0] : task.sale_order_id;
    if (!orderId) throw new Error("task_without_sale_order");
    const orders = await executeKw("sale.order", "read", [[orderId]], {
      fields: [
        "id",
        "name",
        "partner_id",
        "note",
        "x_studio_nombre_del_pedido",
        "x_studio_nombre_de_pedido",
      ],
    });
    return { order: orders[0], task };
  }

  const n = bareOrderNumber(args.order || "");
  if (!n && !args.order) throw new Error("missing_order_or_task");

  // Preferir nombre S0… / número corto sobre id interno (2712 ≠ id 2712 → S02712).
  if (n) {
    const search = await searchStaffOrders(executeKw, { order_number: n, limit: 1 });
    const hit = search.orders?.[0];
    if (hit?.order_id) {
      const orders = await executeKw("sale.order", "read", [[hit.order_id]], {
        fields: [
          "id",
          "name",
          "partner_id",
          "note",
          "x_studio_nombre_del_pedido",
          "x_studio_nombre_de_pedido",
        ],
      });
      const tasks = hit.task_id
        ? await executeKw("project.task", "read", [[hit.task_id]], {
            fields: ["id", "name", "description"],
          })
        : await executeKw(
            "project.task",
            "search_read",
            [[["sale_order_id", "=", hit.order_id]]],
            { fields: ["id", "name", "description"], limit: 1, order: "id desc" }
          );
      return { order: orders[0], task: tasks?.[0] || null };
    }
  }

  if (/^\d+$/.test(String(args.order)) && Number(args.order) > 0) {
    const orders = await executeKw("sale.order", "read", [[Number(args.order)]], {
      fields: [
        "id",
        "name",
        "partner_id",
        "note",
        "x_studio_nombre_del_pedido",
        "x_studio_nombre_de_pedido",
      ],
    });
    if (orders?.[0]?.id) {
      const tasks = await executeKw(
        "project.task",
        "search_read",
        [[["sale_order_id", "=", orders[0].id]]],
        { fields: ["id", "name", "description"], limit: 1, order: "id desc" }
      );
      return { order: orders[0], task: tasks?.[0] || null };
    }
  }

  throw new Error(`order_not_found:${args.order}`);
}

async function loadRows(args) {
  const listPath = args.file || args.excel;
  if (listPath) {
    const bytes = fs.readFileSync(listPath);
    const parsed = await parseListAttachmentBytes(bytes, path.basename(listPath));
    if (!parsed.ok) throw new Error(parsed.error || "list_parse_failed");
    return { rows: parsed.rows, meta: parsed };
  }
  if (args.rowsJson) {
    const raw = JSON.parse(fs.readFileSync(args.rowsJson, "utf8"));
    if (!Array.isArray(raw)) throw new Error("rows_json_must_be_array");
    return { rows: raw, meta: {} };
  }
  throw new Error("missing_file_or_rows_json");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const local = loadEnv(path.join(root, ".env"));
  const env = args.prod
    ? {
        ODOO_URL: local.ODOO_LIFEDEPORTES_PROD_URL,
        ODOO_DB: local.ODOO_LIFEDEPORTES_PROD_DB,
        ODOO_USERNAME: local.ODOO_LIFEDEPORTES_PROD_USERNAME,
        ODOO_PASSWORD: local.ODOO_LIFEDEPORTES_PROD_PASSWORD,
      }
    : {
        ODOO_URL: local.ODOO_LIFEDEPORTES_URL || local.ODOO_URL,
        ODOO_DB: local.ODOO_LIFEDEPORTES_DB || local.ODOO_DB,
        ODOO_USERNAME: local.ODOO_LIFEDEPORTES_USERNAME || local.ODOO_USERNAME,
        ODOO_PASSWORD: local.ODOO_LIFEDEPORTES_PASSWORD || local.ODOO_PASSWORD,
      };

  const { rows, meta } = await loadRows(args);

  const { executeKw } = await createOdooClient(env);
  const { order, task } = await resolveOrder(executeKw, args);
  const partnerName = Array.isArray(order.partner_id) ? order.partner_id[1] : "";
  const studioName = String(
    order.x_studio_nombre_del_pedido || order.x_studio_nombre_de_pedido || ""
  ).trim();
  const preservedTitle = extractTitleFromNoteHtml(order.note || "") || "";
  // Prioridad: --title explícito (orden staff) → H1 existente → studio → partner.
  // Nunca inventar nombre desde diseño/disciplina si ya hay nombre staff.
  const finalTitle =
    args.title ||
    preservedTitle ||
    studioName ||
    partnerName ||
    (meta.disciplina ? `Pedido ${meta.disciplina}` : null) ||
    "Pedido";
  const htmlOpts = {
    title: finalTitle,
    detailRows: rows,
    listLayout: meta.use_mirror ? "mirror_v1" : meta.layout || null,
    mirrorGrid: meta.use_mirror ? meta.grid : null,
    useMirror: Boolean(meta.use_mirror),
    sheetName: meta.sheetName || null,
    designNotes: meta.disciplina ? `Disciplina: ${meta.disciplina}` : null,
  };
  const html = buildOdooOrderNoteHtml(htmlOpts);

  // Solo note + description. Nunca renombrar SO / tarea / studio desde este script.
  await executeKw("sale.order", "write", [[order.id], { note: html }]);
  if (task?.id) {
    await executeKw("project.task", "write", [[task.id], { description: html }]);
  }

  let soSync = null;
  if (args.syncSo) {
    const buckets = countRowsBySoLineBucket(rows);
    const lines = await executeKw(
      "sale.order.line",
      "search_read",
      [[["order_id", "=", order.id]]],
      { fields: ["id", "name", "product_id"] }
    );
    const productIdByBucket = {};
    for (const line of lines || []) {
      const n = String(line.name || "").toLowerCase();
      const pid = Array.isArray(line.product_id) ? line.product_id[0] : line.product_id;
      if (/diseño|diseno/.test(n)) continue;
      if (/camiseta/.test(n) && /larg/.test(n)) productIdByBucket.camiseta_larga = pid;
      else if (/camiseta/.test(n)) productIdByBucket.camiseta_corta = pid;
      else if (/uniforme/.test(n) && /larg/.test(n)) productIdByBucket.uniforme_larga = pid;
      else if (/uniforme/.test(n)) productIdByBucket.uniforme_corta = pid;
    }
    soSync = await syncSoLinesFromProductMix(executeKw, order.id, rows, productIdByBucket);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        order_id: order.id,
        order_name: order.name,
        task_id: task?.id || null,
        row_count: rows.length,
        buckets: countRowsBySoLineBucket(rows),
        parse_report: meta.parse_report || null,
        so_sync: soSync,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
