#!/usr/bin/env node
/**
 * Compare Kapso deployed functions vs IDs referenced in the live workflow graph.
 * Dry-run by default; pass --apply to DELETE orphans from the project.
 *
 * Usage (from lifedeportes/):
 *   node kapso/scripts/prune_orphan_functions.js
 *   node kapso/scripts/prune_orphan_functions.js --apply
 *   node kapso/scripts/prune_orphan_functions.js --workflow-id <uuid>
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const registryPath = path.join(root, "service_registry.json");
const defaultWorkflowId =
  JSON.parse(fs.readFileSync(registryPath, "utf8"))?.kapso?.workflow_id ||
  "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const workflowId =
  argv.find((a, i) => argv[i - 1] === "--workflow-id") ||
  argv.find((a) => !a.startsWith("-")) ||
  defaultWorkflowId;

const KEEP_NAMES = new Set(
  (process.env.PRUNE_KEEP_NAMES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

async function kapsoFetch(apiPath, init = {}) {
  const base = process.env.KAPSO_API_BASE_URL?.replace(/\/$/, "");
  const key = process.env.KAPSO_API_KEY;
  if (!base || !key) {
    throw new Error("Missing KAPSO_API_BASE_URL or KAPSO_API_KEY");
  }
  const resp = await fetch(`${base}${apiPath}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": key,
      ...(init.headers || {}),
    },
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

function collectFunctionRefs(definition) {
  const json = JSON.stringify(definition);
  const ids = new Set(
    [...json.matchAll(/"function_id"\s*:\s*"([0-9a-f-]{36})"/gi)].map((m) => m[1])
  );
  const names = new Set(
    [...json.matchAll(/"function_name"\s*:\s*"([^"]+)"/gi)].map((m) => m[1])
  );
  return { ids, names };
}

async function main() {
  const [fnRes, graphRes] = await Promise.all([
    kapsoFetch("/platform/v1/functions"),
    kapsoFetch(`/platform/v1/workflows/${workflowId}/definition`),
  ]);

  if (!fnRes.ok) {
    throw new Error(`list functions failed (${fnRes.status}): ${JSON.stringify(fnRes.json)}`);
  }
  if (!graphRes.ok) {
    throw new Error(`get graph failed (${graphRes.status}): ${JSON.stringify(graphRes.json)}`);
  }

  const functions = fnRes.json?.data || fnRes.json;
  const workflow = graphRes.json?.data || graphRes.json;
  const definition = workflow?.definition;
  const lockVersion = workflow?.lock_version;

  if (!definition || typeof definition !== "object") {
    throw new Error("Workflow definition missing in API response");
  }

  const { ids: usedIds, names: usedNames } = collectFunctionRefs(definition);
  const orphans = functions
    .filter((fn) => !usedIds.has(fn.id) && !KEEP_NAMES.has(fn.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const report = {
    workflow_id: workflowId,
    workflow_lock_version: lockVersion,
    deployed_total: functions.length,
    used_in_graph: usedIds.size,
    keep_override_names: [...KEEP_NAMES],
    orphans: orphans.map((fn) => ({
      id: fn.id,
      name: fn.name,
      slug: fn.slug,
      status: fn.status,
    })),
    used_function_names: [...usedNames].sort(),
  };

  console.log(JSON.stringify(report, null, 2));

  if (!apply) {
    console.error(
      `\nDry-run only. Re-run with --apply to delete ${orphans.length} orphan function(s).`
    );
    return;
  }

  if (orphans.length === 0) {
    console.error("\nNothing to delete.");
    return;
  }

  const results = [];
  for (const fn of orphans) {
    const del = await kapsoFetch(`/platform/v1/functions/${fn.id}`, { method: "DELETE" });
    results.push({
      id: fn.id,
      name: fn.name,
      deleted: del.ok || del.status === 204,
      status: del.status,
    });
  }

  console.error("\nDelete results:");
  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.deleted);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
