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
  const execs = await kapsoFetch(`/platform/v1/workflows/${WF_ID}/executions?limit=50`);
  const list = execs.data?.executions || execs.data || [];
  
  for (const ex of list) {
    try {
      const details = await kapsoFetch(`/platform/v1/workflow_executions/${ex.id}`);
      const str = JSON.stringify(details);
      if (str.includes("3213988464") || str.includes("ANIBAL") || str.includes("Anibal") || str.includes("2831")) {
        console.log("=== EXECUTION ===", ex.id, ex.status, ex.created_at || ex.started_at);
        const matches = str.match(/https:\/\/app\.kapso\.ai[^\"]+/g) || [];
        console.log("Blobs found:", matches);
      }
    } catch (e) {
      // ignore
    }
  }
}

main().catch(console.error);
