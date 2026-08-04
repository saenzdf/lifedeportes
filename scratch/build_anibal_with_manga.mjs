import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatManga(m) {
  const v = String(m || "").trim().toUpperCase();
  if (v === "C" || v.includes("CORTA")) return "Corta";
  if (v === "L" || v.includes("LARGA")) return "Larga";
  if (v === "S" || v.includes("SISA")) return "Sisa";
  return v || "Corta";
}

const players = [
  { num: "6", nombre: "DIEGO", talla: "XXL", manga: "C", comentario: "", completo: "ALVAREZ DIAZ DIEGO ALEJANDRO" },
  { num: "8", nombre: "ALEXIS", talla: "M", manga: "C", comentario: "", completo: "ANZOLA CASTAÑEDA ALEXIS" },
  { num: "12", nombre: "JOSE", talla: "L", manga: "C", comentario: "", completo: "CABALLERO HERRERA JOSE MANUEL" },
  { num: "20", nombre: "CARLOS", talla: "XL", manga: "C", comentario: "", completo: "CARDENAS OSORIO CARLOS EDUARDO" },
  { num: "14", nombre: "YACO", talla: "XL", manga: "L", comentario: "Uniforme arquero con camiseta manga larga, con diseño adjunto", completo: "CARDENAS OSORIO YEZID ALBERTO", arquero: true },
  { num: "5", nombre: "OMAR", talla: "M", manga: "C", comentario: "", completo: "CORTES LOPEZ OMAR" },
  { num: "50", nombre: "SOFI", talla: "S", manga: "C", comentario: "", completo: "GARCIA MORANTES JOHN WILLIAM" },
  { num: "15", nombre: "YAYO", talla: "XL", manga: "C", comentario: "", completo: "GONZALEZ JAIR" },
  { num: "11", nombre: "POCHO", talla: "L", manga: "C", comentario: "", completo: "HERNANDEZ RAMOS LUIS ALFONSO" },
  { num: "2", nombre: "HERNAN", talla: "L", manga: "C", comentario: "", completo: "HERRERA ECHEVERRIA HERNAN" },
  { num: "21", nombre: "GERMAN", talla: "M", manga: "C", comentario: "", completo: "LAZARO GERMAN DARIO" },
  { num: "3", nombre: "PEDRO", talla: "M", manga: "C", comentario: "", completo: "LOZANO CORDOBA PEDRO EMIGDIO" },
  { num: "66", nombre: "PIRI", talla: "M", manga: "C", comentario: "", completo: "MORENO JORGE ENRIQUE" },
  { num: "7", nombre: "OCHOA", talla: "L", manga: "C", comentario: "", completo: "OCHOA GOMEZ JOSE ROBERTO" },
  { num: "16", nombre: "CESAR", talla: "L", manga: "C", comentario: "", completo: "PADILLA MURCIA CESAR AUGUSTO" },
  { num: "96", nombre: "EDDIE", talla: "M", manga: "C", comentario: "", completo: "PESA EDGAR" },
  { num: "17", nombre: "RIOS", talla: "M", manga: "C", comentario: "", completo: "RIOS TORRES EDGAR H" },
  { num: "4", nombre: "WILLIAM", talla: "L", manga: "C", comentario: "", completo: "RUBIANO RUEDA WILLIAM" },
  { num: "71", nombre: "ANIBAL", talla: "L", manga: "C", comentario: "", completo: "TORRES QUEVEDO ANBAL FERNANDO" },
  { num: "9", nombre: "DANNY", talla: "XXL, Pant XL", manga: "C", comentario: "Talla camiseta XXL, pantaloneta XL", completo: "VANEGAS SALAS DANNY ALEXANDER" },
  { num: "56", nombre: "CHEPE", talla: "XL", manga: "C", comentario: "", completo: "CHACON JOSE EDER" },
  { num: "29", nombre: "EDUAR", talla: "L", manga: "C", comentario: "", completo: "HURTADO CUESTO EDUAR FERNANDO" },
  { num: "18", nombre: "JOHN", talla: "L", manga: "C", comentario: "", completo: "GUTIERREZ TRASLAVIÑA JOHN" }
];

async function main() {
  let html = `<h1>ANIBAL</h1>

<hr>

<h2>Resumen de uniformes</h2>
<ul>
  <li><strong>Uniforme de Fútbol (23 u.):</strong> 22 Manga corta + 1 Manga larga (Arquero)</li>
</ul>

<hr>

<h2>Resumen por producto y manga</h2>
<ul>
  <li><strong>Jugadores de Campo (22 u.):</strong> Manga corta</li>
  <li><strong>Arquero (1 u.):</strong> YACO #14 - Manga larga (Uniforme arquero con camiseta manga larga, con diseño adjunto)</li>
</ul>

<hr>

<h2>Lista de jugadores (Masculino) — Uniforme (conjunto)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre en uniforme</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:center; padding: 8px;">Manga</th>
      <th style="text-align:left; padding: 8px;">Comentario</th>
      <th style="text-align:left; padding: 8px;">Nombre completo / Registro</th>
    </tr>
  </thead>
  <tbody>\n`;

  players.forEach((r, idx) => {
    const bg = idx % 2 === 1 ? ' style="background-color:#f9f9f9;"' : "";
    let comment = r.comentario || "";
    if (r.arquero && !comment.toLowerCase().includes("arquero")) {
      comment = comment ? `Arquero · ${comment}` : "Arquero";
    }
    const mangaStr = formatManga(r.manga);
    html += `    <tr${bg}><td style="text-align:center; padding: 8px;">${escapeHtml(r.num)}</td><td style="padding: 8px;">${escapeHtml(r.nombre)}</td><td style="text-align:center; padding: 8px;">${escapeHtml(r.talla)}</td><td style="text-align:center; padding: 8px;">${escapeHtml(mangaStr)}</td><td style="padding: 8px;">${escapeHtml(comment)}</td><td style="padding: 8px;">${escapeHtml(r.completo)}</td></tr>\n`;
  });

  html += `  </tbody>
</table>`;

  console.log("=== HTML NOTE WITH MANGA COLUMN ===");
  console.log(html);
  fs.writeFileSync("scratch/anibal_manga_note.html", html);
}

main().catch(console.error);
