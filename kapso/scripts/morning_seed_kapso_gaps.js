#!/usr/bin/env node
/**
 * Barrido local: conversaciones Kapso recientes sin CRM → seed-crm-awaiting.
 * Pensado para cron ~7:00 Bogotá (o manual). No envía WhatsApp.
 *
 *   node kapso/scripts/morning_seed_kapso_gaps.js
 *   node kapso/scripts/morning_seed_kapso_gaps.js --hours 72 --dry-run
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const STAFF = new Set(["573213988464"]);
const PHONE_ID = "1095603153637786";
const SEED_FN = "a9b1d8c3-f87f-4b69-8c82-1b6688fb8818";

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

function digits(v) {
  return String(v || "").replace(/\D/g, "");
}

function matchPhone(a, b) {
  const x = digits(a);
  const y = digits(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(y.slice(-10)) || y.endsWith(x.slice(-10));
}

const THINKING =
  /\b(voy\s+a\s+(pensar|consultarlo|pasar\s+el\s+dato)|consulto\s+con|mañana\s+te\s+(digo|doy)|ya\s+les\s+confirmo|no\s+gracias)\b/i;
const ACCEPT =
  /\b(dale|listo|deseo\s+hacer\s+el\s+pedido|n[uú]mero\s+para\s+(el\s+)?abono|c[oó]mo\s+(pago|abono)|s[ií]\s+(por\s+favor|adelante)|confirmamos|adelante)\b/i;
const ADS = /^hola,\s*quiero\s+cotizar\s+uniformes\s+de\s*$/i;

async function kapso(apiPath) {
  const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const res = await fetch(`${base}${apiPath}`, {
    headers: { "X-API-Key": process.env.KAPSO_API_KEY, Accept: "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function odooAuth() {
  const url = process.env.ODOO_LIFEDEPORTES_PROD_URL.replace(/\/$/, "");
  const body = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "common",
      method: "authenticate",
      args: [
        process.env.ODOO_LIFEDEPORTES_PROD_DB,
        process.env.ODOO_LIFEDEPORTES_PROD_USERNAME,
        process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD,
        {},
      ],
    },
    id: 1,
  };
  const r = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  return j.result;
}

async function odooExec(uid, model, method, args, kwargs = {}) {
  const url = process.env.ODOO_LIFEDEPORTES_PROD_URL.replace(/\/$/, "");
  const body = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [
        process.env.ODOO_LIFEDEPORTES_PROD_DB,
        uid,
        process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD,
        model,
        method,
        args,
        kwargs,
      ],
    },
    id: 1,
  };
  const r = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error?.data?.message || j.error.message);
  return j.result;
}

function content(m) {
  return m?.kapso?.content || m?.text?.body || m?.text || "";
}

function extractQuote(msgs, name) {
  const inbound = msgs
    .filter((m) => (m.kapso?.direction || "") === "inbound")
    .map((m) => String(content(m)));
  const all = msgs.map((m) => String(content(m))).join("\n");
  const blob = all.toLowerCase();
  if (inbound.length <= 1 && ADS.test((inbound[0] || "").trim())) {
    return null;
  }
  if (THINKING.test(blob) && !ACCEPT.test(blob)) return null;

  const qtyM = blob.match(/(\d{1,3})\s*(uniforme|camiseta|unidad)/i);
  const qty = qtyM ? Number(qtyM[1]) : null;
  const totalM = all.match(/\$\s?([\d.]+)\s*(?:en total|total|mil)?/i);
  let total = null;
  if (totalM) {
    total = Number(String(totalM[1]).replace(/\./g, ""));
    if (total < 1000) total = null;
  }
  const unitM = all.match(/\$\s?([\d.]+)\s*c\/u/i);
  let unit = unitM ? Number(String(unitM[1]).replace(/\./g, "")) : null;
  const product = /uniforme/.test(blob)
    ? "uniforme"
    : /camiseta/.test(blob)
      ? "camiseta"
      : "pedido";

  const acceptance = ACCEPT.test(blob);
  const useful =
    (qty && qty >= 6 && /uniforme|camiseta|pedido|cotiz/.test(blob)) ||
    (acceptance && (qty >= 6 || total > 0));
  if (!useful) return null;

  return {
    team_name: String(name || "").replace(/[^\p{L}\p{N}\s.\-_/&]/gu, "").trim().slice(0, 80) || "WA",
    product_text: product,
    quantity: qty && qty >= 6 ? qty : undefined,
    unit_cop: unit || undefined,
    total_cop: total || (unit && qty ? unit * qty : undefined),
    notes: `Barrido mañana Kapso. Último inbound: ${(inbound.slice(-2).join(" | ") || "").slice(0, 280)}`,
    status: acceptance ? "esperando_seguimiento" : "cotizado_esperando",
    conversation_date: new Date().toISOString().slice(0, 10),
  };
}

async function main() {
  loadEnv();
  const dry = process.argv.includes("--dry-run");
  const hi = process.argv.indexOf("--hours");
  const hours = hi >= 0 ? Number(process.argv[hi + 1]) : 72;
  const since = Date.now() - hours * 3600 * 1000;

  const uid = await odooAuth();
  const leads = await odooExec(
    uid,
    "crm.lead",
    "search_read",
    [[["type", "=", "opportunity"], ["create_date", ">=", "2026-06-01 00:00:00"]]],
    { fields: ["id", "name", "phone"], limit: 500, order: "id desc" }
  );

  const convs = [];
  let page = 1;
  while (page <= 5) {
    const r = await kapso(
      `/platform/v1/whatsapp/conversations?phone_number_id=${PHONE_ID}&per_page=50&page=${page}`
    );
    const rows = r.json?.data || [];
    if (!rows.length) break;
    for (const c of rows) {
      const t = new Date(c.last_active_at || c.updated_at || 0).getTime();
      if (t >= since) convs.push(c);
    }
    if (rows.length < 50) break;
    page += 1;
  }

  const toSeed = [];
  for (const c of convs) {
    const phone = digits(c.phone_number);
    if (STAFF.has(phone)) continue;
    if (leads.some((l) => matchPhone(l.phone, phone))) continue;

    const mr = await kapso(
      `/platform/v1/whatsapp/messages?conversation_id=${c.id}&limit=40`
    );
    const msgs = [...(mr.json?.data || [])].reverse();
    const quote = extractQuote(msgs, c.contact_name);
    if (!quote) continue;
    toSeed.push({
      phone,
      conversation_id: c.id,
      customer_name: quote.team_name,
      team_name: quote.team_name,
      fingerprint: `morning_gap:${phone}:${new Date().toISOString().slice(0, 10)}`,
      source: "morning_seed_kapso_gaps",
      quote,
    });
  }

  console.log(JSON.stringify({ scanned: convs.length, candidates: toSeed.length, dry, hours }, null, 2));
  for (const p of toSeed) {
    console.log("-", p.customer_name, p.phone, p.quote.product_text, p.quote.total_cop || p.quote.quantity);
  }

  const outPayload = path.join(ROOT, "scratch", `morning_seed_gaps_${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(outPayload, JSON.stringify(toSeed, null, 2));
  if (dry || !toSeed.length) {
    console.log("wrote", outPayload, dry ? "(dry-run)" : "(empty)");
    return;
  }

  const inv = spawnSync(
    "node",
    [path.join(__dirname, "invoke_seed_crm_batch.js"), outPayload],
    { cwd: ROOT, stdio: "inherit", env: process.env }
  );
  process.exit(inv.status || 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
