#!/usr/bin/env node
/**
 * Spike: Kapso-equivalent Telegram notify (does NOT wake Hermes agent).
 * Reads token from Hermes lifedeportes profile .env — never prints it.
 *
 *   node kapso/scripts/spike_staff_bridge_telegram.js
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

async function main() {
  loadDotEnv(path.join(os.homedir(), ".hermes", "profiles", "lifedeportes", ".env"));
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_HOME_CHANNEL || "").trim();
  if (!token || !chatId) {
    console.error("missing TELEGRAM_BOT_TOKEN or TELEGRAM_HOME_CHANNEL in Hermes lifedeportes .env");
    process.exit(1);
  }
  const text = [
    "STAFF WA → Hermes spike (notify only)",
    "Kapso cliente sigue intacto. Este ping no dispara el agente.",
    new Date().toISOString(),
  ].join("\n");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    console.error("telegram send failed:", data.description || res.status);
    process.exit(1);
  }
  console.log("ok: telegram notify delivered to home channel (message_id", data.result?.message_id, ")");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
