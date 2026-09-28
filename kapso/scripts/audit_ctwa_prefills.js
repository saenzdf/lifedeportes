#!/usr/bin/env node
/**
 * Audit Meta Ads icebreaker prefills on the Life Kapso number.
 * Platform API does not expose CTWA referral today; this counts the icebreaker
 * that Meta injects from Click-to-WhatsApp ads.
 *
 *   node kapso/scripts/audit_ctwa_prefills.js
 *   node kapso/scripts/audit_ctwa_prefills.js --pages 40
 */
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..", "..");
function loadEnv() {
  for (const p of [path.join(ROOT, ".env"), path.join(ROOT, "..", "..", ".env")]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}

loadEnv();

const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
const key = process.env.KAPSO_API_KEY;
const phone = process.env.KAPSO_PHONE_NUMBER_ID || "1095603153637786";
const maxPages = Number(
  (process.argv.find((a) => a.startsWith("--pages=")) || "").split("=")[1] ||
    (process.argv.includes("--pages")
      ? process.argv[process.argv.indexOf("--pages") + 1]
      : 80)
);

if (!key) {
  console.error("missing KAPSO_API_KEY");
  process.exit(1);
}

const re = /^Hola,\s*quiero cotizar uniformes de\s*(.*)$/i;

async function page(after) {
  const u = new URL(`${base}/platform/v1/whatsapp/messages`);
  u.searchParams.set("phone_number_id", phone);
  u.searchParams.set("direction", "inbound");
  u.searchParams.set("limit", "100");
  if (after) u.searchParams.set("after", after);
  const r = await fetch(u, {
    headers: { "X-API-Key": key, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

(async () => {
  let after = null;
  let pages = 0;
  let totalPrefill = 0;
  let emptyPrefill = 0;
  let withReferral = 0;
  const suffixCounts = new Map();
  const daily = new Map();

  while (pages < maxPages) {
    const body = await page(after);
    const data = body.data || [];
    if (!data.length) break;
    for (const m of data) {
      if (m.referral || m.kapso?.referral) withReferral += 1;
      const text = String(m.kapso?.content || m.text?.body || "").trim();
      const match = text.match(re);
      if (!match) continue;
      totalPrefill += 1;
      const suffix = match[1].trim();
      if (!suffix) emptyPrefill += 1;
      const key =
        suffix
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .slice(0, 60) || "(vacío)";
      suffixCounts.set(key, (suffixCounts.get(key) || 0) + 1);
      const ts = Number(m.timestamp);
      const d = Number.isFinite(ts)
        ? new Date(ts * 1000).toISOString().slice(0, 10)
        : "?";
      daily.set(d, (daily.get(d) || 0) + 1);
    }
    after = body.paging?.cursors?.after || null;
    pages += 1;
    if (!after) break;
  }

  const top = [...suffixCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const days = [...daily.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 21);
  console.log(
    JSON.stringify(
      {
        phone_number_id: phone,
        pages,
        totalPrefill,
        emptyPrefill,
        withReferralField: withReferral,
        topSuffixes: top,
        recentDays: days,
        note:
          "Platform API omits referral; Ads (CTWA) dashboard may still have source_id. Prefill count ≈ CTWA traffic.",
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
