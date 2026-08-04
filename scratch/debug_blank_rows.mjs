import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeLifeExcelLayout } from "../kapso/functions/lib/parse_life_excel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const filePath = path.resolve(__dirname, "anibal_2831/FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");
  const bytes = fs.readFileSync(filePath);

  // We can read grid using ZIP XML or print layout
  console.log("Analyzing layout...");
}

main().catch(console.error);
