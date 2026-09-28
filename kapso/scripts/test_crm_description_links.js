#!/usr/bin/env node
/* Test local de links CRM (Kapso + wa.me) y merge de Asignado a. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(
  path.join(__dirname, "..", "functions", "notify_sales_interest.js"),
  "utf8"
);

function extract(fnName) {
  const start = src.indexOf(`function ${fnName}`);
  if (start < 0) throw new Error(`missing ${fnName}`);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${fnName}`);
}

const sandbox = { compact: (v) => String(v ?? "").replace(/\s+/g, " ").trim() };
vm.createContext(sandbox);
for (const name of [
  "buildWaMeLink",
  "kapsoInboxUrl",
  "crmConversationLinksHtml",
  "injectCrmConversationLinks",
]) {
  vm.runInContext(extract(name), sandbox);
}

const startMarker =
  "const { shouldSeedCrmOpportunity, seedCrmOpportunityFromQuote, classifyLeadIntent } = (() => {";
const start = src.indexOf(startMarker);
const end = src.indexOf("})();", start);
const expr =
  src.slice(start, start + startMarker.length).replace(
    startMarker,
    "globalThis.__clf = (() => {"
  ) +
  src.slice(start + startMarker.length, end) +
  "})();";
vm.runInContext(expr, sandbox);
const merge = (() => {
  const iife = sandbox.__clf;
  // mergeAssigneeLabel is inside IIFE but not returned; re-eval helpers from IIFE source.
  const helperSrc = extract("mergeAssigneeLabel");
  const extractSrc = extract("extractAssigneeLabel");
  vm.runInContext(extractSrc + "\n" + helperSrc, sandbox);
  return sandbox.mergeAssigneeLabel;
})();
void merge;

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log("PASS", name);
  } else {
    fail++;
    console.log("FAIL", name);
  }
}

const env = {};
const conv = "1bcd0171-a8e9-4782-85ca-cd6026134e04";
const html = sandbox.crmConversationLinksHtml(env, conv, "3000000006");
check("kapso link present", /inbox\.kapso\.ai\/projects\/.*conversation_id=1bcd0171/.test(html));
check("wa.me present when phone", /wa\.me\/3000000006/.test(html));
check("labels", /Abrir chat en Kapso/.test(html) && /Escribir por WhatsApp/.test(html));

const noPhone = sandbox.crmConversationLinksHtml(env, conv, "");
check("no fake wa.me without phone", /Abrir chat en Kapso/.test(noPhone) && !/wa\.me\//.test(noPhone));

const stub = `<p>conv=${conv}</p>\n<p><b>Asignado a: Paola</b></p>`;
const upgraded = sandbox.injectCrmConversationLinks(stub, env, conv, "3000000061");
check("inject prepends kapso on stub", upgraded.startsWith("<p><a href=\"https://inbox.kapso.ai"));
check("inject keeps assignee", /Asignado a: Paola/.test(upgraded));

const already = sandbox.injectCrmConversationLinks(html, env, conv, "3000000006");
check("inject idempotent", already === html);

const merged = sandbox.mergeAssigneeLabel(
  "<p>brief</p>",
  "<p><b>Asignado a: Javier</b></p>"
);
check("merge keeps assignee from existing", /Asignado a: Javier/.test(merged));
check(
  "merge does not duplicate",
  sandbox.mergeAssigneeLabel(merged, "<p><b>Asignado a: Paola</b></p>").indexOf("Asignado a") ===
    merged.indexOf("Asignado a")
);

const hasLet = /let partnerId = await findOrCreatePartner/.test(src);
check("seed uses let partnerId (no const crash)", hasLet);
check(
  "claimAssignee no longer writes visible conv= stub only",
  /source=claim_assignee/.test(src) && /crmConversationLinksHtml\(env, conversationId/.test(src)
);
check("reject BSUID as phone", /function realCustomerPhone/.test(src) && /CO\\\./.test(src));
check("claim searches archived leads", /active_test:\s*false/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
