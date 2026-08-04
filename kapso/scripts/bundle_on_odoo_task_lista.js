#!/usr/bin/env node
/**
 * Bundle on-odoo-task-lista for Kapso CF worker.
 * Output: kapso/functions/on_odoo_task_lista_deploy.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const fnDir = path.join(root, "functions");

function stripModuleSyntax(src) {
  return src
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*\n/gm, "")
    .replace(/^import\s+["'][^"']+["'];\s*\n/gm, "")
    .replace(/^export \{[^}]*\};?\s*\n?/gm, "")
    .replace(/^export /gm, "");
}

function readLib(rel) {
  return stripModuleSyntax(fs.readFileSync(path.join(fnDir, rel), "utf8"));
}

const parts = [
  readLib("lib/order_detail_shared.js"),
  readLib("lib/list_section_products.js"),
  readLib("lib/parse_life_excel.js"),
  readLib("lib/parse_family_day_docx.js"),
  readLib("lib/parse_list_bytes.js"),
  readLib("lib/fflate_browser.js"),
  readLib("lib/parse_life_pdf.js"),
  readLib("lib/build_odoo_order_note.js"),
  readLib("lib/ensure_so_commercial_lines.js"),
  readLib("lib/vision_lista_gemini.js"),
  // stripPhoneFromHtml lives in apply_lista_so_note — include before apply_lista_from_task
  readLib("lib/apply_lista_so_note.js"),
  readLib("lib/apply_lista_from_task.js"),
  stripModuleSyntax(fs.readFileSync(path.join(fnDir, "on_odoo_task_lista.js"), "utf8")),
];

const out = path.join(fnDir, "on_odoo_task_lista_deploy.js");
fs.writeFileSync(out, parts.join("\n\n") + "\n");
console.log("Wrote", out, fs.statSync(out).size, "bytes");
