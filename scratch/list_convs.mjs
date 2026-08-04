
import { loadConfig, requestJson } from './.agents/skills/automate-whatsapp/scripts/lib/workflows/kapso-api.js';

async function main() {
  const config = loadConfig();
  // Get conversations
  let res = await requestJson(config, {
    method: 'GET',
    path: '/platform/v1/conversations',
    query: { page: 1, per_page: 50 }
  });
  console.log('Total conversations:', res.data ? res.data.length : 0);
  if (res.data) {
    for (const c of res.data) {
      console.log('ID:', c.id, 'Phone:', c.phone_number, 'Name:', c.name || c.display_name, 'Updated:', c.updated_at);
    }
  }
}
main();
