import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'executions_dump.json'), 'utf8'));

console.log('Total executions parsed:', data.length);

const allVarsKeys = new Set();
let countWithMoreKeys = 0;

data.forEach((x, idx) => {
  const vars = x.funnel?.vars || x.payment?.vars || {}; // Wait, our mapping in summarize_states.js was:
  // funnel: vars.funnel, payment: vars.payment, etc.
  // Let's look at the raw vars from the dump. We need to load the raw dump or re-examine what was saved in the dump.
  // Wait, let's look at how the dump is structured. Let's read the first few lines of the dump.
});

// Let's load the dump file and print out the keys of `vars` for each execution that has keys other than the standard ones.
const rawDump = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'executions_dump.json'), 'utf8'));

rawDump.forEach((x, idx) => {
  // Wait, in summarize_states.js, we did:
  // funnel: vars.funnel || {}
  // So x.funnel is an empty object if vars.funnel was undefined.
  // Let's re-read the execution from the raw API or print the actual vars keys from the dump.
  // In summarize_states.js, we saved:
  // vars = exec.execution_context?.vars || {}
  // and then saved x.funnel = vars.funnel || {} etc.
  // If vars.funnel was undefined, x.funnel is {}.
});

// Let's check how many executions have vars.funnel, vars.payment, vars.order etc.
rawDump.forEach(x => {
  // Wait, did we map funnel to x.funnel? Yes. So if x.funnel is empty, it means vars.funnel was undefined.
  // Let's check if there are any executions where vars had other keys:
});

// Let's search if any execution has keys other than user, intent, tenant, service, security, last_user_input
// Let's reload the original executions from the file and see what keys were in vars.
// Wait, we can write a script that inspects the raw execution_context of all executions from the dump (if we dumped the whole thing? No, we only saved filtered properties: id, status, funnel, payment, etc.).
// Wait! Let's write a script that inspects if there are other workflows or if we need to fetch more pages, or if some executions have handoffs.
// Wait, let's write a script to print executions where `status` is not just "waiting" or "active", or if they are "handoff".
const statuses = {};
rawDump.forEach(x => {
  statuses[x.status] = (statuses[x.status] || 0) + 1;
});
console.log('Statuses:', statuses);

const withOrder = rawDump.filter(x => Object.keys(x.order).length > 0);
console.log('With order:', withOrder.length);

const withPayment = rawDump.filter(x => Object.keys(x.payment).length > 0);
console.log('With payment:', withPayment.length);

const withFunnel = rawDump.filter(x => Object.keys(x.funnel).length > 0);
console.log('With funnel:', withFunnel.length);
