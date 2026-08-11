const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const envPath = path.join(root, "../.env");

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
const TESTER_WA = "3000000047";
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
  console.log("Using API key (prefix):", key.slice(0, 5));
  
  // 1. Get conversations
  const convs = await kapsoFetch(`/platform/v1/whatsapp/conversations?phone_number=${encodeURIComponent(TESTER_WA)}&limit=10`);
  const data = convs.data || [];
  const ids = data.map(c => c.id);
  console.log("Diego Conversation IDs:", ids);
  
  // 2. Get executions
  const execs = await kapsoFetch(`/platform/v1/workflows/${WF_ID}/executions?limit=20`);
  const exData = execs.data?.executions || execs.data || [];
  console.log(`Found ${exData.length} executions:`);
  for (const ex of exData) {
    const cid = ex.whatsapp_conversation_id;
    if (ids.includes(cid) || ids.some(id => cid.startsWith(id.slice(0, 8)))) {
      console.log(`\nExecution: ${ex.id}`);
      console.log(`  Status: ${ex.status}`);
      console.log(`  Started At: ${ex.started_at}`);
      console.log(`  Current Step: ${ex.current_step?.identifier}`);
      
      // Get details
      try {
        const details = await kapsoFetch(`/platform/v1/workflow_executions/${ex.id}`);
        console.log("  Steps:");
        for (const step of (details.data?.steps || [])) {
          console.log(`    - Step: ${step.identifier} | Status: ${step.status} | Error: ${step.error || "none"}`);
        }
      } catch (e) {
        console.error("  Error fetching details:", e.message);
      }
    }
  }
}

main().catch(console.error);
