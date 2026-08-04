#!/usr/bin/env node
/**
 * Toggle LIFE_FORCE_STAFF_LANE on staff-allowlist-check (function secret).
 *
 * Use for Kapso inbound_message UI tests when you cannot pick the sender phone.
 * Prefer Kapso Project env var (Development only) — see kapso/docs/staff_only_mode.md.
 *
 * WARNING: function secrets apply to ALL executions. Disable before enabling
 * the public inbound trigger.
 *
 * Usage:
 *   node kapso/scripts/force_staff_test_mode.js status
 *   node kapso/scripts/force_staff_test_mode.js enable
 *   node kapso/scripts/force_staff_test_mode.js disable
 */
const fs = require("fs");
const path = require("path");

const FN_ID = "53d38630-abc6-4512-bfec-58cbc6c3bc29";
const SECRET_NAME = "LIFE_FORCE_STAFF_LANE";

async function kapsoFetch(apiPath, init = {}) {
  const base = process.env.KAPSO_API_BASE_URL?.replace(/\/$/, "");
  const key = process.env.KAPSO_API_KEY;
  if (!base || !key) throw new Error("Missing KAPSO_API_BASE_URL or KAPSO_API_KEY");
  const resp = await fetch(`${base}${apiPath}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": key,
      ...(init.headers || {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await resp.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, json };
}

async function listSecrets() {
  const res = await kapsoFetch(`/platform/v1/functions/${FN_ID}/secrets`);
  if (!res.ok) throw new Error(`list secrets failed: ${res.status}`);
  return res.json?.data?.secrets || [];
}

async function main() {
  const action = (process.argv[2] || "status").toLowerCase();
  const secrets = await listSecrets();
  const hasSecret = secrets.some((s) => s.name === SECRET_NAME);

  if (action === "status") {
    console.log(
      JSON.stringify(
        {
          function_id: FN_ID,
          secret_name: SECRET_NAME,
          enabled_via_function_secret: hasSecret,
          note: "Kapso UI test runs also read Project/Flow env vars (Development column).",
        },
        null,
        2
      )
    );
    return;
  }

  if (action === "enable") {
    if (hasSecret) {
      console.log(JSON.stringify({ ok: true, message: "Already enabled" }, null, 2));
      return;
    }
    const res = await kapsoFetch(`/platform/v1/functions/${FN_ID}/secrets`, {
      method: "POST",
      body: { secret: { name: SECRET_NAME, value: "true" } },
    });
    if (!res.ok) {
      throw new Error(`create secret failed (${res.status}): ${JSON.stringify(res.json)}`);
    }
    const deploy = await kapsoFetch(`/platform/v1/functions/${FN_ID}/deploy`, {
      method: "POST",
      body: {},
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          enabled: true,
          secret: SECRET_NAME,
          deploy_status: deploy.status,
          warning: "Disable before turning on public inbound WhatsApp trigger.",
        },
        null,
        2
      )
    );
    return;
  }

  if (action === "disable") {
    if (!hasSecret) {
      console.log(JSON.stringify({ ok: true, message: "Already disabled" }, null, 2));
      return;
    }
    const res = await kapsoFetch(
      `/platform/v1/functions/${FN_ID}/secrets/${encodeURIComponent(SECRET_NAME)}`,
      { method: "DELETE" }
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`delete secret failed (${res.status}): ${JSON.stringify(res.json)}`);
    }
    await kapsoFetch(`/platform/v1/functions/${FN_ID}/deploy`, { method: "POST", body: {} });
    console.log(JSON.stringify({ ok: true, enabled: false }, null, 2));
    return;
  }

  throw new Error("Use status | enable | disable");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
