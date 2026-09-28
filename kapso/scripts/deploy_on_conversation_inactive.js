#!/usr/bin/env node
/**
 * Deploy on-conversation-inactive + webhook WhatsApp inactive 180 min.
 *
 *   node kapso/scripts/deploy_on_conversation_inactive.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const NAME = "on-conversation-inactive";
const CODE = path.join(ROOT, "kapso/functions/on_conversation_inactive.js");
const REGISTRY = path.join(ROOT, "kapso/service_registry.json");
const SECRET_FILE = path.join(ROOT, "scratch", "contact_shared_webhook_secret.txt");
const PHONE_ID = "1095603153637786";
const INACTIVITY_MINUTES = 180;

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

function resolveSecret() {
  if (process.env.LIFE_WEBHOOK_SECRET) return process.env.LIFE_WEBHOOK_SECRET;
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, "utf8").trim();
  throw new Error("missing LIFE_WEBHOOK_SECRET");
}

async function kapso(apiPath, init = {}) {
  const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const res = await fetch(`${base}${apiPath}`, {
    ...init,
    headers: {
      "X-API-Key": process.env.KAPSO_API_KEY,
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

function readRegistryId() {
  try {
    const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
    return reg?.functions?.on_conversation_inactive?.kapso_function_id || null;
  } catch {
    return null;
  }
}

function writeRegistry(patch) {
  const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  reg.functions = reg.functions || {};
  reg.functions.on_conversation_inactive = {
    kapso_function_name: NAME,
    local_path: "kapso/functions/on_conversation_inactive.js",
    public_endpoint: true,
    inactivity_minutes: INACTIVITY_MINUTES,
    note: "Webhook conversation.inactive 180 min → ended waiting vendedor. No toca staff.",
    ...reg.functions.on_conversation_inactive,
    ...patch,
  };
  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + "\n");
}

async function upsertSecret(fnId, name, value) {
  if (!value) return;
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
  console.log("secret", name, create.ok ? "ok" : create.status);
}

async function waitDeployed(fnId) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const g = await kapso(`/platform/v1/functions/${fnId}`);
    const data = g.json?.data?.data || g.json?.data || {};
    console.log("status", data.status);
    if (data.status === "deployed" || data.status === "active") return data;
    if (data.status === "error" && i > 4) throw new Error("deploy error");
  }
  throw new Error("deploy timeout");
}

async function ensureWebhook(invokeUrl, secret) {
  const list = await kapso(`/platform/v1/whatsapp/phone_numbers/${PHONE_ID}/webhooks`);
  const items = list.json?.data || [];
  const arr = Array.isArray(items) ? items : items.webhooks || items.data || [];
  const hit = (arr || []).find(
    (w) => Array.isArray(w.events) && w.events.includes("whatsapp.conversation.inactive")
  );
  if (hit) {
    const patch = await kapso(
      `/platform/v1/whatsapp/phone_numbers/${PHONE_ID}/webhooks/${hit.id}`,
      {
        method: "PATCH",
        body: {
          whatsapp_webhook: {
            url: invokeUrl,
            events: ["whatsapp.conversation.inactive"],
            inactivity_minutes: INACTIVITY_MINUTES,
            active: true,
            secret_key: secret,
            headers: { "X-Webhook-Secret": secret },
            payload_version: "v2",
          },
        },
      }
    );
    console.log("webhook patch", patch.status, hit.id);
    return hit.id;
  }
  const created = await kapso(`/platform/v1/whatsapp/phone_numbers/${PHONE_ID}/webhooks`, {
    method: "POST",
    body: {
      whatsapp_webhook: {
        url: invokeUrl,
        kind: "kapso",
        events: ["whatsapp.conversation.inactive"],
        inactivity_minutes: INACTIVITY_MINUTES,
        active: true,
        secret_key: secret,
        headers: { "X-Webhook-Secret": secret },
        payload_version: "v2",
      },
    },
  });
  console.log("webhook create", created.status, JSON.stringify(created.json).slice(0, 400));
  if (!created.ok) throw new Error("webhook create failed");
  return created.json?.data?.id || created.json?.id;
}

async function main() {
  loadEnv();
  const secret = resolveSecret();
  const code = fs.readFileSync(CODE, "utf8");
  let fnId = readRegistryId();

  if (!fnId) {
    const created = await kapso(`/platform/v1/functions`, {
      method: "POST",
      body: {
        function: {
          name: NAME,
          description:
            "Webhook conversation.inactive: ended waiting vendedor de esa conversación",
          code,
          function_type: "cloudflare_worker",
          public_endpoint: true,
        },
      },
    });
    console.log("create", created.status, JSON.stringify(created.json).slice(0, 300));
    fnId = created.json?.data?.id || created.json?.data?.data?.id;
    if (!fnId) throw new Error("create_failed");
  } else {
    const patch = await kapso(`/platform/v1/functions/${fnId}`, {
      method: "PATCH",
      body: { function: { name: NAME, code, public_endpoint: true } },
    });
    console.log("patch", patch.status, patch.ok);
  }

  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  await waitDeployed(fnId);

  await upsertSecret(fnId, "KAPSO_API_KEY", process.env.KAPSO_API_KEY);
  await upsertSecret(fnId, "KAPSO_API_BASE_URL", process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai");
  await upsertSecret(fnId, "LIFE_WORKFLOW_ID", "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6");
  await upsertSecret(fnId, "LIFE_WEBHOOK_SECRET", secret);

  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  const data = await waitDeployed(fnId);
  const invokeUrl =
    data.endpoint_url || `https://api.kapso.ai/platform/v1/functions/${fnId}/invoke`;

  const webhookId = await ensureWebhook(invokeUrl, secret);
  writeRegistry({
    kapso_function_id: fnId,
    invoke_url: invokeUrl,
    webhook_id: webhookId,
    phone_number_id: PHONE_ID,
  });

  console.log("function_id", fnId);
  console.log("invoke_url", invokeUrl);
  console.log("webhook_id", webhookId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
