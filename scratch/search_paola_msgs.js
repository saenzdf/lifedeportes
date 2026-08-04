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
  const convs = await kapsoFetch("/platform/v1/whatsapp/conversations?limit=30");
  const data = convs.data || [];
  
  for (const c of data) {
    try {
      const msgs = await kapsoFetch(`/platform/v1/whatsapp/conversations/${c.id}/messages?limit=20`);
      const msgList = msgs.data || [];
      const joined = JSON.stringify(msgList);
      if (/2831|anibal|guainia|paola/i.test(joined)) {
        console.log("=== MATCH IN CONVERSATION ===");
        console.log("ID:", c.id, "Phone:", c.phone_number, "Name:", c.name || c.display_name);
        for (const m of msgList) {
          console.log(`[${m.created_at || m.timestamp}] ${m.direction || m.type}:`, m.text || m.body || m.caption || m.type || "");
          if (m.media_url || m.url || m.media) {
            console.log("  MEDIA:", m.media_url || m.url || m.media);
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

main().catch(console.error);
