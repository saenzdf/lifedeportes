
import { loadConfig, requestJson } from '../.agents/skills/automate-whatsapp/scripts/lib/workflows/kapso-api.js';

async function main() {
  const config = loadConfig();
  const wfId = '8995b14c-d852-4fb3-bceb-8a51a6ccc2c6';
  
  // 1. List executions for conv a981b64b-87df-4468-89fa-ff00501543c7
  let res = await requestJson(config, {
    method: 'GET',
    path: `/platform/v1/workflows/${wfId}/executions`,
    query: { whatsapp_conversation_id: 'a981b64b-87df-4468-89fa-ff00501543c7' }
  });
  console.log('Search by conv_id a981b64b status:', res.status);
  console.log('Executions found:', JSON.stringify(res.data, null, 2));

  // 2. Fetch pages of executions to check if any execution matches
  let allExecs = [];
  for (let page = 1; page <= 5; page++) {
    let pRes = await requestJson(config, {
      method: 'GET',
      path: `/platform/v1/workflows/${wfId}/executions`,
      query: { page, per_page: 50 }
    });
    if (pRes.data && Array.isArray(pRes.data)) {
      allExecs.push(...pRes.data);
    }
  }
  console.log('Total executions fetched:', allExecs.length);

  for (const exec of allExecs) {
    const execDetail = await requestJson(config, {
      method: 'GET',
      path: `/platform/v1/executions/${exec.id}`
    });
    const str = JSON.stringify(execDetail.data || {});
    if (str.includes('Emmanuelle') || str.includes('3000000020') || str.includes('a981b64b')) {
      console.log('FOUND MATCH IN EXECUTION:', exec.id, exec.whatsapp_conversation_id);
      console.log(JSON.stringify(execDetail.data, null, 2));
    }
  }
}
main();
