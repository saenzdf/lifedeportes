
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseLifeExcelBytes } from "../kapso/functions/lib/parse_life_excel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const filePath = path.resolve(__dirname, "anibal_2831/FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");
  const bytes = fs.readFileSync(filePath);
  const res = await parseLifeExcelBytes(bytes, "FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");
  for (const r of res.rows) {
    console.log(`#${r.numero} | ${r.nombre} | ${r.talla} | ${r.rol} | ${r.comentario}`);
  }
}
main();
