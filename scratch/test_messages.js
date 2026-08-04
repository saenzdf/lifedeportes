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
  const phone_number_id = '1095603153637786';
  
  const conversations = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'platform_conversations.json'), 'utf8'));
  if (conversations.length === 0) return;
  
  const convId = conversations[0].id;
  console.log(`Fetching messages for conversation ${convId} (${conversations[0].contact_name})...`);
  const response = await requestJson(config, {
    method: 'GET',
    path: '/platform/v1/whatsapp/messages',
    query: {
      phone_number_id,
      conversation_id: convId,
      per_page: 20
    }
  });
  
  if (!response.ok) {
    console.error('Failed to get messages:', response.error);
    process.exit(1);
  }
  
  const messages = response.data.messages || response.data || [];
  console.log(`Found ${messages.length} messages.`);
  if (messages.length > 0) {
    console.log('Sample message:', JSON.stringify(messages[0], null, 2));
  }
}

run().catch(console.error);
