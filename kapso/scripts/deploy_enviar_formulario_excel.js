#!/usr/bin/env node
/**
 * Deploy enviar-formulario-excel (Excel Formulario Life → WhatsApp).
 *
 *   node kapso/scripts/deploy_enviar_formulario_excel.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const FN_NAME = "enviar-formulario-excel";
const FN_ID_FILE = path.join(ROOT, "scratch", "enviar_formulario_excel_function_id.txt");
const SRC = path.join(ROOT, "kapso", "functions", "enviar_formulario_excel.js");
const ASSET = path.join(ROOT, "kapso", "assets", "Formulario-detalle-pedido.xlsx");
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
  if (!fs.existsSync(ASSET)) throw new Error("missing asset " + ASSET);
  const b64 = fs.readFileSync(ASSET).toString("base64");
  if (!code.includes("__FORMULARIO_XLSX_B64__")) {
    throw new Error("source missing __FORMULARIO_XLSX_B64__ placeholder");
  }
  code = code.replace("__FORMULARIO_XLSX_B64__", b64);
  // Kapso functions: drop ESM export if present
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
              "Envía Formulario Life (.xlsx) por WhatsApp: cliente (lista/tallas) o staff→cliente",
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
          "Envía Formulario Life (.xlsx) por WhatsApp: cliente (lista/tallas) o staff→cliente",
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
  console.log("code bytes", code.length);
  const fnId = await resolveOrCreate(code);
  console.log("function_id", fnId);

  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  await waitDeployed(fnId);

  const mediaId =
    process.env.LIFE_FORMULARIO_MEDIA_ID ||
    (() => {
      try {
        const reg = JSON.parse(fs.readFileSync(REG, "utf8"));
        return reg?.assets?.formulario_detalle_pedido_xlsx?.whatsapp_media_id || "";
      } catch {
        return "";
      }
    })();

  const secrets = {
    KAPSO_API_KEY: process.env.KAPSO_API_KEY,
    KAPSO_PHONE_NUMBER_ID:
      process.env.KAPSO_PHONE_NUMBER_ID ||
      process.env.LIFE_WHATSAPP_PHONE_NUMBER_ID ||
      "1095603153637786",
    LIFE_FORMULARIO_MEDIA_ID: mediaId,
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
  reg.assets = reg.assets || {};
  reg.assets.formulario_detalle_pedido_xlsx = {
    ...(reg.assets.formulario_detalle_pedido_xlsx || {}),
    local_path: "kapso/assets/Formulario-detalle-pedido.xlsx",
    filename: "Formulario-detalle-pedido-Life.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    phone_number_id: secrets.KAPSO_PHONE_NUMBER_ID,
    whatsapp_media_id:
      mediaId || reg.assets.formulario_detalle_pedido_xlsx?.whatsapp_media_id || null,
    kapso_function_id: fnId,
    kapso_function_name: FN_NAME,
    note: "Tool enviar_formulario_excel. Media ID ~30d; function re-upload B64 si falla.",
  };
  reg.order_detail = reg.order_detail || {};
  reg.order_detail.enviar_formulario_excel = {
    kapso_function_name: FN_NAME,
    kapso_function_id: fnId,
    local_path: "kapso/functions/enviar_formulario_excel.js",
    note: "Staff→cliente o vendedor→mismo chat: Formulario Life xlsx",
  };
  fs.writeFileSync(REG, JSON.stringify(reg, null, 2) + "\n");

  const ids = fs.existsSync(IDS) ? JSON.parse(fs.readFileSync(IDS, "utf8")) : {};
  ids.enviar_formulario_excel = fnId;
  fs.writeFileSync(IDS, JSON.stringify(ids, null, 2) + "\n");

  console.log("DONE", FN_NAME, fnId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
