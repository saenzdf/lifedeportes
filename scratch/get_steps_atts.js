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
const execId = "29404417-6fd3-4668-abf1-a21c698419cf";

async function main() {
  const res = await fetch(`${base}/platform/v1/workflow_executions/${execId}`, { headers: { "X-API-Key": key } });
  const data = await res.json();
  const steps = data.data?.execution?.steps || data.data?.steps || [];
  for (const s of steps) {
    const str = JSON.stringify(s);
    if (str.includes("attachments")) {
      console.log("STEP:", s.identifier);
      console.log("OUTPUT:", JSON.stringify(s.output, null, 2));
    }
  }
}

main().catch(console.error);
