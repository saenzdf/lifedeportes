import assert from "assert";
import { parseLifeExcelBytes } from "../kapso/functions/lib/parse_life_excel.js";

// Create an in-memory workbook simulating Andrea Triatlón / standard Excel format
// 6 male players with names + sizes, pre-printed numbers 1..25, and 1 female player
import XLSX from "xlsx";

function createMockAndreaExcel() {
  const data = [
    ["FORMATO PEDIDO LIFE"],
    ["CLIENTE:", "ANDREA TRIATLON"],
    [],
    ["No.", "Nombre en Uniforme", "Talla", "Manga C/L", "MAS", "FEM", "Camiseta", "Uniforme", "Comentario"],
    [1, "CARLOS", "M", "C", "X", "", "", "X", ""],
    [2, "ANDRES", "L", "C", "X", "", "", "X", ""],
    [3, "FELIPE", "M", "C", "X", "", "", "X", ""],
    [4, "JUAN", "XL", "C", "X", "", "", "X", ""],
    [5, "SANTIAGO", "M", "C", "X", "", "", "X", ""],
    [6, "PEDRO", "L", "C", "X", "", "", "X", ""],
    [7, "", "", "", "", "", "", "", ""], // Pre-printed template row 7
    [8, "", "", "", "", "", "", "", ""], // Pre-printed template row 8
    [9, "", "", "", "", "", "", "", ""], // Pre-printed template row 9
    [10, "", "", "", "", "", "", "", ""], // Pre-printed template row 10
    [11, "", "", "", "", "", "", "", ""], // Pre-printed template row 11
    [12, "", "", "", "", "", "", "", ""], // Pre-printed template row 12
    [13, "ANDREA", "S", "C", "", "X", "X", "", ""], // 1 Female player
    [14, "", "", "", "", "", "", "", ""], // Pre-printed template row 14
    [15, "", "", "", "", "", "", "", ""], // Pre-printed template row 15
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function runTest() {
  console.log("=== RUNNING ANDREA TRIATLON PARSER TEST ===");
  const buffer = createMockAndreaExcel();
  const parsed = await parseLifeExcelBytes(buffer, "ANDREA_TRIATLON.xlsx");

  console.log("PARSED TOTAL ROWS:", parsed.rows.length);
  parsed.rows.forEach((r, i) => {
    console.log(`Row ${i + 1}: nombre="${r.nombre}" | talla="${r.talla}" | genero="${r.genero}" | rol="${r.rol}"`);
  });

  assert.strictEqual(parsed.rows.length, 7, `Expected exactly 7 rows (6 male + 1 female), got ${parsed.rows.length}`);
  const masc = parsed.rows.filter((r) => r.genero === "masculino" || r.mas === "x");
  const fem = parsed.rows.filter((r) => r.genero === "femenino" || r.fem === "x");

  assert.strictEqual(masc.length, 6, `Expected 6 male rows, got ${masc.length}`);
  assert.strictEqual(fem.length, 1, `Expected 1 female row, got ${fem.length}`);
  console.log("✅ TEST PASSED PERFECTLY!");
}

runTest().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
