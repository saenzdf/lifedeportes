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

async function kapsoFetch(pathname) {
  const url = `${base}${pathname}`;
  const res = await fetch(url, {
    headers: {
      "X-API-Key": key,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch ${pathname} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  console.log("Searching details for phone:", PHONE);
  
  // 1. Get conversations
  const convsPayload = await kapsoFetch(`/platform/v1/whatsapp/conversations?phone_number=${PHONE}&limit=20`);
  const conversations = convsPayload.data || convsPayload || [];
  console.log(`Found ${conversations.length} conversations:`);
  for (const c of conversations) {
    console.log(`\nConversation ID: ${c.id}`);
    console.log(`  Status: ${c.status}`);
    console.log(`  Created At: ${c.created_at}`);
    console.log(`  Updated At: ${c.updated_at}`);
    console.log(`  Last Active At: ${c.last_active_at}`);
    
    // Get executions for this conversation
    const execsPayload = await kapsoFetch(`/platform/v1/workflows/${WF_ID}/executions?whatsapp_conversation_id=${c.id}`);
    const execs = execsPayload.data?.executions || execsPayload.data || execsPayload || [];
    console.log(`  Executions: ${execs.length}`);
    for (const ex of execs) {
      console.log(`    - Execution ID: ${ex.id} | Status: ${ex.status} | Started At: ${ex.started_at}`);
      try {
        const detail = await kapsoFetch(`/platform/v1/workflow_executions/${ex.id}`);
        const priorVars = detail?.data?.execution_context?.vars || detail?.execution_context?.vars || {};
        console.log(`      Quote exists: ${!!priorVars.quote}`);
        if (priorVars.quote) {
          console.log(`      Quote details:`, JSON.stringify(priorVars.quote, null, 2));
        } else {
          console.log(`      Vars keys:`, Object.keys(priorVars));
        }
      } catch (e) {
        console.error(`      Error loading details:`, e.message);
      }
    }
  }
}

main().catch(console.error);
