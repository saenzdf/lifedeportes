import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const fileContent = fs.readFileSync(path.resolve(__dirname, 'spam_contacts_conversations.json'), 'utf8');
  const conversations = JSON.parse(fileContent);
  
  // Group by phone number
  const contacts = {};
  
  for (const conv of conversations) {
    const phone = conv.phone_number;
    if (!contacts[phone]) {
      contacts[phone] = {
        name: conv.contact_name,
        phone: phone,
        conversationsCount: 0,
        messages: []
      };
    }
    contacts[phone].conversationsCount++;
    for (const msg of conv.history) {
      contacts[phone].messages.push(msg);
    }
  }
  
  // Sort messages for each contact by timestamp
  for (const phone in contacts) {
    contacts[phone].messages.sort((a, b) => a.timestamp - b.timestamp);
  }
  
  let out = `=== SPAM ANALYSIS FOR TARGET CONTACTS (${Object.keys(contacts).length} UNIQUE PHONES) ===\n\n`;
  
  for (const phone in contacts) {
    const contact = contacts[phone];
    out += `CONTACT: ${contact.name} (${contact.phone})\n`;
    out += `Conversations on Kapso: ${contact.conversationsCount}\n`;
    out += `Total Messages: ${contact.messages.length}\n`;
    
    // Message types count
    const types = {};
    let inboundCount = 0;
    let outboundCount = 0;
    
    contact.messages.forEach(msg => {
      types[msg.type] = (types[msg.type] || 0) + 1;
      if (msg.sender === 'Customer') inboundCount++;
      if (msg.sender === 'LifeAgent') outboundCount++;
    });
    
    out += `Inbound (from Customer): ${inboundCount}, Outbound (from Agent/Bot): ${outboundCount}\n`;
    out += `Message Types: ${JSON.stringify(types)}\n`;
    out += 'Customer Inbound Messages Summary:\n';
    
    const customerMsgs = contact.messages.filter(m => m.sender === 'Customer');
    customerMsgs.forEach((m, idx) => {
      let detail = '';
      if (m.type === 'text') {
        detail = `"${m.text}"`;
      } else if (m.type === 'image') {
        detail = `[IMAGE] ${m.text || ''}`;
      } else if (m.type === 'audio' || m.type === 'voice') {
        detail = `[AUDIO/VOICE] duration/info: ${JSON.stringify(m.mediaInfo)}`;
      } else {
        detail = `[${m.type.toUpperCase()}] ${m.text || ''}`;
      }
      out += `  ${idx + 1}. [${m.type}] ${detail} (${m.timeStr})\n`;
    });
    out += '-'.repeat(60) + '\n\n';
  }
  
  fs.writeFileSync(path.resolve(__dirname, 'spam_analysis_output.txt'), out);
  console.log('Saved spam analysis report to scratch/spam_analysis_output.txt');
}

run().catch(console.error);
