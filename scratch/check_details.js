import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const classified = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'rule_classified.json'), 'utf8'));
const salesWaiting = classified.filter(c => c.is_successful_sale && c.waiting_for_life_response);

salesWaiting.forEach((s, idx) => {
  console.log(`\n======================================`);
  console.log(`${idx + 1}. User: ${s.contact_name} (${s.phone}) [Matched Key: ${s.payment_keyword}]`);
  console.log(`Status: ${s.status}`);
  console.log('--- Chat Log (chronological) ---');
  s.history.forEach(h => {
    console.log(`  ${h.sender}: ${h.text}`);
  });
});
