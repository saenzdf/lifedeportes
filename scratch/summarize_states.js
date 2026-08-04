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

async function fetchWithRetry(config, id, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await requestJson(config, {
      method: 'GET',
      path: `/platform/v1/workflow_executions/${id}`
    });
    if (res.ok) return res.data;
    console.warn(`Retry ${i+1} for ${id} failed:`, res.error);
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Failed to fetch ${id}`);
}

async function run() {
  const config = loadConfig();
  const workflowId = '8995b14c-d852-4fb3-bceb-8a51a6ccc2c6';
  
  console.log('Fetching executions list...');
  const response = await requestJson(config, {
    method: 'GET',
    path: `/platform/v1/workflows/${workflowId}/executions`,
    query: { per_page: 200 } // Fetch more if available
  });
  
  if (!response.ok) {
    console.error('Failed to get executions:', response.error);
    process.exit(1);
  }
  
  const executionsList = response.data.executions || response.data || [];
  console.log(`Listing returned ${executionsList.length} executions.`);
  
  console.log('Fetching details in batches of 10...');
  const detailedExecutions = [];
  const batchSize = 10;
  for (let i = 0; i < executionsList.length; i += batchSize) {
    const batch = executionsList.slice(i, i + batchSize);
    const promises = batch.map(exec => fetchWithRetry(config, exec.id));
    const results = await Promise.all(promises);
    detailedExecutions.push(...results);
    console.log(`Fetched ${detailedExecutions.length}/${executionsList.length}`);
  }
  
  console.log('Processing data...');
  // Let's inspect unique shapes and statuses
  const analysis = detailedExecutions.map(exec => {
    const vars = exec.execution_context?.vars || {};
    return {
      id: exec.id,
      status: exec.status,
      user_name: vars.user?.name || exec.execution_context?.context?.contact?.profile_name || 'Desconocido',
      wa_id: vars.user?.wa_id || exec.execution_context?.context?.phone_number || '',
      funnel: vars.funnel || {},
      payment: vars.payment || {},
      handoff: vars.handoff || {},
      design: vars.design || {},
      order: vars.order || {},
      order_details: vars.order_details || {},
      last_user_input: vars.last_user_input || '',
      last_event_at: exec.last_event_at
    };
  });
  
  // Save to file for further reference
  fs.writeFileSync(
    path.resolve(__dirname, 'executions_dump.json'),
    JSON.stringify(analysis, null, 2)
  );
  console.log('Dumped executions data to scratch/executions_dump.json');
}

run().catch(console.error);
