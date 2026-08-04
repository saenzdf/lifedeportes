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

const base = process.env.KAPSO_API_BASE_URL;
const key = process.env.KAPSO_API_KEY;
const convId = "1c95a3d7-d4c6-47b9-99f2-ba7937ff4288";

async function main() {
  const text = `Listo Paola! Corregido y cargado exitosamente a la tarea del pedido S02831 ANIBAL:

- Archivo Excel (FORMATO PEDIDO LIFE_EqF11Masc-AMIGOSUC.xlsx) con 25 filas organizadas en Odoo (23 uniformes masculinos + 2 camisetas femeninas + 1 arquero YACO #14).
- Fotos de referencia de diseño adjuntas en la tarjeta de producción y en el presupuesto SO2831.
- Descripción de la tarea actualizada con la tabla detallada de tallas y dorsales.`;

  const url = `${base}/platform/v1/whatsapp/conversations/${convId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        text: text,
      },
    }),
  });

  console.log("Send message status:", res.status);
  const data = await res.json().catch(() => ({}));
  console.log("Response:", JSON.stringify(data, null, 2));
}

main().catch(console.error);
