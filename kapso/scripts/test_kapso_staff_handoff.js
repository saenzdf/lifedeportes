#!/usr/bin/env node
/**
 * Smoke test: openCustomerConversationForStaff skips without API key / conv id.
 */
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");

async function main() {
  const mod = await import(
    pathToFileURL(path.join(ROOT, "functions/lib/kapso_staff_handoff.js")).href
  );
  const { openCustomerConversationForStaff, isPreVendorHandoffStep } = mod;

  if (!isPreVendorHandoffStep("fn_ensure_crm_from_quote_1745500002590")) {
    throw new Error("expected pre_vendor for ensure-crm");
  }
  if (isPreVendorHandoffStep("agent_orquestador_1745500003000")) {
    throw new Error("vendor agent must not be pre_vendor");
  }

  const r1 = await openCustomerConversationForStaff({}, "");
  if (r1.skipped !== "missing_conversation_id") {
    throw new Error(`expected missing_conversation_id, got ${JSON.stringify(r1)}`);
  }

  const r2 = await openCustomerConversationForStaff({ LIFE_STAFF_NOTIFY_HANDOFF: "false" }, "abc");
  if (r2.skipped !== "handoff_disabled") {
    throw new Error(`expected handoff_disabled, got ${JSON.stringify(r2)}`);
  }

  const r3 = await openCustomerConversationForStaff(
    { LIFE_STAFF_NOTIFY_HANDOFF: "true" },
    "972b29c2-test"
  );
  if (r3.skipped !== "missing_kapso_api_key") {
    throw new Error(`expected missing_kapso_api_key, got ${JSON.stringify(r3)}`);
  }

  console.log("test_kapso_staff_handoff: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
