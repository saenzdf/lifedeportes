import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
      },
    },
  };

  const req = { json: async () => body };
  const res = await handler(req, {});
  const data = await res.json();

  console.log("PARSE STATUS:", data.ok);
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
