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

async function kapsoFetch(pathname) {
  const url = `${base}${pathname}`;
  const res = await fetch(url, {
    headers: {
      "X-API-Key": key,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch ${pathname} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  const convs = await kapsoFetch("/platform/v1/whatsapp/conversations?limit=50");
  const data = convs.data || [];
  console.log("Found", data.length, "whatsapp conversations:");
  for (const c of data) {
    console.log("ID:", c.id, "| Phone:", c.phone_number, "| Name:", c.name || c.display_name || c.phone_number, "| Updated:", c.updated_at);
  }
}

main().catch(console.error);
