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
  const execs = await kapsoFetch(`/platform/v1/workflows/${WF_ID}/executions?limit=30`);
  const list = execs.data?.executions || execs.data || [];
  
  console.log(`Checking ${list.length} executions...`);

  for (const ex of list) {
    try {
      const details = await kapsoFetch(`/platform/v1/workflow_executions/${ex.id}`);
      const str = JSON.stringify(details);
      
      const blobs = str.match(/https:\/\/[^\"]+(\.xlsx|\.xls|\.pdf|blob)/gi) || [];
      if (blobs.length > 0 || str.includes("12") || str.includes("camisetas")) {
        console.log(`\n=== EXECUTION ${ex.id} (${ex.status}) at ${ex.created_at || ex.started_at} ===`);
        // Find text or message content
        const ec = details.data?.execution_context || {};
        console.log("Vars keys:", Object.keys(ec.vars || {}));
        if (blobs.length) console.log("Files:", blobs);
        
        // Save to scratch if recent
        fs.writeFileSync(`scratch/exec_${ex.id}.json`, JSON.stringify(details, null, 2));
      }
    } catch (e) {
      console.error(`Error fetching exec ${ex.id}:`, e.message);
    }
  }
}

main().catch(console.error);
