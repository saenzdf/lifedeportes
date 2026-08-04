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

const files = [
  ["FORMATO_PEDIDO_LIFE_EqF11Masc-AMIGOSUC.xlsx", "https://app.kapso.ai/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6IjQ5MTNiYzQ0LTgxY2QtNDVlYi1iZjNhLTg4ZjY4MTAwMGQ5OCIsInB1ciI6ImJsb2JfaWQifX0=--b54fb83564ec6e056b821768a12505f157cced74/FORMATO%20PEDIDO%20LIFE_EqF11Masc-AMIGOSUC.xlsx"],
  ["image_d4d86da23cf9.jpeg", "https://app.kapso.ai/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6ImYxNzdiODUyLTc3ZWYtNDgxMC05Mzc4LTQ2ZGFhYjE4NmI2MiIsInB1ciI6ImJsb2JfaWQifX0=--8c9e6e9862e6bf59e9002728804690ccc40a66fc/image_d4d86da23cf9.jpeg"],
  ["image_30c6665bb350.jpeg", "https://app.kapso.ai/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6IjQzZThjYzVhLTNmNjItNDFkOS1iYjg3LTY2MjUxOTc0MDA1ZiIsInB1ciI6ImJsb2JfaWQifX0=--e3ff56573153fe51a2358478125c2e0ddcd3ca06/image_30c6665bb350.jpeg"],
  ["image_3e5bd6ef12a1.jpeg", "https://app.kapso.ai/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZUzYTBhNjJkLWFkZmYtNDQ0Ni1iNjA4LTk3ZDc0YTU5NGQyMCIsInB1ciI6ImJsb2JfaWQifX0=--51c1770f1776010b870af6bfe15c081d6417cde5/image_3e5bd6ef12a1.jpeg"]
];

async function main() {
  const dir = path.join(__dirname, "anibal_2831");
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, url] of files) {
    const res = await fetch(url, { headers: { "X-API-Key": key }, redirect: "follow" });
    console.log(name, "status:", res.status, "redirected:", res.redirected, "url:", res.url);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path.join(dir, name), buf);
    console.log("Saved", name, buf.length, "bytes");
  }
}

main().catch(console.error);
