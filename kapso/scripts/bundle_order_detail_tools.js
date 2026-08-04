#!/usr/bin/env node
/**
 * Bundle order-detail Kapso tools (inline libs for worker deploy).
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

function readHandler(name) {
  return stripModuleSyntax(fs.readFileSync(path.join(fnDir, `${name}.js`), "utf8"));
}

const shared = readLib("lib/order_detail_shared.js");
const listSections = readLib("lib/list_section_products.js");
const textLines = readLib("lib/parse_life_text_lines.js");
const excel = readLib("lib/parse_life_excel.js");
const wordDocx = readLib("lib/parse_family_day_docx.js");
const parseList = readLib("lib/parse_list_bytes.js");
const mergeLib = readLib("lib/merge_order_detail_draft.js");

const bundles = [
  {
    out: "parse_order_detail_text_deploy.js",
    parts: [shared, listSections, textLines, mergeLib, readHandler("parse_order_detail_text")],
  },
  {
    out: "parse_order_detail_excel_deploy.js",
    parts: [shared, excel, wordDocx, parseList, listSections, mergeLib, readHandler("parse_order_detail_excel")],
  },
  {
    out: "classify_order_attachments_deploy.js",
    parts: [shared, readHandler("classify_order_attachments")],
  },
  {
    out: "register_order_attachments_deploy.js",
    parts: [shared, readHandler("register_order_attachments")],
  },
  {
    out: "merge_order_detail_draft_deploy.js",
    parts: [shared, listSections, mergeLib, readHandler("merge_order_detail_draft")],
  },
  {
    out: "parse_order_detail_image_deploy.js",
    parts: [shared, listSections, textLines, mergeLib, readHandler("parse_order_detail_image")],
  },
  {
    out: "parse_order_detail_pdf_deploy.js",
    parts: [
      shared,
      listSections,
      textLines,
      mergeLib,
      readLib("lib/fflate_browser.js"),
      readLib("lib/parse_life_pdf.js"),
      readHandler("parse_order_detail_pdf"),
    ],
  },
];

for (const b of bundles) {
  const outPath = path.join(fnDir, b.out);
  const out = `${b.parts.join("\n\n")}\n`;
  fs.writeFileSync(outPath, out);
  console.log("Wrote", outPath, out.length, "chars");
}
