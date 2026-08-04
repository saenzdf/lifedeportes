import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'executions_dump.json'), 'utf8'));

import { loadConfig, requestJson } from '../../.agents/skills/automate-whatsapp/scripts/lib/workflows/kapso-api.js';

async function run() {
  const config = loadConfig();
  const allResults = [];
  
  for (const exec of data) {
    const detail = await requestJson(config, {
      method: 'GET',
      path: `/platform/v1/workflow_executions/${exec.id}`
    });
    if (detail.ok) {
      const v = detail.data.execution_context?.vars || {};
      allResults.push({
        id: exec.id,
        status: exec.status,
        user_name: v.user?.name || 'Desconocido',
        wa_id: v.user?.wa_id || '',
        varsKeys: Object.keys(v),
        staff_route: v.staff_route || null,
        funnel: v.funnel || null,
        payment: v.payment || null,
        order: v.order || null,
        order_details: v.order_details || null,
        design: v.design || null,
        last_user_input: v.last_user_input || '',
        agent_iterations: v.agent_iterations || null
      });
    }
  }
  
  // Analyze keys
  console.log('Total detailed results:', allResults.length);
  const keyCounts = {};
  allResults.forEach(r => {
    r.varsKeys.forEach(k => {
      keyCounts[k] = (keyCounts[k] || 0) + 1;
    });
  });
  console.log('Keys distribution in vars:', keyCounts);
  
  // Find executions that have order or payment or funnel or design
  const nonTrivial = allResults.filter(r => 
    r.funnel || r.payment || r.order || r.order_details || r.design || r.staff_route
  );
  
  console.log('Non-trivial executions count:', nonTrivial.length);
  nonTrivial.forEach(r => {
    console.log(`Execution ${r.id} (${r.status}):`);
    console.log(`  User: ${r.user_name} (${r.wa_id})`);
    console.log(`  Staff Route:`, r.staff_route);
    console.log(`  Funnel:`, r.funnel);
    console.log(`  Payment:`, r.payment);
    console.log(`  Order:`, r.order);
    console.log(`  Design:`, r.design);
    console.log(`  Last User Input:`, r.last_user_input);
    console.log('--------------------------');
  });
}

run().catch(console.error);
