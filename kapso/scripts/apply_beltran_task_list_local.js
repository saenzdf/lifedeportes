#!/usr/bin/env node
/**
 * Corrige lista en project.task desde Excel formato life + patch manual.
 * Uso: node kapso/scripts/apply_beltran_task_list_local.js --order 2564
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { parseLifeExcelBytes } from "../functions/lib/parse_life_excel.js";
import {
  applyOrderCorrection,
  createOdooClient,
  resolveCorrectionNoteHtml,
  searchStaffOrders,
} from "../functions/lib/odoo_order_correction.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

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

function patchDavidArquero(rows) {
  return rows.map((row) => {
    if (
      row.grupo === "masculino" &&
      row.numero === "99" &&
      /^david$/i.test(String(row.nombre || "").trim())
    ) {
      return {
        ...row,
        talla: "M",
        arquero: true,
        camiseta: true,
        uniforme: false,
        rol: "Camiseta",
        comentario: row.comentario || "",
      };
    }
    return row;
  });
}

async function main() {
  const orderArg = process.argv.find((a) => a.startsWith("--order="))?.split("=")[1] || "2564";
  const excelPath =
    process.argv.find((a) => a.startsWith("--excel="))?.split("=")[1] ||
    path.join(root, "Copia de FORMATO PEDIDO LIFE 1.xlsx");

  const useProd = process.argv.includes("--prod");
  const local = loadEnv(path.join(root, ".env"));
  const env = useProd
    ? {
        ODOO_URL: local.ODOO_LIFEDEPORTES_PROD_URL || local.ODOO_PROD_URL,
        ODOO_DB: local.ODOO_LIFEDEPORTES_PROD_DB || local.ODOO_PROD_DB,
        ODOO_USERNAME: local.ODOO_LIFEDEPORTES_PROD_USERNAME || local.ODOO_USERNAME,
        ODOO_PASSWORD: local.ODOO_LIFEDEPORTES_PROD_PASSWORD || local.ODOO_PASSWORD,
      }
    : {
        ODOO_URL: local.ODOO_LIFEDEPORTES_URL || local.ODOO_URL,
        ODOO_DB: local.ODOO_LIFEDEPORTES_DB || local.ODOO_DB,
        ODOO_USERNAME: local.ODOO_LIFEDEPORTES_USERNAME || local.ODOO_USERNAME,
        ODOO_PASSWORD: local.ODOO_LIFEDEPORTES_PASSWORD || local.ODOO_PASSWORD,
      };
  for (const k of ["ODOO_URL", "ODOO_DB", "ODOO_USERNAME", "ODOO_PASSWORD"]) {
    if (!env[k]) {
      console.error(`Falta ${k} en lifedeportes/.env`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(excelPath)) {
    console.error("Excel no encontrado:", excelPath);
    process.exit(1);
  }

  const parsed = await parseLifeExcelBytes(readFileSync(excelPath), path.basename(excelPath));
  if (!parsed.ok) {
    console.error("Parse falló:", parsed.error);
    process.exit(1);
  }

  const rows = patchDavidArquero(parsed.rows);
  const david = rows.find((r) => r.numero === "99" && r.grupo === "masculino" && /david/i.test(r.nombre));
  console.log("David #99:", david);

  const { executeKw } = await createOdooClient(env);
  const search = await searchStaffOrders(executeKw, { order_number: orderArg, limit: 3 });
  const order = search.orders?.[0];
  if (!order) {
    console.error("Pedido no encontrado:", orderArg, search.note);
    process.exit(1);
  }
  const orderId = order.order_id || order.id;
  if (!orderId) {
    console.error("Sin order_id en búsqueda:", order);
    process.exit(1);
  }
  if (!order.editable) {
    console.error("Pedido bloqueado:", order.lock_reason);
    process.exit(1);
  }

  console.log("SO:", order.order_name, "id", orderId, "tarea", order.task_id, order.task_stage);

  const vars = {
    order_draft: {
      title: "Pedido",
      detail: { rows },
    },
  };

  const note = resolveCorrectionNoteHtml(vars, {}, {
    listMode: "full",
    existingNoteHtml: "",
    productMixChanged: true,
  });

  const productMixChanged = true;

  const result = await applyOrderCorrection(executeKw, {
    orderId,
    orderNoteHtml: note.html,
    changeType: "cliente",
    changeSummary:
      "Lista Excel: tablas por manga corta/larga, resumen variantes, cantidades SO alineadas a lista.",
    staffLabel: "Cursor agente",
    attachments: [],
    rowCount: note.rowCount,
    listMode: "full",
    attachmentsOnly: false,
    productMixChanged,
    newRows: rows,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
