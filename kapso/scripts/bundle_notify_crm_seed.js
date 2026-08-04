#!/usr/bin/env node
/**
 * Rebuild notify_sales_interest(+_deploy) with CRM seed + interest gate inlined.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const notifyPath = path.join(root, "functions/notify_sales_interest.js");
const seedPath = path.join(root, "functions/lib/seed_crm_opportunity_inline.js");
const gatePath = path.join(root, "functions/lib/crm_interest_gate.js");

let notify = fs.readFileSync(notifyPath, "utf8");
const seed = fs
  .readFileSync(seedPath, "utf8")
  .replace(/^\/\*\*[\s\S]*?\*\//, "")
  .replace(/export\s+/g, "")
  .replace(/if \(typeof globalThis[\s\S]*$/m, "");

let gate = fs
  .readFileSync(gatePath, "utf8")
  .replace(/^\/\*\*[\s\S]*?\*\//, "")
  .replace(/export\s+function/g, "function")
  .replace(/export\s+\{[^}]+\};?/g, "")
  .replace(/export\s+/g, "");

const MARKER_START = "// --- LIFE_CRM_SEED_INLINE_START ---";
const MARKER_END = "// --- LIFE_CRM_SEED_INLINE_END ---";

// IIFE: CF Workers are ES modules — top-level duplicate `function compact` etc. fail deploy.
const inlineBlock = `${MARKER_START}
const { shouldSeedCrmOpportunity, seedCrmOpportunityFromQuote } = (() => {
${gate}
${seed}
return { shouldSeedCrmOpportunity, seedCrmOpportunityFromQuote };
})();
${MARKER_END}`;

if (notify.includes(MARKER_START)) {
  notify = notify.replace(
    new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}`),
    inlineBlock
  );
} else {
  notify = notify.replace(
    /async function handler\(request, env\) \{/,
    `${inlineBlock}\n\nasync function handler(request, env) {`
  );
}

const SEED_CALL_MARK = "// --- LIFE_CRM_SEED_CALL ---";
const seedCall = `
  ${SEED_CALL_MARK}
  let crmSeedResult = { ok: false, skipped: true, reason: "not_attempted" };
  const crmGate = shouldSeedCrmOpportunity({
    quote,
    note,
    lastCustomerText:
      vars.context?.last_inbound_text ||
      vars.staff?.last_inbound_text ||
      whatsapp?.messages?.[0]?.text ||
      "",
  });
  if (!crmGate.ok) {
    crmSeedResult = { ok: false, skipped: true, reason: crmGate.reason, message_es: crmGate.message_es };
  } else {
    quote.status = quote.status && quote.status !== "cotizando" ? quote.status : "interes_confirmado";
    quote.dossier_text = buildDossierText(quote, {
      customer_name: customerName || whatsappProfileName || "",
      customer_phone: customerPhone || "",
    });
    crmSeedResult = await seedCrmOpportunityFromQuote(env, {
      quote,
      customerPhone,
      customerName,
      whatsappName: whatsappProfileName,
      conversationId,
      dossierText: quote.dossier_text,
      statusOverride: "interes_confirmado",
      fingerprint,
      source: "notify_sales_interest",
    });
  }
`;

if (notify.includes(SEED_CALL_MARK)) {
  // replace previous call block until webhookPayload
  notify = notify.replace(
    new RegExp(`${SEED_CALL_MARK}[\\s\\S]*?const webhookPayload =`),
    `${seedCall}\n  const webhookPayload =`
  );
} else {
  notify = notify.replace(
    /const webhookPayload = \{/,
    `${seedCall}\n  const webhookPayload = {`
  );
}

// enrich crm_seed in response
if (!notify.includes("crm_seed_result")) {
  notify = notify.replace(
    /crm_seed: \{[\s\S]*?dossier_text: quote\.dossier_text,\s*\},/,
    `crm_seed: {
            next_step: "crm_opportunity",
            customer_phone: customerPhone || null,
            customer_name: customerName || null,
            product_text: quote.product_text,
            quantity: quote.quantity,
            unit_cop: quote.unit_cop,
            total_cop: quote.total_cop,
            lines: quote.lines,
            variants: quote.variants,
            notes: quote.notes || note || null,
            media_refs: quote.media_refs,
            revision: quote.revision,
            dossier_text: quote.dossier_text,
            gate: crmGate.ok ? "pass" : crmGate.reason,
            result: crmSeedResult,
          },
          crm_seed_result: crmSeedResult,`
  );
}

fs.writeFileSync(notifyPath, notify);
fs.writeFileSync(path.join(root, "functions/notify_sales_interest_deploy.js"), notify);
console.log("bundled notify_sales_interest (+ deploy) with CRM seed");
