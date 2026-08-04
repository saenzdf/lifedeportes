#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function stripExports(src) {
  return src
    .replace(/^import .+ from .+;\n/gm, "")
    .replace(/^export /gm, "");
}

const emp = stripExports(fs.readFileSync(path.join(root, "functions/lib/nomina_employee_codes.js"), "utf8"));
const parseLib = stripExports(fs.readFileSync(path.join(root, "functions/lib/parse_attlog_dat.js"), "utf8"));
const handler = fs
  .readFileSync(path.join(root, "functions/parse_nomina_attlog.js"), "utf8")
  .replace(/^import .+;\n/gm, "")
  .replace(/^export \{[^}]+\};\n?/m, "");

const out = `${emp}\n\n${parseLib}\n\n${handler}`;
const outPath = path.join(root, "functions/parse_nomina_attlog_deploy.js");
fs.writeFileSync(outPath, out);
console.log("Wrote", outPath, out.length, "chars");
