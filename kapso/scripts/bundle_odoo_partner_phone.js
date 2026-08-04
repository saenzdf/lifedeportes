#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

export function stripModuleSyntax(src) {
  return src
    .replace(/^import[\s\S]*?from .+;\n?/gm, "")
    .replace(/^export /gm, "");
}

function bundleClassify() {
  const partnerLib = stripModuleSyntax(
    fs.readFileSync(path.join(root, "functions/lib/odoo_partner_phone.js"), "utf8")
  );
  const dossierLib = stripModuleSyntax(
    fs.readFileSync(path.join(root, "functions/lib/life_quote_dossier.js"), "utf8")
  );
  const hydrateLib = stripModuleSyntax(
    fs.readFileSync(path.join(root, "functions/lib/kapso_session_hydrate.js"), "utf8")
  );
  const handler = stripModuleSyntax(
    fs.readFileSync(path.join(root, "functions/classify_contact_odoo.js"), "utf8")
  );
  const out = `${partnerLib}\n\n${dossierLib}\n\n${hydrateLib}\n\n${handler}`;
  const outPath = path.join(root, "functions/classify_contact_odoo_deploy.js");
  fs.writeFileSync(outPath, out);
  console.log("Wrote", outPath, out.length, "chars");
}

function bundleOdooCreate() {
  const srcPath = path.join(root, "functions/odoo_create_lead_and_so.js");
  let src = fs.readFileSync(srcPath, "utf8");
  if (src.includes("function findPartnerByWaPhone")) {
    console.log("odoo_create_lead_and_so.js already bundled");
    return;
  }
  const lib = stripModuleSyntax(
    fs.readFileSync(path.join(root, "functions/lib/odoo_partner_phone.js"), "utf8")
  );
  const marker = "// <<COMMERCIAL_RULES_START>>";
  if (!src.includes(marker)) {
    throw new Error("Missing commercial rules marker in odoo_create_lead_and_so.js");
  }
  src = src.replace(marker, `${marker}\n${lib}\n`);
  fs.writeFileSync(srcPath, src);
  console.log("Injected partner phone lib into odoo_create_lead_and_so.js");
}

bundleClassify();
bundleOdooCreate();
