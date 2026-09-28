#!/usr/bin/env node
/** Patch + deploy classify-contact-odoo */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const FN = "93d89e4c-603b-49fc-96f9-0b1c13df86be";
const CODE = path.join(ROOT, "kapso/functions/classify_contact_odoo_deploy.js");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

async function kapso(apiPath, init = {}) {
  const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(
    /\/$/,
    ""
  );
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

async function main() {
  loadEnv();
  require("child_process").execSync("node kapso/scripts/bundle_odoo_partner_phone.js", {
    cwd: ROOT,
    stdio: "inherit",
  });
  const code = fs.readFileSync(CODE, "utf8");

  const patch = await kapso(`/platform/v1/functions/${FN}`, {
    method: "PATCH",
    body: { function: { name: "classify-contact-odoo", code } },
  });
  console.log("patch", patch.status, patch.ok);
  const deploy = await kapso(`/platform/v1/functions/${FN}/deploy`, { method: "POST" });
  console.log("deploy", deploy.status, JSON.stringify(deploy.json).slice(0, 200));
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await kapso(`/platform/v1/functions/${FN}`);
    const status = st.json?.data?.status || st.json?.status;
    console.log("status", status);
    if (status === "deployed") break;
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
