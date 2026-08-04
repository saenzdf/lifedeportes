#!/usr/bin/env node
/**
 * Bundle Kapso tools: buscar-pedido-odoo + corregir-pedido-odoo
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const fnDir = path.join(root, "functions");

const SHARED_LIBS = [
  "lib/order_detail_shared.js",
  "lib/odoo_partner_phone.js",
  "lib/build_odoo_order_note.js",
  "lib/odoo_attach_from_url.js",
  "lib/staff_order_contract.js",
  "lib/sale_order_spreadsheet.js",
  "lib/sync_order_draft_from_odoo.js",
  "lib/odoo_order_correction.js",
  "lib/staff_order_session.js",
];

function stripModuleSyntax(src) {
  return src
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*\n/gm, "")
    .replace(/^import\s+["'][^"']+["'];\s*\n/gm, "")
    .replace(/^export \{[^}]*\};?\s*\n?/gm, "")
    .replace(/^export /gm, "");
}

function braceDelta(line) {
  let delta = 0;
  for (const ch of line) {
    if (ch === "{") delta++;
    else if (ch === "}") delta -= 1;
  }
  return delta;
}

/** Omite definiciones top-level duplicadas (mantiene la primera). */
function dropDuplicateFunctions(src, declared) {
  const lines = src.split("\n");
  const out = [];
  let skipping = false;
  let skipDepth = 0;

  for (const line of lines) {
    if (skipping) {
      skipDepth += braceDelta(line);
      if (skipDepth <= 0) skipping = false;
      continue;
    }

    const fnMatch = line.match(/^(async )?function (\w+)\s*\(/);
    if (fnMatch) {
      const name = fnMatch[2];
      if (declared.has(name)) {
        skipping = true;
        skipDepth = braceDelta(line);
        if (skipDepth <= 0 && line.includes("}")) skipping = false;
        continue;
      }
      declared.add(name);
    }

    out.push(line);
  }

  return out.join("\n");
}

function bundleParts(handlerName) {
  const declared = new Set();
  const parts = [];

  for (const rel of SHARED_LIBS) {
    const raw = stripModuleSyntax(fs.readFileSync(path.join(fnDir, rel), "utf8"));
    parts.push(dropDuplicateFunctions(raw, declared));
  }

  const handlerRaw = stripModuleSyntax(
    fs.readFileSync(path.join(fnDir, `${handlerName}.js`), "utf8")
  );
  parts.push(dropDuplicateFunctions(handlerRaw, declared));

  return parts;
}

const bundles = [
  { out: "search_staff_order_deploy.js", handler: "search_staff_order" },
  { out: "apply_staff_order_correction_deploy.js", handler: "apply_staff_order_correction" },
];

for (const b of bundles) {
  const outPath = path.join(fnDir, b.out);
  const parts = bundleParts(b.handler);
  fs.writeFileSync(outPath, `${parts.join("\n\n")}\n`);
  console.log("Wrote", outPath, fs.statSync(outPath).size, "bytes");
}
