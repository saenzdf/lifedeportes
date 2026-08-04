import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseLifeExcelBytes } from "../kapso/functions/lib/parse_life_excel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  const filePath = path.resolve(__dirname, "anibal_2831/FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");
  const bytes = fs.readFileSync(filePath);

  const parsed = await parseLifeExcelBytes(bytes, "FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");

  // Filter out blank template rows (where nombre starts with Camiseta # and talla is empty)
  const validRows = parsed.rows.filter((r) => {
    if (!r.talla && (!r.nombre || /^Camiseta #\d+/i.test(r.nombre)) && !r.comentario && !r.impresion_trasera) {
      return false;
    }
    return true;
  });

  let html = `<h1>ANIBAL</h1>

<hr>

<h2>Resumen de uniformes</h2>
<ul>
  <li><strong>Uniforme de Fútbol (23 u.):</strong> 23 Masculino (22 jugadores + 1 arquero)</li>
</ul>

<hr>

<h2>Resumen por producto y manga</h2>
<ul>
  <li><strong>Arquero:</strong> 1 u. (YACO #14 - Uniforme arquero con camiseta manga larga, con diseño adjunto)</li>
</ul>

<hr>

<h2>Lista de jugadores (Masculino) — Uniforme (conjunto)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre en uniforme</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:left; padding: 8px;">Comentario</th>
    </tr>
  </thead>
  <tbody>\n`;

  validRows.forEach((r, idx) => {
    const bg = idx % 2 === 1 ? ' style="background-color:#f9f9f9;"' : "";
    let comment = (r.comentario || "").replace(/^Trasera:\s*/i, "").trim();
    if (r.arquero && !comment.toLowerCase().includes("arquero")) {
      comment = comment ? `Arquero · ${comment}` : "Arquero";
    }
    html += `    <tr${bg}><td style="text-align:center; padding: 8px;">${escapeHtml(r.numero)}</td><td style="padding: 8px;">${escapeHtml(r.nombre)}</td><td style="text-align:center; padding: 8px;">${escapeHtml(r.talla)}</td><td style="padding: 8px;">${escapeHtml(comment)}</td></tr>\n`;
  });

  html += `  </tbody>
</table>`;

  console.log("=== TRUE ANIBAL HTML NOTE ===");
  console.log(html);
  fs.writeFileSync("scratch/clean_anibal_note.html", html);
}

main().catch(console.error);
