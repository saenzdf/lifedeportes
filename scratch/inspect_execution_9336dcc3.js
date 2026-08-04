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
const EXEC_ID = "9336dcc3-e81c-42d2-9981-3cd722a554aa";

async function main() {
  const url = `${base}/platform/v1/workflow_executions/${EXEC_ID}`;
  const res = await fetch(url, {
    headers: {
      "X-API-Key": key,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status}`);
  }
  const data = await res.json();
  
  // Imprimir variables iniciales y finales, y pasos
  const execution = data.data || data;
  console.log("Execution ID:", execution.id);
  console.log("Status:", execution.status);
  console.log("Current Step:", execution.current_step?.identifier);
  console.log("Steps Count:", execution.steps?.length);
  
  console.log("\n--- Execution Context Vars ---");
  console.log(JSON.stringify(execution.execution_context?.vars || {}, null, 2));
  
  console.log("\n--- Steps details ---");
  for (const step of (execution.steps || [])) {
    console.log(`Step: ${step.identifier} | Status: ${step.status}`);
    if (step.output) {
      console.log(`  Output keys:`, Object.keys(step.output));
      if (step.identifier === "classify_contact_odoo") {
        console.log(`  Output:`, JSON.stringify(step.output, null, 2));
      }
    }
  }
}

main().catch(console.error);
