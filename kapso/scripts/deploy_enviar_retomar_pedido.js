#!/usr/bin/env node
/**
 * Deploy enviar-retomar-pedido (template Meta retomar_pedido_v2 → cliente).
 *
 *   node kapso/scripts/deploy_enviar_retomar_pedido.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const FN_NAME = "enviar-retomar-pedido";
const FN_ID_FILE = path.join(ROOT, "scratch", "enviar_retomar_pedido_function_id.txt");
const SRC = path.join(ROOT, "kapso", "functions", "enviar_retomar_pedido.js");
const REG = path.join(ROOT, "kapso", "service_registry.json");
const IDS = path.join(ROOT, "kapso", "docs", "order_detail_function_ids.json");

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

function buildCode() {
  let code = fs.readFileSync(SRC, "utf8");
  code = code.replace(/\nexport \{ handler \};\s*$/, "\n");
  return code;
}

async function kapso(apiPath, init = {}) {
  const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const key = process.env.KAPSO_API_KEY;
  const res = await fetch(`${base}${apiPath}`, {
    ...init,
    headers: {
      "X-API-Key": key,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function upsertSecret(fnId, name, value) {
  if (value == null || value === "") return;
  const list = await kapso(`/platform/v1/functions/${fnId}/secrets`);
  const names = (list.json?.data?.secrets || list.json?.data || []).map((s) => s.name || s);
  if (names.includes(name)) {
    await kapso(`/platform/v1/functions/${fnId}/secrets/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  }
  const create = await kapso(`/platform/v1/functions/${fnId}/secrets`, {
    method: "POST",
    body: { secret: { name, value: String(value) } },
  });
  if (!create.ok) {
    throw new Error(`secret ${name}: ${create.status} ${JSON.stringify(create.json)}`);
  }
}

async function resolveOrCreate(code) {
  if (fs.existsSync(FN_ID_FILE)) {
    const id = fs.readFileSync(FN_ID_FILE, "utf8").trim();
    if (id) {
      const patch = await kapso(`/platform/v1/functions/${id}`, {
        method: "PATCH",
        body: {
          function: {
            name: FN_NAME,
            code,
            description:
              "Staff: envía template Meta retomar_pedido_v2 al WhatsApp del cliente (ENVIAR RETOMAR)",
          },
        },
      });
      if (patch.ok) return id;
    }
  }
  const list = await kapso(`/platform/v1/functions`);
  const hit = (list.json?.data || []).find((f) => f.name === FN_NAME);
  if (hit?.id) {
    await kapso(`/platform/v1/functions/${hit.id}`, {
      method: "PATCH",
      body: { function: { name: FN_NAME, code } },
    });
    fs.writeFileSync(FN_ID_FILE, hit.id + "\n");
    return hit.id;
  }
  const created = await kapso(`/platform/v1/functions`, {
    method: "POST",
    body: {
      function: {
        name: FN_NAME,
        code,
        description:
          "Staff: envía template Meta retomar_pedido_v2 al WhatsApp del cliente (ENVIAR RETOMAR)",
      },
    },
  });
  if (!created.ok) {
    throw new Error(`create: ${created.status} ${JSON.stringify(created.json)}`);
  }
  const id = created.json?.data?.id || created.json?.data?.data?.id;
  if (!id) throw new Error("no function id");
  fs.writeFileSync(FN_ID_FILE, id + "\n");
  return id;
}

async function waitDeployed(fnId) {
  for (let i = 0; i < 30; i++) {
    const g = await kapso(`/platform/v1/functions/${fnId}`);
    const data = g.json?.data?.data || g.json?.data || {};
    console.log("status", data.status);
    if (data.status === "deployed" || data.status === "active") return data;
    if (data.status === "error" || data.status === "failed") {
      throw new Error("deploy error: " + JSON.stringify(data).slice(0, 500));
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("deploy timeout");
}

async function main() {
  loadEnv();
  const code = buildCode();
  const fnId = await resolveOrCreate(code);
  console.log("function_id", fnId);

  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  await waitDeployed(fnId);

  const secrets = {
    KAPSO_API_KEY: process.env.KAPSO_API_KEY,
    KAPSO_PHONE_NUMBER_ID:
      process.env.KAPSO_PHONE_NUMBER_ID ||
      process.env.LIFE_WHATSAPP_PHONE_NUMBER_ID ||
      "1095603153637786",
    LIFE_RETOMAR_TEMPLATE_NAME: process.env.LIFE_RETOMAR_TEMPLATE_NAME || "retomar_pedido_v2",
    LIFE_RETOMAR_TEMPLATE_LANG: process.env.LIFE_RETOMAR_TEMPLATE_LANG || "es",
  };
  for (const [k, v] of Object.entries(secrets)) {
    if (!v) {
      console.log("skip secret", k);
      continue;
    }
    await upsertSecret(fnId, k, v);
    console.log("secret", k, "ok");
  }

  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  await waitDeployed(fnId);

  const reg = JSON.parse(fs.readFileSync(REG, "utf8"));
  reg.order_detail = reg.order_detail || {};
  reg.order_detail.enviar_retomar_pedido = {
    kapso_function_name: FN_NAME,
    kapso_function_id: fnId,
    local_path: "kapso/functions/enviar_retomar_pedido.js",
    template: "retomar_pedido_v2",
    language: "es",
    note: "Staff ENVIAR RETOMAR → template Meta al cliente (fuera ventana 24h)",
  };
  reg.assets = reg.assets || {};
  reg.assets.templates = reg.assets.templates || {};
  reg.assets.templates.retomar_pedido_v2 = {
    name: "retomar_pedido_v2",
    language: "es",
    status: "APPROVED",
    waba_template_id: "1381646390243187",
    body: "Hola, te escribimos para confirmar o retomar su pedido.",
    kapso_function_id: fnId,
  };
  fs.writeFileSync(REG, JSON.stringify(reg, null, 2) + "\n");

  const ids = fs.existsSync(IDS) ? JSON.parse(fs.readFileSync(IDS, "utf8")) : {};
  ids.enviar_retomar_pedido = fnId;
  fs.writeFileSync(IDS, JSON.stringify(ids, null, 2) + "\n");

  console.log("DONE", FN_NAME, fnId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
