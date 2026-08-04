import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseLifeExcelBytes } from "../kapso/functions/lib/parse_life_excel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testFile(filename) {
  console.log(`\n=== TESTING ${filename} ===`);
  const filePath = path.resolve(__dirname, filename);
  const bytes = fs.readFileSync(filePath);
  const parsed = await parseLifeExcelBytes(bytes, filename);

  console.log(`Total parsed rows: ${parsed.rows.length}`);
  parsed.rows.forEach((r, idx) => {
    console.log(`Row ${idx + 1}: nombre="${r.nombre || ""}" | talla="${r.talla || ""}" | genero="${r.genero || ""}" | rol="${r.rol || ""}" | num="${r.numero || ""}"`);
  });
}

async function main() {
  await testFile("anibal_2831/FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");
  await testFile("S02103_FORMATO_PEDIDO_LIFE_1__8__patricia_blanco.xlsx");
  await testFile("UNIFORMES RODEO JORGE DUEÑOS DEL BALON.xlsx");
}

main().catch(console.error);
