
import { loadConfig, requestJson } from '../.agents/skills/automate-whatsapp/scripts/lib/workflows/kapso-api.js';

async function main() {
  const config = loadConfig();
  const execId = '7eafcbf1-f4f3-4a2e-8da2-088c8bc5da63';
  let res = await requestJson(config, {
    method: 'GET',
    path: `/platform/v1/executions/${execId}`
  });
  console.log('Execution 7eafcbf1 detail status:', res.status);
  console.log(JSON.stringify(res.data || res, null, 2));
}
main();
