import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseLifeExcelBytes } from "../kapso/functions/lib/parse_life_excel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const filePath = path.resolve(__dirname, "anibal_2831/FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");
  const bytes = fs.readFileSync(filePath);

  const res = await parseLifeExcelBytes(bytes, "FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");
  console.log("=== RAW PARSER OUTPUT ===");
  console.log("Headers:", res.sheet_headers || res.headers);
  console.log("Rows:", JSON.stringify(res.rows, null, 2));
}

main().catch(console.error);
