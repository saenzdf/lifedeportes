import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveOrderNoteHtml } from "../kapso/functions/lib/build_odoo_order_note.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(__dirname, "../kapso/functions");

function loadHandler(file) {
  const code = fs.readFileSync(path.join(fnDir, file), "utf8");
  return new Function(`${code}\nreturn handler;`)();
}

async function main() {
  const handler = loadHandler("parsear_lista_excel_pedido.js");
  const filePath = path.resolve(__dirname, "anibal_2831/FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");
  const fileBytes = fs.readFileSync(filePath);
  const dataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${fileBytes.toString("base64")}`;

  const body = {
    input: {
      file_url: dataUrl,
      filename: "FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx",
    },
    execution_context: {
      vars: {
        user: { role: "staff" },
        quote: { customer_display_name: "ANIBAL" },
      },
    },
  };

  const req = { json: async () => body };
  const res = await handler(req, {});
  const data = await res.json();

  const html = resolveOrderNoteHtml(data.vars);

  console.log("=== GENERATED HTML NOTE ===");
  console.log(html);
  fs.writeFileSync("scratch/anibal_note.html", html);
}

main().catch(console.error);
