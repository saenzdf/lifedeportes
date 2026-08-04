import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const classified = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'rule_classified.json'), 'utf8'));

const salesWaiting = classified.filter(c => c.is_successful_sale && c.waiting_for_life_response);
const salesNotWaiting = classified.filter(c => c.is_successful_sale && !c.waiting_for_life_response);
const othersWaiting = classified.filter(c => !c.is_successful_sale && c.waiting_for_life_response);
const othersNotWaiting = classified.filter(c => !c.is_successful_sale && !c.waiting_for_life_response);

console.log('--- Sales Waiting Details ---');
salesWaiting.forEach(s => {
  const lastMsg = s.history[s.history.length - 1];
  console.log(`- Cliente: ${s.contact_name} (${s.phone})`);
  console.log(`  Último mensaje (${lastMsg?.sender}): "${lastMsg?.text}"`);
  console.log(`  Mensajes totales: ${s.messages_count}`);
});
