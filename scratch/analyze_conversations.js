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

import { loadConfig, requestJson } from '../.agents/skills/automate-whatsapp/scripts/lib/workflows/kapso-api.js';

async function run() {
  const config = loadConfig();
  const workflowId = '8995b14c-d852-4fb3-bceb-8a51a6ccc2c6';
  
  console.log('Fetching executions list...');
  const response = await requestJson(config, {
    method: 'GET',
    path: `/platform/v1/workflows/${workflowId}/executions`,
    query: { per_page: 100 }
  });
  
  if (!response.ok) {
    console.error('Failed:', response.error);
    process.exit(1);
  }
  
  const executions = response.data.executions || response.data || [];
  console.log(`Found ${executions.length} executions.`);
  if (executions.length > 0) {
    console.log('Sample execution keys:', Object.keys(executions[0]));
    if (executions[0].execution_context) {
      console.log('execution_context is present in list API!');
      console.log('Sample execution_context:', JSON.stringify(executions[0].execution_context, null, 2));
    } else {
      console.log('execution_context is NOT present in list API. Fetching details for first execution...');
      const detail = await requestJson(config, {
        method: 'GET',
        path: `/platform/v1/workflow_executions/${executions[0].id}`
      });
      if (detail.ok) {
        console.log('Detail keys:', Object.keys(detail.data));
        console.log('Detail execution_context:', JSON.stringify(detail.data.execution_context, null, 2));
      }
    }
  }
}

run().catch(console.error);
