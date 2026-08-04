import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'recent_spam_contacts.json'), 'utf8'));
  const spamContacts = data.spamContacts;
  
  let out = `=== RECENT DETECTED SPAM CONTACTS SUMMARY (${spamContacts.length} CONTACTS) ===\n\n`;
  
  spamContacts.forEach((c, idx) => {
    out += `${idx + 1}. CONTACT: ${c.name || 'Unknown'} (${c.phone})\n`;
    out += `   Messages: Total: ${c.messagesCount}, Inbound: ${c.inboundCount}, Audios: ${c.audios}, Images: ${c.images}, Stickers: ${c.stickers}\n`;
    out += `   Reason: ${c.spamReason}\n`;
    out += `   Inbound texts: ${JSON.stringify(c.texts)}\n`;
    out += `-`.repeat(60) + `\n`;
  });
  
  fs.writeFileSync(path.resolve(__dirname, 'recent_spam_summary.txt'), out);
  console.log('Saved summary report to scratch/recent_spam_summary.txt');
}

run().catch(console.error);
