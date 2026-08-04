import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'executions_dump.json'), 'utf8'));

console.log('Total executions parsed:', data.length);

// Group stages
const stageCounts = {};
const paymentStatusCounts = {};
const handoffStatusCounts = {};
const designStatusCounts = {};
const orderDetailsCompletenessCounts = {};

data.forEach(x => {
  const stage = x.funnel?.stage || 'no_funnel';
  stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  
  const pay = x.payment?.verification_status || 'no_payment';
  paymentStatusCounts[pay] = (paymentStatusCounts[pay] || 0) + 1;
  
  const hand = x.handoff?.reason ? 'has_handoff' : 'no_handoff';
  handoffStatusCounts[hand] = (handoffStatusCounts[hand] || 0) + 1;
  
  const des = x.design?.approval_status || 'no_design';
  designStatusCounts[des] = (designStatusCounts[des] || 0) + 1;
  
  const comp = x.order_details?.completeness || 'no_completeness';
  orderDetailsCompletenessCounts[comp] = (orderDetailsCompletenessCounts[comp] || 0) + 1;
});

console.log('\n--- Stages ---');
console.log(stageCounts);

console.log('\n--- Payments ---');
console.log(paymentStatusCounts);

console.log('\n--- Handoffs ---');
console.log(handoffStatusCounts);

console.log('\n--- Designs ---');
console.log(designStatusCounts);

console.log('\n--- Order Details Completeness ---');
console.log(orderDetailsCompletenessCounts);

// Find executions where:
// - payment is verified/approved or pending_human_review, OR
// - stage is venta/pago_en_revision/posventa/diseno_en_aprobacion/produccion/entrega, OR
// - order has id
// Let's filter those and print their details!
console.log('\n--- Potential Sales ---');
data.forEach(x => {
  const hasOrder = !!x.order?.id;
  const isPaidOrPending = ['approved', 'pending_human_review'].includes(x.payment?.verification_status);
  const isPostSaleStage = ['venta', 'pago_en_revision', 'posventa', 'diseno_en_aprobacion', 'produccion', 'entrega'].includes(x.funnel?.stage);
  
  if (hasOrder || isPaidOrPending || isPostSaleStage) {
    console.log(`- ExecID: ${x.id}`);
    console.log(`  User: ${x.user_name} (${x.wa_id})`);
    console.log(`  Status: ${x.status}`);
    console.log(`  Stage: ${x.funnel?.stage} (${x.funnel?.stage_reason})`);
    console.log(`  Order ID: ${x.order?.id || 'none'}, Status: ${x.order?.status || 'none'}`);
    console.log(`  Payment: ${x.payment?.verification_status || 'none'}, Expected: ${x.payment?.expected_amount_cop || 'none'}, Reference: ${x.payment?.received_reference || 'none'}`);
    console.log(`  Handoff: ${x.handoff?.reason || 'none'}`);
    console.log(`  Design: ${x.design?.approval_status || 'none'}`);
    console.log(`  Completeness: ${x.order_details?.completeness || 'none'}`);
    console.log(`  Last user input: ${x.last_user_input || 'none'}`);
    console.log('-----------------------------');
  }
});
