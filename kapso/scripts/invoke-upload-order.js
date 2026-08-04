#!/usr/bin/env node
/**
 * Invoca odoo-create-lead-and-so con draft_payload de una ejecucion Kapso.
 * Uso: node kapso/scripts/invoke-upload-order.js --execution-id <uuid>
 */
const fs = require("fs");
const path = require("path");

const skillScripts = path.join(
  process.env.HOME || "",
  ".agents/skills/automate-whatsapp/scripts"
);

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--execution-id") out.executionId = argv[i + 1];
  }
  return out;
}

async function main() {
  const { executionId } = parseArgs(process.argv);
  if (!executionId) {
    console.error("Usage: node kapso/scripts/invoke-upload-order.js --execution-id <uuid>");
    process.exit(1);
  }

  const registryPath = path.join(__dirname, "..", "service_registry.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const fnId = registry?.services?.activar_cotizacion_odoo?.kapso_function_id;
  if (!fnId) {
    console.error("Missing activar_cotizacion_odoo function id in service_registry.json");
    process.exit(1);
  }

  const getContext = require(path.join(skillScripts, "get-context-value.js"));
  // Fallback: shell out if module not importable
  const { execSync } = require("child_process");
  const draftRaw = execSync(
    `node "${path.join(skillScripts, "get-context-value.js")}" "${executionId}" --variable-path vars.quote.draft_payload`,
    { encoding: "utf8" }
  );
  const waRaw = execSync(
    `node "${path.join(skillScripts, "get-context-value.js")}" "${executionId}" --variable-path vars.user.wa_id`,
    { encoding: "utf8" }
  );

  let draftPayload;
  let customerWaId;
  try {
    draftPayload = JSON.parse(draftRaw.trim());
    customerWaId = JSON.parse(waRaw.trim());
  } catch {
    draftPayload = draftRaw.trim();
    customerWaId = waRaw.trim().replace(/"/g, "");
  }

  if (!draftPayload || typeof draftPayload !== "object") {
    console.error("No vars.quote.draft_payload in execution", executionId);
    process.exit(1);
  }

  const payload = {
    input: {
      draft_payload: draftPayload,
      customer_wa_id: customerWaId,
    },
    execution_context: { vars: { quote: { draft_payload: draftPayload }, user: { wa_id: customerWaId } } },
  };

  execSync(
    `node "${path.join(skillScripts, "invoke-function.js")}" --function-id "${fnId}" --payload '${JSON.stringify(payload).replace(/'/g, "'\\''")}'`,
    { stdio: "inherit" }
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
