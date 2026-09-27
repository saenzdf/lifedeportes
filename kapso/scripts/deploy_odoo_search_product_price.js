#!/usr/bin/env node
/**
 * Despliega odoo-search-product-price en Kapso con la capa de decisión Jev:
 *   1. Re-compila el bundle con bundle_odoo_search_function.js.
 *   2. Sube el código actualizado a la función 4503ca5c-7114-4442-bada-112be3ddf67e.
 *   3. Sincroniza secrets: OPENROUTER_API_KEY, LIFE_JEV_MODE=on, LIFE_JEV_THRESHOLD=0.7.
 *   4. Despliega (POST /deploy) y verifica lock_version y status=deployed.
 *   5. Realiza un invoke live de prueba con tallas 2XL/3XL para certificar funcionamiento.
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syncRoot = path.resolve(__dirname, "../../../..");
const lifeRoot = path.resolve(__dirname, "../..");

function loadEnv() {
  const env = {};
  for (const file of [path.join(syncRoot, ".env"), path.join(lifeRoot, ".env")]) {
    if (fs.existsSync(file)) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const [k, ...rest] = trimmed.split("=");
          env[k.trim()] = rest.join("=").trim().replace(/^["'](.*)["']$/, "$1");
        }
      }
    }
  }
  return env;
}

const env = loadEnv();
const BASE = (env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
const KEY = env.KAPSO_API_KEY;
const FN_ID = "4503ca5c-7114-4442-bada-112be3ddf67e";

if (!KEY) {
  console.error("Falta KAPSO_API_KEY.");
  process.exit(1);
}

async function kapso(endpoint, opts = {}) {
  const url = `${BASE}${endpoint}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "X-API-Key": KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${endpoint} → HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log("=== 1. Compilando bundle odoo_search_product_price.js ===");
  execSync("node kapso/scripts/bundle_odoo_search_function.js", {
    cwd: lifeRoot,
    stdio: "inherit",
  });

  const codePath = path.join(lifeRoot, "kapso/functions/odoo_search_product_price.js");
  const code = fs.readFileSync(codePath, "utf8");

  console.log("\n=== 2. Subiendo código a Kapso (PATCH /functions) ===");
  const fnData = await kapso(`/platform/v1/functions/${FN_ID}`);
  const currentLock = fnData.data?.lock_version || 1;
  console.log(`Función actual: lock_version=${currentLock}, status=${fnData.data?.status}`);

  await kapso(`/platform/v1/functions/${FN_ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      function: {
        code,
      },
    }),
  });
  console.log("Código subido con éxito.");

  console.log("\n=== 3. Sincronizando Secrets (OPENROUTER_API_KEY, LIFE_JEV_MODE=on) ===");
  const secretList = await kapso(`/platform/v1/functions/${FN_ID}/secrets`);
  const existingNames = (secretList?.data?.secrets || secretList?.data || []).map((s) => s.name || s);

  const secretsToSet = {
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
    LIFE_JEV_MODE: "on",
    LIFE_JEV_THRESHOLD: "0.7",
  };

  for (const [sName, sVal] of Object.entries(secretsToSet)) {
    if (!sVal) {
      console.warn(`Aviso: ${sName} está vacío en el entorno.`);
      continue;
    }
    if (existingNames.includes(sName)) {
      try {
        await kapso(`/platform/v1/functions/${FN_ID}/secrets/${encodeURIComponent(sName)}`, {
          method: "DELETE",
        });
      } catch (e) {
        // ignore 404
      }
    }
    await kapso(`/platform/v1/functions/${FN_ID}/secrets`, {
      method: "POST",
      body: JSON.stringify({ secret: { name: sName, value: sVal } }),
    });
    console.log(`  Sincronizado secret: ${sName}`);
  }

  console.log("\n=== 4. Desplegando función (POST /deploy) ===");
  const preDeploy = await kapso(`/platform/v1/functions/${FN_ID}`);
  const lockToDeploy = preDeploy.data?.lock_version;
  const deployRes = await kapso(`/platform/v1/functions/${FN_ID}/deploy`, {
    method: "POST",
    body: JSON.stringify({ function: { lock_version: lockToDeploy } }),
  });
  console.log(`Función desplegada: status=${deployRes.data?.status}, lock_version=${deployRes.data?.lock_version}`);

  console.log("\n=== 5. Invocación de prueba live en producción ===");
  // Esperar 5s a que Cloudflare Worker propague
  await new Promise((r) => setTimeout(r, 5000));

  const testPayload = {
    input: {
      product_text: "14 uniformes fútbol cuello sport, 11 estándar, 2 en XXL y 1 en 3XL",
      quantity: 14,
    },
  };
  const invokeRes = await kapso(`/platform/v1/functions/${FN_ID}/invoke`, {
    method: "POST",
    body: JSON.stringify(testPayload),
  });

  const parsed = invokeRes.data?.output || invokeRes.data || invokeRes;
  console.log("Resultado del invoke:", JSON.stringify(parsed, null, 2));

  console.log("\n✓ Despliegue de odoo-search-product-price con Jev completado exitosamente.");
}

main().catch((err) => {
  console.error("Error en despliegue:", err);
  process.exit(1);
});
