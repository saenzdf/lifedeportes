const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const base = process.env.KAPSO_API_BASE_URL;
const key = process.env.KAPSO_API_KEY;
const PHONE = "573114129366";
const WF_ID = "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";

// Replicamos la lógica de kapso_session_hydrate.js para depurar
function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function quoteLooksUseful(quote = {}) {
  if (!quote || typeof quote !== "object") return false;
  if (asArray(quote.lines).some((l) => compact(l.product_text) || num(l.quantity) > 0)) {
    return true;
  }
  return Boolean(
    compact(quote.product_text) ||
      num(quote.quantity) > 0 ||
      num(quote.unit_cop) > 0 ||
      compact(quote.customer_display_name) ||
      compact(quote.notes) ||
      asArray(quote.media_refs).length > 0
  );
}

async function kapsoFetch(pathname) {
  const url = `${base}${pathname}`;
  const res = await fetch(url, {
    headers: {
      "X-API-Key": key,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch ${pathname} failed: ${res.status}`);
  }
  return res.json();
}

function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.conversations)) return payload.conversations;
  if (Array.isArray(payload?.whatsapp_conversations)) return payload.whatsapp_conversations;
  if (Array.isArray(payload?.executions)) return payload.executions;
  return [];
}

function conversationMatchesPhone(conversation, phoneDigits) {
  const want = String(phoneDigits || "").replace(/\D/g, "");
  if (!want) return false;
  const got = String(
    conversation?.phone_number ||
      conversation?.phone ||
      conversation?.wa_id ||
      ""
  ).replace(/\D/g, "");
  if (!got) return false;
  if (got === want) return true;
  const wantLocal = want.length >= 10 ? want.slice(-10) : want;
  const gotLocal = got.length >= 10 ? got.slice(-10) : got;
  return wantLocal.length >= 10 && wantLocal === gotLocal;
}

async function main() {
  console.log("Starting test_hydrate...");
  
  const currentConversationId = "1f78b37f-d8ff-4464-be61-9d56f7a8c084";
  const currentExecutionId = "9336dcc3-e81c-42d2-9981-3cd722a554aa";
  
  const conversationsPayload = await kapsoFetch(`/platform/v1/whatsapp/conversations?phone_number=${PHONE}&limit=20`);
  const conversationsRaw = unwrapList(conversationsPayload);
  const conversations = conversationsRaw.filter((c) =>
    conversationMatchesPhone(c, PHONE)
  );
  
  console.log("Conversations matched:", conversations.map(c => ({ id: c.id, status: c.status })));
  
  const ordered = [...conversations].sort((a, b) => {
    const ta = Date.parse(a.last_active_at || a.updated_at || a.created_at || 0);
    const tb = Date.parse(b.last_active_at || b.updated_at || b.created_at || 0);
    return tb - ta;
  });
  
  console.log("Ordered IDs:", ordered.map(o => o.id));
  
  for (const conversation of ordered) {
    const conversationId = conversation.id;
    console.log(`\nEvaluating conversation ID: ${conversationId} (status: ${conversation.status})`);
    
    const executionsPayload = await kapsoFetch(`/platform/v1/workflows/${WF_ID}/executions?whatsapp_conversation_id=${conversationId}&per_page=5`);
    const executions = unwrapList(executionsPayload?.executions ? executionsPayload : executionsPayload);
    
    console.log(`  Executions found: ${executions.length}`);
    for (const execution of executions) {
      const executionId = execution.id;
      if (executionId === currentExecutionId) {
        console.log(`    - Skipping current execution ID: ${executionId}`);
        continue;
      }
      
      console.log(`    - Evaluating execution ID: ${executionId} (status: ${execution.status})`);
      
      const detailPayloadRaw = await kapsoFetch(`/platform/v1/workflow_executions/${executionId}`);
      const detailPayload = detailPayloadRaw.data ?? detailPayloadRaw;
      const detail = detailPayload?.execution || detailPayload;
      const priorVars = detail?.execution_context?.vars || detailPayload?.execution_context?.vars || {};
      const rawQuote = priorVars.quote || null;
      
      console.log(`      Quote in priorVars:`, !!rawQuote);
      if (rawQuote) {
        const looksUseful = quoteLooksUseful(rawQuote);
        console.log(`      Quote looks useful:`, looksUseful);
        console.log(`      Quote content:`, JSON.stringify(rawQuote, null, 2));
      } else {
        console.log(`      Vars keys:`, Object.keys(priorVars));
      }
    }
  }
}

main().catch(console.error);
