import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseLifeExcelBytes } from "../kapso/functions/lib/parse_life_excel.js";
import {
  buildFormularioPayload,
  payloadToFillInput,
} from "../kapso/functions/lib/payload_formulario.js";
import { applyLifeFormularioFill } from "../kapso/functions/lib/sale_order_spreadsheet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // 1. Read Excel and parse
  const excelPath = path.resolve(__dirname, "anibal_2831/FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");
  const bytes = fs.readFileSync(excelPath);
  const parsed = await parseLifeExcelBytes(bytes, "FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");

  // Filter out blank template rows (only keep valid 23 rows)
  parsed.rows = parsed.rows.filter((r) => r.talla || r.nombre);

  // 2. Build Formulario Payload
  const payload = buildFormularioPayload({
    detail: parsed,
    commercialLines: [{ product_text: "Uniforme de Fútbol", quantity: 23, category: "uniforme" }],
    meta: { title: "ANIBAL", order_name: "S02831" },
  });

  console.log("PAYLOAD METRIC:", {
    units_count: payload.units.length,
    lines_count: payload.lines.length,
    disciplina: payload.attributes?.disciplina,
    color_medias: payload.attributes?.color_medias,
  });

  // 3. Read raw snapshot of spreadsheet 51
  const rawJson = fs.readFileSync(path.resolve(__dirname, "anibal_spreadsheet_51_raw.json"), "utf8");
  const snap = JSON.parse(rawJson);

  // 4. Apply Fill
  const fillInput = payloadToFillInput(payload);
  const { snapshot: filledSnap, filled, mode } = applyLifeFormularioFill(snap, {
    ...fillInput,
    orderLines: [{ id: 1, name: "Uniforme de Fútbol", product_uom_qty: 23 }],
  });

  console.log("FILL RESULT:", { filled, mode });

  // 5. Inspect filled cells in Formulario sheet
  const formSheet = (filledSnap.sheets || []).find((s) => /formulario|aprobaci/i.test(s.name || "")) || filledSnap.sheets[0];
  console.log("\nFILLED FORMULARIO CELL SAMPLES (C2:F12):");
  for (let r = 2; r <= 12; r++) {
    console.log(`Row ${r}:`, {
      C: formSheet.cells[`C${r}`]?.content || null,
      D: formSheet.cells[`D${r}`]?.content || null,
      E: formSheet.cells[`E${r}`]?.content || null,
      F: formSheet.cells[`F${r}`]?.content || null,
    });
  }

  fs.writeFileSync("scratch/anibal_spreadsheet_51_filled.json", JSON.stringify(filledSnap, null, 2));
}

main().catch(console.error);
