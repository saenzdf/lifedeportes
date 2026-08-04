import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseLifeExcelBytes } from "../kapso/functions/lib/parse_life_excel.js";
import { resolveOrderNoteHtml } from "../kapso/functions/lib/build_odoo_order_note.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const filePath = path.resolve(__dirname, "anibal_2831/FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");
  const bytes = fs.readFileSync(filePath);

  const parsed = await parseLifeExcelBytes(bytes, "FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");

  const vars = {
    order_draft: {
      title: "ANIBAL",
      detail: parsed,
      commercial: {
        lines: [
          { name: "Uniforme de Fútbol", quantity: 23, category: "uniforme" }
        ]
      }
    }
  };

  const html = resolveOrderNoteHtml(vars);
  console.log("=== GENERATED FIXED HTML NOTE ===");
  console.log(html);
}

main().catch(console.error);
