
import { loadConfig, requestJson } from './.agents/skills/automate-whatsapp/scripts/lib/workflows/kapso-api.js';

async function main() {
  const config = loadConfig();
  const wfId = '8995b14c-d852-4fb3-bceb-8a51a6ccc2c6';
  let pRes = await requestJson(config, {
    method: 'GET',
    path: `/platform/v1/workflows/${wfId}/executions`,
    query: { page: 1, per_page: 100 }
  });
  if (pRes.data && Array.isArray(pRes.data)) {
    for (const exec of pRes.data) {
      const execDetail = await requestJson(config, {
        method: 'GET',
        path: `/platform/v1/executions/${exec.id}`
      });
      const str = JSON.stringify(execDetail.data || {});
      if (str.includes('2831') || str.includes('ANIBAL') || str.includes('Anibal') || str.includes('Paola') || str.includes('paola')) {
        console.log('MATCH IN EXECUTION:', exec.id, 'Conv:', exec.whatsapp_conversation_id);
        console.log(str.slice(0, 1500));
        console.log('-----------------------------------');
      }
    }
  }
}
main();
