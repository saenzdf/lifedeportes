#!/usr/bin/env node
/**
 * Create or update a Kapso platform function by name.
 * Prints function id on stdout; JSON status on stderr if verbose.
 */
import { readFileSync } from "node:fs";
import { kapsoConfigFromEnv, kapsoRequest } from "../../.agents/skills/automate-whatsapp/scripts/lib/functions/kapso-api.js";

const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
}

const name = flag("name");
const codeFile = flag("code-file");
const knownId = flag("function-id");

if (!name || !codeFile) {
  console.error("usage: upsert_kapso_function.js --name <n> --code-file <path> [--function-id <id>]");
  process.exit(1);
}

const code = readFileSync(codeFile, "utf8");
const config = kapsoConfigFromEnv();

async function listAll() {
  const data = await kapsoRequest(config, "/platform/v1/functions");
  return data?.data || data || [];
}

async function createFn() {
  return kapsoRequest(config, "/platform/v1/functions", {
    method: "POST",
    body: JSON.stringify({ function: { name, code } }),
  });
}

async function updateFn(id) {
  return kapsoRequest(config, `/platform/v1/functions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ function: { name, code } }),
  });
}

async function resolveId() {
  if (knownId) return knownId;
  const list = await listAll();
  const hit = list.find((f) => f.name === name);
  return hit?.id || null;
}

async function main() {
  let id = await resolveId();
  if (id) {
    await updateFn(id);
    console.log(id);
    return;
  }
  try {
    const created = await createFn();
    id = created?.data?.id || created?.id;
    if (!id) throw new Error("create returned no id");
    console.log(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already been taken|422/.test(msg)) throw e;
    const list = await listAll();
    const hit = list.find((f) => f.name === name);
    if (!hit?.id) throw e;
    await updateFn(hit.id);
    console.log(hit.id);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
