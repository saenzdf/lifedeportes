#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "functions/_archive/order_commercial_rules.js");
const source = fs.readFileSync(sourcePath, "utf8").trim();
const start = "// <<COMMERCIAL_RULES_START>>";
const end = "// <<COMMERCIAL_RULES_END>>";

for (const relativePath of [
  "functions/build_quote_payload.js",
  "functions/odoo_create_lead_and_so.js",
]) {
  const filePath = path.join(root, relativePath);
  const current = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp(
    `${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    )}`
  );
  if (!pattern.test(current)) throw new Error(`Commercial rules markers missing: ${relativePath}`);
  const next = current.replace(pattern, `${start}\n${source}\n${end}`);
  fs.writeFileSync(filePath, next);
  console.log("Synced", relativePath);
}
