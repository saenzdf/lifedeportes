import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    process.env[key] = val;
  }
});

import { loadConfig, requestJson } from '../../.agents/skills/automate-whatsapp/scripts/lib/workflows/kapso-api.js';

async function run() {
  const config = loadConfig();
  const dump = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'executions_dump.json'), 'utf8'));
  
  const allDetails = [];
  console.log('Analyzing executions...');
  for (const exec of dump) {
    const detail = await requestJson(config, {
      method: 'GET',
      path: `/platform/v1/workflow_executions/${exec.id}`
    });
    if (detail.ok) {
      allDetails.push(detail.data);
    }
  }
  
  const staffRoutes = {};
  const intentNexts = {};
  const handoffReasons = {};
  
  const matches = [];
  
  allDetails.forEach(d => {
    const vars = d.execution_context?.vars || {};
    const sr = vars.staff_route;
    const inxt = vars.intent_next;
    const hr = vars.handoff?.reason;
    
    staffRoutes[sr] = (staffRoutes[sr] || 0) + 1;
    intentNexts[inxt] = (intentNexts[inxt] || 0) + 1;
    if (hr) {
      handoffReasons[hr] = (handoffReasons[hr] || 0) + 1;
    }
    
    // Check if user name or message suggests a successful payment, upload, order creation, or handoff
    // Or if last_user_input / raw_text contains keywords of success (abono, pago, transferencia, Nequi, Bancolombia, aprobado, etc.)
    const input = (vars.last_user_input || vars.intent?.raw_text || '').toLowerCase();
    const hasSuccessKeywords = ['pago', 'abono', 'transferencia', 'comprobante', 'nequi', 'bancolombia', 'transfir', 'consig'].some(kw => input.includes(kw));
    
    // Let's also check if they have Odoo SO ids or anything in their variables.
    // Let's print any variables that are not null or undefined (except user, intent, tenant, service, security)
    const extraVars = {};
    Object.keys(vars).forEach(k => {
      if (!['user', 'intent', 'tenant', 'service', 'security', 'last_user_input', 'agent_iterations', 'agent_response'].includes(k)) {
        extraVars[k] = vars[k];
      }
    });
    
    if (Object.keys(extraVars).length > 0 || hasSuccessKeywords || d.status === 'handoff') {
      matches.push({
        id: d.id,
        status: d.status,
        user: vars.user?.name || d.execution_context?.context?.contact?.profile_name,
        wa_id: vars.user?.wa_id,
        extraVars,
        last_input: vars.last_user_input || vars.intent?.raw_text,
        agent_response: vars.agent_response
      });
    }
  });
  
  console.log('\n--- Staff Routes Summary ---');
  console.log(staffRoutes);
  
  console.log('\n--- Intent Next Summary ---');
  console.log(intentNexts);
  
  console.log('\n--- Handoff Reasons ---');
  console.log(handoffReasons);
  
  console.log(`\n--- Matches found: ${matches.length} ---`);
  fs.writeFileSync(path.resolve(__dirname, 'matches.json'), JSON.stringify(matches, null, 2));
  
  // Print some matches
  matches.slice(0, 15).forEach(m => {
    console.log(`User: ${m.user} (${m.wa_id}) [Status: ${m.status}]`);
    console.log(`  Input: ${m.last_input}`);
    console.log(`  Extra Vars:`, m.extraVars);
    console.log('---');
  });
}

run().catch(console.error);
