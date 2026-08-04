const fs = require("fs");
const path = require("path");
const fn = require("../kapso/functions/parse_order_detail_excel.js");

async function main() {
  const filePath = path.join(__dirname, "anibal_2831/FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx");
  const payload = {
    vars: {
      order_draft: {
        attachments: [
          {
            url: "file://" + filePath,
            role: "detail_list",
            filename: "FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx",
          },
        ],
      },
    },
  };
  const res = await fn(payload);
  console.log(JSON.stringify(res, null, 2));
}

main().catch(console.error);
