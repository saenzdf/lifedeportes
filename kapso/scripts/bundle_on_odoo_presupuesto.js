#!/usr/bin/env node
/**
 * Bundle on-odoo-presupuesto for Kapso CF worker (inline lista libs).
 * Output: kapso/functions/on_odoo_presupuesto_deploy.js
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
  readLib("lib/apply_lista_so_note.js"),
  stripModuleSyntax(fs.readFileSync(path.join(fnDir, "on_odoo_presupuesto.js"), "utf8")),
];

const out = path.join(fnDir, "on_odoo_presupuesto_deploy.js");
fs.writeFileSync(out, parts.join("\n\n") + "\n");
console.log("Wrote", out, fs.statSync(out).size, "bytes");
