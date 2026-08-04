import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'executions_dump.json'), 'utf8'));

console.log('Total executions parsed:', data.length);

const handoffExecutions = data.filter(x => x.status === 'handoff');
console.log('Handoff executions count:', handoffExecutions.length);

// Let's load the full dump details from raw API or inspect what we saved.
// Wait! In analyze_conversations.js we saved the execution fields.
// Let's write a script that fetches the full JSON of all 25 handoff executions and shows the whole vars object!
import { loadConfig, requestJson } from '../../.agents/skills/automate-whatsapp/scripts/lib/workflows/kapso-api.js';

async function run() {
  const config = loadConfig();
  for (const exec of handoffExecutions) {
    const detail = await requestJson(config, {
      method: 'GET',
      path: `/platform/v1/workflow_executions/${exec.id}`
    });
    if (detail.ok) {
      const v = detail.data.execution_context?.vars || {};
      console.log(`Execution ${exec.id}:`);
      console.log(`  User: ${v.user?.name} (${v.user?.wa_id})`);
      console.log(`  Keys in vars:`, Object.keys(v));
      if (v.handoff) {
        console.log(`  Handoff:`, JSON.stringify(v.handoff, null, 2));
      }
      if (v.intent) {
        console.log(`  Intent:`, JSON.stringify(v.intent, null, 2));
      }
      console.log('-------------------------------');
    }
  }
}

run().catch(console.error);
