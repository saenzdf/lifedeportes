import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'recent_spam_contacts.json'), 'utf8'));
  const spamContacts = data.spamContacts;
  
  // Extract unique phones
  const phones = [...new Set(spamContacts.map(c => c.phone))];
  
  // Formatted output
  let out = `=== SPAM PHONE NUMBERS LIST (${phones.length} UNIQUE PHONES) ===\n\n`;
  phones.forEach(p => {
    out += `${p}\n`;
  });
  
  fs.writeFileSync(path.resolve(__dirname, 'spam_phone_numbers.txt'), out);
  console.log(`Saved ${phones.length} phone numbers to scratch/spam_phone_numbers.txt`);
  console.log(JSON.stringify(phones));
}

run().catch(console.error);
