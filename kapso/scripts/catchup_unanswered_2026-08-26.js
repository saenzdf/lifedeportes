#!/usr/bin/env node
/**
 * Catch-up 26/08 08:00 Bogotá — clientes sin reply del corte Muse (25/08).
 * Un mensaje por cliente. Aviso staff SOLO al Asignado a (nunca Paola y Javier).
 *
 *   node kapso/scripts/catchup_unanswered_2026-08-26.js --dry-run
 *   node kapso/scripts/catchup_unanswered_2026-08-26.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const PHONE_ID = "1095603153637786";
const STAFF = [
  { phone: "573213988464", name: "Paola" },
  { phone: "573103362484", name: "Javier" },
];
const STAMP = path.join(
  os.homedir(),
  "Library/Application Support/lifedeportes/catchup_unanswered_2026-08-26.done"
);
const LOG = path.join(os.homedir(), "Library/Application Support/lifedeportes/catchup_unanswered_2026-08-26.json");

const CUSTOMERS = [
  {
    name: "TATIANA GÓMEZ",
    to: "3000000070",
    conversation_id: "04f1e218-b8e6-4dab-89f7-25ce6943889a",
    body: "Con gusto. ¿Para qué deporte necesita los uniformes y qué cantidad? El mínimo es 6 del mismo diseño.",
    staff_line: "Tatiana — cotizar uniformes (sin reply ayer)",
  },
  {
    name: "Krlos E. (Real Quilichao)",
    to: "3000000031",
    conversation_id: null,
    body: "El uniforme completo queda en $50.000 (manga corta o larga) y la camiseta sola en $30.000. El mínimo es 6 del mismo diseño. ¿Cuántos necesita?",
    staff_line: "Krlos E. / Real Quilichao — precios manga y camiseta",
  },
  {
    name: "flow Glow",
    to: "3000000013",
    conversation_id: null,
    body: "Con gusto. ¿Para qué deporte necesita los uniformes y qué cantidad? El mínimo es 6 del mismo diseño.",
    staff_line: "flow Glow — cotizar uniformes (sin reply ayer)",
  },
  {
    name: "Ricardo Martin",
    to: null,
    recipient: "CO.3619304748236307",
    conversation_id: "dc677434-8ab4-494e-b266-4e505ac9d312",
    body: "Con gusto. ¿Para qué deporte necesita los uniformes y qué cantidad? El mínimo es 6 del mismo diseño.",
    staff_line: "Ricardo Martin — número privado; chat en Kapso",
  },
  {
    name: "Samu",
    to: "3000000023",
    conversation_id: null,
    body: "Sí. Puede enviarnos las tallas por aquí cuando guste; las dejamos listas para cuando llegue el abono del 50%.",
    staff_line: "Samu — preguntó si puede mandar tallas ya",
  },
];

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  const extra = path.join(
    os.homedir(),
    "Library/Application Support/lifedeportes/catchup_unanswered_2026-08-26.env"
  );
  for (const p of [extra, envPath]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}

function compact(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}
function digits(v) {
  return String(v ?? "").replace(/\D/g, "");
}
function parseAssigneeName(desc) {
  const m = String(desc || "").match(/Asignado a:\s*(Paola|Javier)/i);
  if (!m) return null;
  return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
}
function phoneForName(name) {
  return name === "Paola" ? "573213988464" : name === "Javier" ? "573103362484" : null;
}

async function kapsoGet(path, query) {
  const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const url = new URL(base + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    headers: { "X-API-Key": process.env.KAPSO_API_KEY, Accept: "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`kapso ${res.status} ${path}`);
  return json;
}

async function sendWa({ to, recipient, body }) {
  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    type: "text",
    text: { body: String(body).slice(0, 4000) },
  };
  if (recipient) {
    payload.recipient_type = "individual";
    payload.recipient = recipient;
  } else {
    payload.to = digits(to);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": process.env.KAPSO_API_KEY,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    id: json?.messages?.[0]?.id || null,
    error: json?.error?.message || (!res.ok ? res.statusText : null),
    code: json?.error?.code || null,
  };
}

async function odooRpc(service, method, args) {
  const url = String(
    process.env.ODOO_LIFEDEPORTES_PROD_URL || process.env.ODOO_URL || ""
  ).replace(/\/$/, "");
  const res = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args } }),
  });
  const json = await res.json();
  if (json?.error) throw new Error(String(json.error?.data?.message || json.error?.message || "odoo"));
  return json.result;
}

async function odooKw() {
  const db = process.env.ODOO_LIFEDEPORTES_PROD_DB || process.env.ODOO_DB || "lifedeportes";
  const user = process.env.ODOO_LIFEDEPORTES_PROD_USERNAME || process.env.ODOO_USERNAME;
  const pass = process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD || process.env.ODOO_PASSWORD;
  if (!user || !pass) return null;
  const uid = await odooRpc("common", "authenticate", [db, user, pass, {}]);
  if (!uid) return null;
  return (model, method, positional, kw = {}) =>
    odooRpc("object", "execute_kw", [db, uid, pass, model, method, positional, kw]);
}

async function pickRoundRobin(executeKw) {
  const rows =
    (await executeKw(
      "crm.lead",
      "search_read",
      [[["type", "=", "opportunity"], ["description", "ilike", "Asignado a:"]]],
      { fields: ["id", "description"], limit: 1, order: "id desc", context: { active_test: false } }
    )) || [];
  const last = parseAssigneeName(rows[0]?.description || "");
  if (last === "Paola") return "Javier";
  if (last === "Javier") return "Paola";
  return "Paola";
}

async function resolveAssignee(executeKw, { name, to, conversationId, fallbackName }) {
  if (!executeKw) return { name: fallbackName, phone: phoneForName(fallbackName), reused: false };
  const searchKw = {
    fields: ["id", "name", "phone", "description", "active"],
    limit: 8,
    order: "id desc",
    context: { active_test: false },
  };
  const byId = new Map();
  const add = (rows) => {
    for (const r of rows || []) if (r?.id) byId.set(r.id, r);
  };
  if (conversationId) {
    add(await executeKw("crm.lead", "search_read", [[["description", "ilike", conversationId]]], searchKw));
  }
  const local10 = digits(to).slice(-10);
  if (local10.length >= 7) {
    add(await executeKw("crm.lead", "search_read", [[["phone", "ilike", local10]]], searchKw));
  }
  const person = compact(name);
  if (person.length >= 8) {
    add(
      await executeKw(
        "crm.lead",
        "search_read",
        [[["name", "ilike", person.slice(0, 40)], ["type", "=", "opportunity"]]],
        searchKw
      )
    );
  }
  const rows = [...byId.values()];
  const assigned = rows
    .filter((r) => parseAssigneeName(r.description))
    .sort((a, b) => Number(a.id) - Number(b.id));
  const sticky = assigned[0] ? parseAssigneeName(assigned[0].description) : null;
  const chosen = sticky || fallbackName;
  const target = assigned[0] || rows[0] || null;
  if (target?.id && chosen && !parseAssigneeName(target.description)) {
    const desc = String(target.description || "");
    await executeKw("crm.lead", "write", [
      [target.id],
      { description: `${desc}\n<p><b>Asignado a: ${chosen}</b></p>`.trim() },
    ]);
  }
  return { name: chosen, phone: phoneForName(chosen), reused: Boolean(sticky), lead_id: target?.id || null };
}

async function lookupConv(c) {
  if (c.conversation_id) {
    const r = await kapsoGet(`/platform/v1/whatsapp/conversations/${c.conversation_id}`);
    return r.data || r;
  }
  if (c.to) {
    const r = await kapsoGet("/platform/v1/whatsapp/conversations", {
      phone_number: c.to,
      per_page: 1,
    });
    return (r.data || [])[0] || null;
  }
  return null;
}

function alreadyReplied(conv) {
  const k = conv?.kapso || {};
  const lin = k.last_inbound_at ? Date.parse(k.last_inbound_at) : 0;
  const lout = k.last_outbound_at ? Date.parse(k.last_outbound_at) : 0;
  return Boolean(lout && lin && lout >= lin);
}

function bogotaClock(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(now)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    weekday: map.weekday,
    minutesOfDay: Number(map.hour) * 60 + Number(map.minute),
  };
}

function customerSendOk(now = new Date()) {
  const { minutesOfDay } = bogotaClock(now);
  return minutesOfDay >= 6 * 60 && minutesOfDay < 19 * 60;
}

function staffNotifyOk(now = new Date()) {
  const { weekday, minutesOfDay } = bogotaClock(now);
  if (weekday === "Sunday") return false;
  return minutesOfDay >= 8 * 60 && minutesOfDay < 18 * 60;
}

async function main() {
  loadEnv();
  const dry = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  if (!force && fs.existsSync(STAMP) && !dry) {
    console.error("already ran", STAMP);
    process.exit(0);
  }
  if (!process.env.KAPSO_API_KEY) {
    console.error("missing KAPSO_API_KEY");
    process.exit(1);
  }
  if (!force && !customerSendOk()) {
    console.error("outside customer send window (06:00–19:00 Bogotá)");
    process.exit(1);
  }

  const executeKw = await odooKw().catch((e) => {
    console.error("odoo skip", e.message);
    return null;
  });
  let rrName = "Paola";
  if (executeKw) {
    try {
      rrName = await pickRoundRobin(executeKw);
    } catch (e) {
      console.error("rr skip", e.message);
    }
  }

  const results = [];
  const staffBuckets = { Paola: [], Javier: [] };

  for (const c of CUSTOMERS) {
    let conv = null;
    try {
      conv = await lookupConv(c);
    } catch (e) {
      console.error("conv", c.name, e.message);
    }
    const conversationId = c.conversation_id || conv?.id || null;
    if (conv && alreadyReplied(conv) && !force) {
      const row = { name: c.name, skipped: true, reason: "already_replied" };
      results.push(row);
      console.log(c.name, "skip already_replied");
      continue;
    }
    const claimed = await resolveAssignee(executeKw, {
      name: c.name,
      to: c.to,
      conversationId,
      fallbackName: rrName,
    });
    if (!claimed.reused) {
      rrName = claimed.name === "Paola" ? "Javier" : "Paola";
    }
    let send = { ok: true, dry: true };
    if (!dry) {
      send = await sendWa({ to: c.to, recipient: c.recipient, body: c.body });
    }
    const row = {
      name: c.name,
      to: c.to || c.recipient,
      conversation_id: conversationId,
      assignee: claimed.name,
      reused: claimed.reused,
      ...send,
    };
    results.push(row);
    console.log(c.name, claimed.name, send.ok ? (dry ? "dry" : "ok") : "FAIL", send.error || send.id || "");
    if (send.ok || dry) {
      staffBuckets[claimed.name].push(c.staff_line);
    }
  }

  const staffResults = [];
  const canStaff = force || staffNotifyOk();
  for (const s of STAFF) {
    const lines = staffBuckets[s.name];
    if (!lines.length) continue;
    if (!canStaff) {
      staffResults.push({ to: s.name, n: lines.length, skipped: true, reason: "staff_quiet_hours" });
      console.log("staff", s.name, "skip staff_quiet_hours");
      continue;
    }
    const body = `Pendientes de ayer (ya les escribimos; si responden, Kapso sigue):\n${lines.join("\n")}`;
    let send = { ok: true, dry: true };
    if (!dry) send = await sendWa({ to: s.phone, body });
    staffResults.push({ to: s.name, n: lines.length, ...send });
    console.log("staff", s.name, send.ok ? (dry ? "dry" : "ok") : "FAIL", send.error || send.id || "");
  }

  const out = { at: new Date().toISOString(), dry, results, staffResults };
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.writeFileSync(LOG, JSON.stringify(out, null, 2) + "\n");
    console.log("wrote", LOG);
  } catch (e) {
    console.error("log skip", e.message);
  }
  if (!dry) {
    fs.mkdirSync(path.dirname(STAMP), { recursive: true });
    fs.writeFileSync(STAMP, new Date().toISOString() + "\n");
  }
  if (results.some((r) => !r.skipped && r.ok === false) || staffResults.some((r) => r.ok === false)) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
