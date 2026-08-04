import fs from 'fs';
import path from 'path';
import { parseListAttachmentBytes } from '../kapso/functions/lib/parse_list_bytes.js';

async function main() {
  const listPath = "scratch/S02103_FORMATO_PEDIDO_LIFE_1__8__patricia_blanco.xlsx";
  const bytes = fs.readFileSync(listPath);
  const parsed = await parseListAttachmentBytes(bytes, path.basename(listPath));
  
  console.log("Parsed status:", parsed.ok);
  if (!parsed.ok) {
    console.error("Error:", parsed.error);
    return;
  }
  
  console.log("Parsed meta:", {
    layout: parsed.layout,
    sheet_name: parsed.sheet_name,
    disciplina: parsed.disciplina,
    counts: parsed.counts
  });
  
  console.log("\n--- Parsed Rows (Total:", parsed.rows.length, ") ---");
  console.log(JSON.stringify(parsed.rows, null, 2));
}

main().catch(console.error);
