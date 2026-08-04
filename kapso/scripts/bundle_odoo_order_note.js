#!/usr/bin/env node
/**
 * Inyecta build_odoo_order_note en build_quote_payload.js y odoo_create_lead_and_so.js
 * (Kapso VM: sin import/export ESM).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const MARK_START = "// <<BUILD_ODOO_ORDER_NOTE_START>>";
const MARK_END = "// <<BUILD_ODOO_ORDER_NOTE_END>>";

const NOTE_STUB = `
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compact(value) {
  return String(value ?? "").replace(/\\s+/g, " ").trim();
}

function toDetailRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const nombre = compact(raw.nombre || raw.name || raw.nombre_uniforme || "");
  const numero = compact(raw.numero || raw.number || raw.dorsal || "");
  const talla = compact(raw.talla || raw.size || "");
  if (!nombre && !numero && !talla && !raw.nombre_vacio_impresion) return null;
  let grupo = compact(raw.grupo || raw.genero || "").toLowerCase();
  if (/fem|mujer/.test(grupo)) grupo = "femenino";
  else if (/masc|hombre/.test(grupo)) grupo = "masculino";
  else if (!grupo) grupo = "general";
  const comentario = compact(raw.comentario || "");
  let rol = compact(raw.rol || raw.role || raw.variante || "");
  if (!rol && comentario) rol = comentario;
  else if (comentario && rol && !rol.includes(comentario)) rol = rol + " · " + comentario;
  return {
    nombre,
    numero,
    talla,
    grupo,
    rol,
    manga: compact(raw.manga || ""),
    arquero: Boolean(raw.arquero) || /arquer/i.test(rol + comentario),
    camiseta: Boolean(raw.camiseta),
    uniforme: raw.uniforme !== false && !raw.camiseta,
    comentario,
    nombre_vacio_impresion: Boolean(raw.nombre_vacio_impresion),
  };
}
`.trim();

const libBody = fs
  .readFileSync(path.join(root, "functions/lib/build_odoo_order_note.js"), "utf8")
  .replace(/^import\s+.*?from\s+["'].*?["'];?\s*$/gm, "")
  .replace(/^\/\*\*[\s\S]*?\*\/\s*/m, "")
  .replace(/^export function /gm, "function ")
  .replace(/^export /gm, "")
  .replace(/function escapeHtml\(value\) \{[\s\S]*?\n\}\n+/m, "")
  .replace(/function compact\(value\) \{[\s\S]*?\n\}\n+/m, "");

function inject(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const block = `${MARK_START}\n${NOTE_STUB}\n\n${libBody.trim()}\n${MARK_END}`;
  let next;
  if (src.includes(MARK_START)) {
    next = src.replace(new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`), () => block);
  } else {
    const handlerIdx = src.indexOf("async function handler");
    if (handlerIdx < 0) throw new Error(`No handler in ${filePath}`);
    next = `${src.slice(0, handlerIdx)}${block}\n\n${src.slice(handlerIdx)}`;
  }
  // Guard: no import left inside markers
  const injected = next.slice(next.indexOf(MARK_START), next.indexOf(MARK_END));
  if (/\bimport\s/.test(injected)) {
    throw new Error(`Bundle still contains import in ${path.basename(filePath)}`);
  }
  fs.writeFileSync(filePath, next);
  console.log("Patched", path.basename(filePath));
}

inject(path.join(root, "functions/build_quote_payload.js"));
inject(path.join(root, "functions/odoo_create_lead_and_so.js"));
