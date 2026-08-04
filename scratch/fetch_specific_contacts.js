import fs from 'fs';
import path from 'url';
import { fileURLToPath } from 'url';
import fsPromises from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.fileURLToPath(new URL('.', import.meta.url));

// Load env
const envPath = `${__dirname}../.env`;
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

async function fetchMessages(config, conversationId) {
  const res = await requestJson(config, {
    method: 'GET',
    path: '/platform/v1/whatsapp/messages',
    query: {
      phone_number_id: '1095603153637786',
      conversation_id: conversationId,
      per_page: 100
    }
  });
  if (res.ok) {
    return res.data.messages || res.data || [];
  }
  return [];
}

async function run() {
  const config = loadConfig();
  const conversations = JSON.parse(fs.readFileSync(`${__dirname}platform_conversations.json`, 'utf8'));
  
  const searchTerms = [
    'johana', 'castellanos', 'victoria', 'junco', 
    'stephany', 'celeste', 'lucia', 'michel', 'giron'
  ];
  
  console.log('Searching for target contacts in conversations...');
  const matchedConversations = [];
  
  for (const conv of conversations) {
    const name = (conv.contact_name || '').toLowerCase();
    const phone = conv.phone_number || '';
    
    // Check search terms
    const isMatch = searchTerms.some(term => name.includes(term));
    if (isMatch) {
      matchedConversations.push(conv);
    }
  }
  
  console.log(`Found ${matchedConversations.length} matching conversations:`);
  const details = [];
  
  for (const conv of matchedConversations) {
    console.log(`- Name: ${conv.contact_name}, Phone: ${conv.phone_number}, ID: ${conv.id}`);
    const messages = await fetchMessages(config, conv.id);
    const sorted = [...messages].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    
    const history = sorted.map(msg => {
      const dir = msg.kapso?.direction || 'unknown';
      const sender = dir === 'inbound' ? 'Customer' : 'LifeAgent';
      const text = msg.kapso?.content || msg.text?.body || '';
      const type = msg.type || 'text';
      const hasMedia = msg.kapso?.has_media || false;
      const mediaInfo = msg.image || msg.audio || msg.voice || msg.document || msg.video || null;
      return { 
        sender, 
        text, 
        type, 
        hasMedia, 
        mediaInfo,
        timestamp: Number(msg.timestamp),
        timeStr: new Date(Number(msg.timestamp) * 1000).toISOString()
      };
    });
    
    details.push({
      id: conv.id,
      contact_name: conv.contact_name,
      phone_number: conv.phone_number,
      status: conv.status,
      history
    });
  }
  
  fs.writeFileSync(`${__dirname}spam_contacts_conversations.json`, JSON.stringify(details, null, 2));
  console.log('Saved specific conversations to scratch/spam_contacts_conversations.json');
}

run().catch(console.error);
