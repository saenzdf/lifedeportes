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
  const msgs = await kapsoFetch(`/platform/v1/whatsapp/conversations/${convId}/messages?limit=100`);
  const data = msgs.data || [];
  console.log("Total messages in Paola's conversation:", data.length);
  for (const m of data) {
    console.log(`[${m.created_at || m.timestamp}] ID: ${m.id} | type: ${m.type || m.message_type} | text: ${m.body || m.text || m.caption || ""}`);
    if (m.media_url || m.url || m.media || m.payload?.url) {
      console.log("  MEDIA URL:", m.media_url || m.url || m.media || m.payload?.url);
    }
    if (m.attachments || m.payload?.attachments) {
      console.log("  ATTACHMENTS:", JSON.stringify(m.attachments || m.payload?.attachments));
    }
  }
}

main().catch(console.error);
