#!/usr/bin/env node
/**
 * Audita y re-sincroniza listas de detalle (comentarios, pantaloneta, arquero).
 *
 *   node kapso/scripts/audit_resync_lista_detalle.js --prod
 *   node kapso/scripts/audit_resync_lista_detalle.js --prod --fix
 *   node kapso/scripts/audit_resync_lista_detalle.js --prod --task=2357 --fix
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseListAttachmentBytes } from "../functions/lib/parse_list_bytes.js";
import { pickListAttachment } from "../functions/lib/pick_odoo_list_attachment.js";
import { buildOdooOrderNoteHtml } from "../functions/lib/build_odoo_order_note.js";
import { createOdooClient } from "../functions/lib/odoo_order_correction.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const REPORT_PATH = path.join(root, "kapso/scratch/bulk_sync_lista_coordinacion_report.json");

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
  const out = { prod: argv.includes("--prod"), fix: argv.includes("--fix"), taskId: null };
  for (const a of argv) {
    if (a.startsWith("--task=")) out.taskId = Number(a.split("=")[1]);
  }
  return out;
}

function b64ToBytes(b64) {
  return new Uint8Array(Buffer.from(String(b64 || ""), "base64"));
}

function normHtml(html) {
  return String(html || "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

async function parseListBytes(bytes, fileName) {
  return parseListAttachmentBytes(bytes, fileName);
}

function auditRows(rows) {
  const issues = [];
  const withComment = rows.filter((r) => r.comentario);
  const pant = rows.filter((r) => r.pantaloneta);
  const arq = rows.filter((r) => r.arquero);

  for (const r of withComment) {
    const key = `${r.nombre} #${r.numero || "?"}`;
    if (r.pantaloneta && r.camiseta) {
      issues.push({ type: "pantaloneta_con_camiseta", row: key, comentario: r.comentario });
    }
    if (r.pantaloneta && r.uniforme) {
      issues.push({ type: "pantaloneta_con_uniforme", row: key, comentario: r.comentario });
    }
    if (!r.rol?.includes(r.comentario.split(" · ")[0]) && !r.pantaloneta) {
      const frag = r.comentario.split(" · ")[0];
      if (frag && r.rol && !r.rol.includes(frag)) {
        issues.push({ type: "comentario_no_en_rol", row: key, comentario: r.comentario, rol: r.rol });
      }
    }
  }

  return { withComment, pant, arq, issues };
}

function commentFragmentsInHtml(html, rows) {
  const missing = [];
  for (const r of rows) {
    if (!r.comentario) continue;
    for (const frag of r.comentario.split(" · ").map((s) => s.trim()).filter(Boolean)) {
      if (/^solo\s*pantaloneta$/i.test(frag)) continue;
      const needle = frag.length > 12 ? frag.slice(0, 12) : frag;
      if (!html.includes(needle)) {
        missing.push({ nombre: r.nombre, numero: r.numero, fragment: frag });
      }
    }
  }
  return missing;
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

  const bulk = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
  let tasks = bulk.updated || [];
  if (args.taskId) tasks = tasks.filter((t) => t.task_id === args.taskId);

  const { executeKw } = await createOdooClient(env);
  const report = { audited: [], fixed: [], errors: [] };

  for (const hit of tasks) {
    const entry = {
      task_id: hit.task_id,
      task_name: hit.task_name,
      order_name: hit.order_name,
    };
    try {
      const taskRows = await executeKw("project.task", "read", [[hit.task_id]], {
        fields: ["id", "description", "sale_order_id", "x_studio_nombre_del_pedido", "partner_id"],
      });
      const task = taskRows?.[0];
      const soId = Array.isArray(task.sale_order_id) ? task.sale_order_id[0] : hit.sale_order_id;
      const orders = await executeKw("sale.order", "read", [[soId]], {
        fields: ["id", "name", "partner_id", "note"],
      });
      const order = orders[0];
      const att = await pickListAttachment(executeKw, hit.task_id, soId);
      if (!att) throw new Error("sin_lista");

      const attData = await executeKw("ir.attachment", "read", [[att.id]], { fields: ["datas"] });
      const parsed = await parseListBytes(b64ToBytes(attData[0].datas), att.name);
      if (!parsed.ok || !parsed.rows?.length) throw new Error(parsed.error || "parse_failed");

      const partnerName = Array.isArray(order.partner_id) ? order.partner_id[1] : "";
      const title =
        String(task.x_studio_nombre_del_pedido || "").trim() ||
        partnerName ||
        hit.task_name.replace(/^\[[^\]]+\]\s*/, "");

      const expectedHtml = buildOdooOrderNoteHtml({
        title,
        detailRows: parsed.rows,
        listLayout: parsed.layout || null,
        designNotes: parsed.disciplina ? `Disciplina: ${parsed.disciplina}` : null,
      });

      const audit = auditRows(parsed.rows);
      const missingInHtml = commentFragmentsInHtml(expectedHtml, parsed.rows);
      const htmlMatch = normHtml(task.description) === normHtml(expectedHtml);
      const noteMatch = normHtml(order.note) === normHtml(expectedHtml);

      entry.sheet = parsed.sheetName;
      entry.rows = parsed.rows.length;
      entry.comentarios = audit.withComment.length;
      entry.pantaloneta = audit.pant.length;
      entry.arqueros = audit.arq.map((r) => `${r.nombre} #${r.numero} (${r.comentario || r.rol || ""})`);
      entry.parse_issues = audit.issues;
      entry.missing_comment_fragments = missingInHtml;
      entry.html_stale = !htmlMatch || !noteMatch;

      if (entry.html_stale || audit.issues.length || missingInHtml.length) {
        entry.needs_fix = true;
      }

      if (args.fix && entry.needs_fix) {
        await executeKw("sale.order", "write", [[order.id], { note: expectedHtml }]);
        await executeKw("project.task", "write", [[task.id], { description: expectedHtml }]);
        entry.fixed = true;
        report.fixed.push(entry);
      }

      report.audited.push(entry);
    } catch (e) {
      report.errors.push({ ...entry, error: String(e.message || e) });
    }
  }

  const outPath = path.join(root, "kapso/scratch/audit_lista_detalle_report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

  const stale = report.audited.filter((a) => a.needs_fix);
  console.log(
    JSON.stringify(
      {
        audited: report.audited.length,
        needs_fix: stale.length,
        fixed: report.fixed.length,
        errors: report.errors.length,
        report_file: outPath,
      },
      null,
      2
    )
  );

  for (const a of stale) {
    console.log(`\n${a.task_name} (${a.order_name})`);
    if (a.html_stale) console.log("  - HTML desactualizado vs parser actual");
    if (a.pantaloneta) console.log(`  - pantaloneta: ${a.pantaloneta}`);
    if (a.arqueros?.length) console.log(`  - arqueros: ${a.arqueros.join("; ")}`);
    for (const m of a.missing_comment_fragments || []) {
      console.log(`  - comentario faltante: ${m.nombre} #${m.numero}: «${m.fragment}»`);
    }
    for (const i of a.parse_issues || []) {
      console.log(`  - ${i.type}: ${i.row}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
