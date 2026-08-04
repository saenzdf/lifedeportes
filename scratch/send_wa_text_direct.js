const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const key = process.env.KAPSO_API_KEY;
const pnid = process.env.KAPSO_PHONE_NUMBER_ID || "1095603153637786";
const to = "573213988464";

async function main() {
  const text = `¡Hola Paola! La subida a la tarea del pedido S02831 ANIBAL fue exitosa en Odoo. 

- Excel procesado con 25 filas (23 uniformes + 2 camisetas + 1 arquero YACO #14).
- Fotos de referencia adjuntas en Odoo (Tarea 2596 y Presupuesto S02831).
- Lista organizada y limpia sin textos inventados.

Quedo atento al siguiente pedido.`;

  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${pnid}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": key,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: {
        body: text,
      },
    }),
  });

  console.log("Send message status:", res.status);
  const data = await res.json().catch(() => ({}));
  console.log("Response:", JSON.stringify(data, null, 2));
}

main().catch(console.error);
