import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const filePath = path.resolve(__dirname, "anibal_2831/FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");
  const bytes = fs.readFileSync(filePath);
  const wb = XLSX.read(bytes, { type: "buffer" });

  console.log("SHEETS IN WORKBOOK:", wb.SheetNames);

  for (const sheetName of wb.SheetNames) {
    console.log(`\n================ SHEET: ${sheetName} ================`);
    const sheet = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row = [];
      let hasVal = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        const val = cell ? cell.v : null;
        if (val !== null && val !== "") hasVal = true;
        row.push(val);
      }
      if (hasVal) {
        console.log(`Row ${(r + 1).toString().padStart(2, " ")}:`, JSON.stringify(row));
      }
    }
  }
}

main().catch(console.error);
