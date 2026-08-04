#!/usr/bin/env node
/**
 * S02564 / Daniel Beltran — lista en SO + tarea, líneas de producto, arquero sin cargo aparte.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { parseLifeExcelBytes } from "../functions/lib/parse_life_excel.js";
import { buildOdooOrderNoteHtml, countVariantSummary } from "../functions/lib/build_odoo_order_note.js";
import {
  applyOrderCorrection,
  countRowsBySoLineBucket,
  createOdooClient,
  syncSoLinesFromProductMix,
} from "../functions/lib/odoo_order_correction.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const ORDER_ID = 2562;
const TASK_ID = 2358;

const PRODUCT_BY_BUCKET = {
  uniforme_corta: 12409,
  uniforme_larga: 12415,
  camiseta_corta: 11788,
  camiseta_larga: 11806,
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function patchRows(rows) {
  return rows.map((row) => {
    if (row.grupo === "masculino" && row.numero === "99" && /^david$/i.test(String(row.nombre || "").trim())) {
      return {
        ...row,
        talla: "M",
        arquero: true,
        camiseta: false,
        uniforme: true,
        rol: "Uniforme",
        comentario: row.comentario || "",
      };
    }
    return row;
  });
}

async function main() {
  const useProd = process.argv.includes("--prod") || true;
  const local = loadEnv(path.join(root, ".env"));
  const env = {
    ODOO_URL: local.ODOO_LIFEDEPORTES_PROD_URL,
    ODOO_DB: local.ODOO_LIFEDEPORTES_PROD_DB,
    ODOO_USERNAME: local.ODOO_LIFEDEPORTES_PROD_USERNAME,
    ODOO_PASSWORD: local.ODOO_LIFEDEPORTES_PROD_PASSWORD,
  };

  const excelPath = path.join(root, "Copia de FORMATO PEDIDO LIFE 1.xlsx");
  const parsed = await parseLifeExcelBytes(readFileSync(excelPath), path.basename(excelPath));
  const rows = patchRows(parsed.rows);
  const buckets = countRowsBySoLineBucket(rows);
  const summary = countVariantSummary(rows);

  console.log("Filas", rows.length);
  console.log("Buckets SO (arquero incluido en camiseta/uniforme):", buckets);
  console.log("Resumen variantes:", summary);

  const noteHtml = buildOdooOrderNoteHtml({
    title: "DANIEL BELTRAN",
    detailRows: rows,
    designNotes: parsed.disciplina ? `Disciplina: ${parsed.disciplina}` : null,
  });

  const { executeKw } = await createOdooClient(env);

  await executeKw("sale.order", "write", [[ORDER_ID], { note: noteHtml }]);
  await executeKw("project.task", "write", [[TASK_ID], { description: noteHtml }]);
  console.log("Nota SO + descripción tarea actualizadas");

  const sync = await syncSoLinesFromProductMix(executeKw, ORDER_ID, rows, PRODUCT_BY_BUCKET);
  console.log("Sync líneas:", JSON.stringify(sync, null, 2));

  await executeKw(
    "sale.order",
    "message_post",
    [[ORDER_ID]],
    {
      body: `<p><strong>Lista y líneas alineadas al Excel formato life.</strong></p>
<p>Uniforme corta ${buckets.uniforme_corta} · Uniforme larga ${buckets.uniforme_larga} · Camiseta corta ${buckets.camiseta_corta} · Camiseta larga ${buckets.camiseta_larga}</p>
<p>Arqueros (${summary.arquero}): comentario en lista; mismo precio camiseta/uniforme.</p>`,
      message_type: "comment",
      subtype_xmlid: "mail.mt_note",
    }
  ).catch(() =>
    executeKw("sale.order", "message_post", [[ORDER_ID]], {
      body: "Lista y líneas alineadas al Excel.",
      message_type: "comment",
    })
  );

  const order = await executeKw("sale.order", "read", [[ORDER_ID]], {
    fields: ["name", "amount_total", "order_line"],
  });
  const lines = await executeKw("sale.order.line", "read", [order[0].order_line], {
    fields: ["product_uom_qty", "name", "price_subtotal"],
  });
  console.log("\nSO", order[0].name, "total", order[0].amount_total);
  for (const l of lines) {
    if (Number(l.product_uom_qty) > 0) {
      console.log(Number(l.product_uom_qty), "|", l.name.split("\n")[0].slice(0, 85));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
