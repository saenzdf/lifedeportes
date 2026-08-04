import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const classified = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'rule_classified.json'), 'utf8'));
const juanes = classified.find(c => c.contact_name.includes('Juanes'));

if (juanes) {
  console.log(`Juanes history:`);
  juanes.history.forEach(h => {
    console.log(`  ${h.sender}: ${h.text}`);
  });
} else {
  console.log('Juanes not found');
}
