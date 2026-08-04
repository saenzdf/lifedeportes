#!/usr/bin/env node
/**
 * Volcar lista de pedido (Excel o Word) → project.task.description + sale.order.note
 * para tareas en Coordinación Diseño sin estado «Changes Requested».
 *
 * Uso:
 *   node kapso/scripts/bulk_sync_lista_coordinacion.js --dry-run --prod
 *   node kapso/scripts/bulk_sync_lista_coordinacion.js --prod
 *   node kapso/scripts/bulk_sync_lista_coordinacion.js --prod --limit=5
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseListAttachmentBytes } from "../functions/lib/parse_list_bytes.js";
import { pickListAttachment } from "../functions/lib/pick_odoo_list_attachment.js";
import { buildOdooOrderNoteHtml } from "../functions/lib/build_odoo_order_note.js";
import { countRowsBySoLineBucket, createOdooClient } from "../functions/lib/odoo_order_correction.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const COORD_STAGE_IDS = [31, 35];
const CHANGES_REQUESTED_STATE = "02_changes_requested";

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
  const out = {
    prod: argv.includes("--prod"),
    dryRun: argv.includes("--dry-run"),
    limit: null,
  };
  for (const a of argv) {
    if (a.startsWith("--limit=")) out.limit = Number(a.split("=")[1]);
  }
  return out;
}

function b64ToBytes(b64) {
  const buf = Buffer.from(String(b64 || ""), "base64");
  return new Uint8Array(buf);
}

async function downloadAttachmentBytes(executeKw, attId) {
  const rows = await executeKw("ir.attachment", "read", [[attId]], { fields: ["name", "datas"] });
  const row = rows?.[0];
  if (!row?.datas) throw new Error("attachment_empty");
  return { name: row.name, bytes: b64ToBytes(row.datas) };
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

  const { executeKw } = await createOdooClient(env);

  const domain = [
    ["stage_id", "in", COORD_STAGE_IDS],
    ["active", "=", true],
    ["state", "!=", CHANGES_REQUESTED_STATE],
    ["state", "!=", "1_canceled"],
  ];

  const tasks = await executeKw("project.task", "search_read", [domain], {
    fields: ["id", "name", "state", "sale_order_id", "description", "x_studio_nombre_del_pedido"],
    order: "id desc",
    limit: args.limit || 500,
  });

  const report = {
    dry_run: args.dryRun,
    total_candidates: tasks.length,
    updated: [],
    skipped: [],
    errors: [],
  };

  for (const task of tasks) {
    const soId = Array.isArray(task.sale_order_id) ? task.sale_order_id[0] : task.sale_order_id;
    const entry = {
      task_id: task.id,
      task_name: task.name,
      state: task.state,
      sale_order_id: soId || null,
    };

    try {
      if (!soId) {
        report.skipped.push({ ...entry, reason: "sin_sale_order" });
        continue;
      }

      const att = await pickListAttachment(executeKw, task.id, soId);
      if (!att) {
        report.skipped.push({ ...entry, reason: "sin_lista_adjunto" });
        continue;
      }

      const orders = await executeKw("sale.order", "read", [[soId]], {
        fields: ["id", "name", "partner_id", "note"],
      });
      const order = orders?.[0];
      if (!order?.id) {
        report.skipped.push({ ...entry, reason: "sale_order_not_found" });
        continue;
      }

      const { name: fileName, bytes } = await downloadAttachmentBytes(executeKw, att.id);
      let parsed = await parseListAttachmentBytes(bytes, fileName);
      if (!parsed.ok || !parsed.rows?.length) {
        report.errors.push({
          ...entry,
          attachment: att.name,
          error: parsed.error || "excel_parse_empty",
        });
        continue;
      }

      const partnerName = Array.isArray(order.partner_id) ? order.partner_id[1] : "";
      const title =
        String(task.x_studio_nombre_del_pedido || "").trim() ||
        partnerName ||
        task.name.replace(/^\[[^\]]+\]\s*/, "");

      const html = buildOdooOrderNoteHtml({
        title,
        detailRows: parsed.rows,
        listLayout: parsed.layout || null,
        designNotes: parsed.disciplina ? `Disciplina: ${parsed.disciplina}` : null,
      });

      entry.order_name = order.name;
      entry.attachment = att.name;
      entry.attachment_source = att.source;
      entry.row_count = parsed.rows.length;
      entry.buckets = countRowsBySoLineBucket(parsed.rows);
      entry.parse_report = parsed.parse_report?.summary_text || null;

      if (args.dryRun) {
        report.updated.push({ ...entry, dry_run: true });
        continue;
      }

      await executeKw("sale.order", "write", [[order.id], { note: html }]);
      await executeKw("project.task", "write", [[task.id], { description: html }]);
      report.updated.push(entry);
    } catch (err) {
      report.errors.push({ ...entry, error: String(err?.message || err) });
    }
  }

  const outPath = path.join(root, "kapso/scratch/bulk_sync_lista_coordinacion_report.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        dry_run: report.dry_run,
        candidates: report.total_candidates,
        updated: report.updated.length,
        skipped: report.skipped.length,
        errors: report.errors.length,
        report_file: outPath,
      },
      null,
      2
    )
  );

  if (report.skipped.length) {
    console.log("\nOmitidos:");
    for (const s of report.skipped) console.log(`  ${s.task_id} ${s.task_name} — ${s.reason}`);
  }
  if (report.errors.length) {
    console.log("\nErrores:");
    for (const e of report.errors) console.log(`  ${e.task_id} ${e.task_name} — ${e.error}`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
