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
  const phone = '3000000027'; // Que Dios Me Mendiga
  const conversations = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'platform_conversations.json'), 'utf8'));
  
  // Find all conversations for this phone
  const matched = conversations.filter(c => c.phone_number === phone || c.contact_name?.includes('Dios Me Mendiga'));
  console.log(`Found ${matched.length} conversations for Que Dios Me Mendiga`);
  
  for (const conv of matched) {
    console.log(`\nConversation ${conv.id} (Created at: ${conv.created_at}):`);
    const res = await requestJson(config, {
      method: 'GET',
      path: '/platform/v1/whatsapp/messages',
      query: {
        phone_number_id: '1095603153637786',
        conversation_id: conv.id,
        per_page: 50
      }
    });
    if (res.ok) {
      const messages = res.data.messages || res.data || [];
      const sorted = [...messages].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
      sorted.forEach(m => {
        const dir = m.kapso?.direction || 'unknown';
        const sender = dir === 'inbound' ? 'Customer' : 'LifeAgent';
        const text = m.kapso?.content || m.text?.body || '';
        console.log(`  [${sender}] [${m.type}] "${text}" (timestamp: ${m.timestamp})`);
      });
    }
  }
}

run().catch(console.error);
