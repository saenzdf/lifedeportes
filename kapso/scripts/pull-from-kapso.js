#!/usr/bin/env node
/**
 * Pull Kapso source-of-truth into local repo (read-only on Kapso).
 * Updates: workflow graph, agent prompt, deployed function code.
 *
 * Usage (from lifedeportes root or kapso/):
 *   node kapso/scripts/pull-from-kapso.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const functionsDir = path.join(root, "functions");
const promptsDir = path.join(root, "prompts");
const workflowPath = path.join(root, "workflow_lifedeportes_sales_inbound.json");
const promptPath = path.join(promptsDir, "agent_orchestrator_v3.md");
const registryPath = path.join(root, "service_registry.json");
const snapshotPath = path.join(root, "kapso_snapshot.json");
const bundlePath = path.join(functionsDir, "_bundle_all_functions.js");

const WORKFLOW_ID = "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";

function slugToLocalFilename(slug) {
  return `${String(slug).replace(/-/g, "_")}.js`;
}

async function kapsoFetch(apiPath) {
  const base = process.env.KAPSO_API_BASE_URL;
  const key = process.env.KAPSO_API_KEY;
  if (!base || !key) {
    throw new Error("Missing KAPSO_API_BASE_URL or KAPSO_API_KEY");
  }
  const url = `${base.replace(/\/$/, "")}${apiPath}`;
  const resp = await fetch(url, {
    headers: {
      "X-API-Key": key,
      Accept: "application/json",
    },
  });
  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from ${apiPath}: ${text.slice(0, 200)}`);
  }
  if (!resp.ok) {
    throw new Error(`Kapso ${apiPath} failed (${resp.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

function findAgentNode(definition) {
  const nodes = definition?.nodes || [];
  return (
    nodes.find((n) => n.id === "agent_orquestador_1745500003000") ||
    nodes.find((n) => n.data?.node_type === "agent")
  );
}

function updateServiceRegistry(functions) {
  if (!fs.existsSync(registryPath)) return { updated: 0 };
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const byName = new Map(functions.map((fn) => [fn.name, fn]));
  let updated = 0;

  const touch = (entry) => {
    if (!entry?.kapso_function_name) return;
    const remote = byName.get(entry.kapso_function_name);
    if (!remote) return;
    if (entry.kapso_function_id !== remote.id) {
      entry.kapso_function_id = remote.id;
      updated += 1;
    }
  };

  for (const svc of Object.values(registry.services || {})) touch(svc);
  for (const guard of Object.values(registry.guards || {})) touch(guard);
  for (const router of Object.values(registry.routers || {})) touch(router);

  if (registry.kapso) {
    registry.kapso.synced_at = new Date().toISOString();
    registry.kapso.workflow_lock_version = registry.kapso.workflow_lock_version || null;
  }

  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return { updated };
}

function writeFunctionBundle(functions) {
  const sorted = [...functions].sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  const syncedAt = new Date().toISOString();
  const parts = [
    "/**",
    " * Life Deportes — bundle de funciones desplegadas en Kapso.",
    ` * Generado: ${syncedAt}`,
    " * Editar los .js individuales en kapso/functions/; este archivo es referencia local.",
    ` * Funciones: ${sorted.length}`,
    " */",
    "",
  ];

  for (const fn of sorted) {
    if (typeof fn.code !== "string") continue;
    parts.push(`// ===== ${fn.slug} (${fn.id}) =====`);
    parts.push(fn.code.trim());
    parts.push("");
  }

  fs.writeFileSync(bundlePath, parts.join("\n"), "utf8");
  return sorted.length;
}

function writeKapsoSnapshot(workflow, functions, triggers) {
  const deployed = functions.filter((fn) => fn.name && typeof fn.code === "string");
  const deployedSlugs = new Set(deployed.map((fn) => slugToLocalFilename(fn.slug || fn.name)));
  const localOnly = fs.existsSync(functionsDir)
    ? fs
        .readdirSync(functionsDir)
        .filter((name) => name.endsWith(".js") && !name.startsWith("_"))
        .filter((name) => !deployedSlugs.has(name))
        .map((name) => `kapso/functions/${name}`)
    : [];

  const snapshot = {
    synced_at: new Date().toISOString(),
    project: {
      id: "b470d474-6a7a-4d84-a214-6cd4b198b4f3",
      name: "Life Deportes",
    },
    workflows: [
      {
        id: WORKFLOW_ID,
        name: workflow.name || "lifedeportes_sales_inbound",
        slug: workflow.slug || "lifedeportes-sales-inbound",
        status: workflow.status || "active",
        lock_version: workflow.lock_version ?? null,
        updated_at: workflow.updated_at || null,
        local_graph: "kapso/workflow_lifedeportes_sales_inbound.json",
        local_prompt: "kapso/prompts/agent_orchestrator_v3.md",
        triggers: (triggers || []).map((trigger) => ({
          id: trigger.id,
          active: trigger.active,
          type: trigger.trigger_type,
          display_name: trigger.display_name,
          phone_number_id: trigger.triggerable?.phone_number_id || null,
          whatsapp_config_id: trigger.triggerable?.whatsapp_config_id || null,
        })),
      },
    ],
    functions: deployed
      .sort((a, b) => String(a.slug).localeCompare(String(b.slug)))
      .map((fn) => ({
        id: fn.id,
        name: fn.name,
        slug: fn.slug,
        status: fn.status,
        public_endpoint: fn.public_endpoint,
        updated_at: fn.updated_at,
        last_deployed_at: fn.last_deployed_at,
        local_path: `kapso/functions/${slugToLocalFilename(fn.slug || fn.name)}`,
      })),
    local_only_functions: localOnly,
  };

  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return { deployed: deployed.length, localOnly: localOnly.length };
}

async function main() {
  const wfResp = await kapsoFetch(`/platform/v1/workflows/${WORKFLOW_ID}/definition`);
  const workflow = wfResp.data || wfResp;
  const definition = workflow.definition;
  if (!definition) throw new Error("Workflow definition missing");

  fs.writeFileSync(workflowPath, `${JSON.stringify(definition, null, 2)}\n`, "utf8");
  console.log("OK workflow:", workflowPath);

  const agent = findAgentNode(definition);
  const prompt = agent?.data?.config?.system_prompt;
  if (!prompt) throw new Error("Agent system_prompt not found in workflow");
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.writeFileSync(promptPath, prompt.endsWith("\n") ? prompt : `${prompt}\n`, "utf8");
  console.log("OK prompt:", promptPath, `(${prompt.length} chars)`);

  const fnResp = await kapsoFetch("/platform/v1/functions");
  const functions = fnResp.data || fnResp;
  if (!Array.isArray(functions)) throw new Error("Unexpected functions response");

  fs.mkdirSync(functionsDir, { recursive: true });
  let written = 0;
  for (const fn of functions) {
    if (!fn.name || typeof fn.code !== "string") continue;
    const localName = slugToLocalFilename(fn.slug || fn.name);
    const outPath = path.join(functionsDir, localName);
    const code = fn.code.endsWith("\n") ? fn.code : `${fn.code}\n`;
    fs.writeFileSync(outPath, code, "utf8");
    written += 1;
    console.log("OK function:", localName, `(${fn.name})`);
  }

  const registry = updateServiceRegistry(functions);
  if (registry.updated) {
    console.log("OK service_registry.json:", `${registry.updated} id(s) updated`);
  } else {
    console.log("OK service_registry.json: ids unchanged");
  }

  const trResp = await kapsoFetch(`/platform/v1/workflows/${WORKFLOW_ID}/triggers`);
  const triggers = trResp.data?.triggers || trResp.triggers || [];
  const snapshot = writeKapsoSnapshot(workflow, functions, triggers);
  console.log("OK snapshot:", snapshotPath, `(${snapshot.deployed} deployed, ${snapshot.localOnly} local-only)`);

  const bundled = writeFunctionBundle(functions);
  console.log("OK bundle:", bundlePath, `(${bundled} functions)`);

  if (registryPath && fs.existsSync(registryPath)) {
    const reg = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    if (reg.kapso) {
      reg.kapso.workflow_lock_version = workflow.lock_version ?? null;
      reg.kapso.synced_at = new Date().toISOString();
      fs.writeFileSync(registryPath, `${JSON.stringify(reg, null, 2)}\n`, "utf8");
    }
  }

  console.log(`Done. ${written} functions, 1 workflow, 1 prompt, 1 bundle, 1 snapshot.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
