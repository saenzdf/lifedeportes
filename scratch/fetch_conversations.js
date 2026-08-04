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
  const phone_number_id = '1095603153637786';
  
  console.log('Fetching platform conversations...');
  const conversations = [];
  let page = 1;
  while (page <= 50) {
    const response = await requestJson(config, {
      method: 'GET',
      path: '/platform/v1/whatsapp/conversations',
      query: { phone_number_id, per_page: 100, page }
    });
    if (!response.ok) {
      console.error('Failed on page', page, response.error);
      process.exit(1);
    }
    const batch = response.data.conversations || response.data || [];
    if (!batch.length) break;
    conversations.push(...batch);
    console.log(`Page ${page}: +${batch.length} (total ${conversations.length})`);
    if (batch.length < 100) break;
    page++;
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`Found ${conversations.length} conversations.`);
  if (conversations.length > 0) {
    conversations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    console.log('Newest:', conversations[0]?.created_at, 'Oldest:', conversations[conversations.length - 1]?.created_at);
    fs.writeFileSync(path.resolve(__dirname, 'platform_conversations.json'), JSON.stringify(conversations, null, 2));
  }
}

run().catch(console.error);
