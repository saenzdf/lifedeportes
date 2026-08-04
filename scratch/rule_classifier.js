import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    process.env[key] = val;
  }
});

import { loadConfig, requestJson } from '../.agents/skills/automate-whatsapp/scripts/lib/workflows/kapso-api.js';

async function fetchMessages(config, conversationId) {
  const res = await requestJson(config, {
    method: 'GET',
    path: '/platform/v1/whatsapp/messages',
    query: {
      phone_number_id: '1095603153637786',
      conversation_id: conversationId,
      per_page: 50 // Get up to 50 messages to have full context
    }
  });
  if (res.ok) {
    return res.data.messages || res.data || [];
  }
  return [];
}

async function run() {
  const config = loadConfig();
  const conversations = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'platform_conversations.json'), 'utf8'));
  
  console.log(`Processing messages for ${conversations.length} conversations...`);
  const classified = [];
  
  for (const conv of conversations) {
    const messages = await fetchMessages(config, conv.id);
    const sorted = [...messages].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    
    // Build text representation
    const history = sorted.map(msg => {
      const dir = msg.kapso?.direction || 'unknown';
      const sender = dir === 'inbound' ? 'Customer' : 'LifeAgent';
      const text = msg.kapso?.content || msg.text?.body || '';
      return { sender, text, timestamp: Number(msg.timestamp) };
    });
    
    // Heuristics
    // 1. Check for payments or successful sales:
    // Keywords indicating they paid or are completing the payment (abono, nequi, bancolombia, pago, transferencia, comprobante, etc.)
    const paymentKeywords = [
      'abono', 'pago', 'nequi', 'bancolombia', 'comprobante', 
      'transferencia', 'transf', 'captura', 'pantallazo', 
      'consigna', 'vaucher', 'adjunto', 'aqui esta', 'aquí está', 
      'ya le envie', 'ya le envié', 'enviado', 'imagen'
    ];
    
    const customerMessages = history.filter(h => h.sender === 'Customer');
    const agentMessages = history.filter(h => h.sender === 'LifeAgent');
    
    let isSuccessfulSale = false;
    let paymentKeywordMatched = '';
    
    // Check customer messages for payment confirmation
    for (const msg of customerMessages) {
      const lower = msg.text.toLowerCase();
      const matched = paymentKeywords.find(kw => lower.includes(kw));
      if (matched) {
        // Double check to avoid false positives (like "como son las formas de pago?")
        // If it's a question about payment, it might not be a sale yet, but if they send an image/file or confirm they paid, it is.
        if (lower.includes('?') || lower.includes('como') || lower.includes('cómo') || lower.includes('metodo') || lower.includes('método')) {
          continue;
        }
        isSuccessfulSale = true;
        paymentKeywordMatched = matched;
        break;
      }
    }
    
    // Check if the agent sent a message containing "abono" or "confirmado" and client said yes/perfecto/listo
    // Or if the client sent an attachment
    const hasAttachments = sorted.some(m => m.kapso?.has_media || m.type === 'image' || m.type === 'document' || m.kapso?.content?.includes('attached') || m.kapso?.content?.includes('Attached'));
    if (hasAttachments) {
      // If client sent an attachment and there's payment text, it's highly likely a successful sale (receipt or design details)
      const hasPaymentMention = history.some(h => {
        const t = h.text.toLowerCase();
        return t.includes('pago') || t.includes('abono') || t.includes('transfer') || t.includes('nequi') || t.includes('bancolombia') || t.includes('comprobante') || t.includes('pesos') || t.includes('$');
      });
      if (hasPaymentMention) {
        isSuccessfulSale = true;
        paymentKeywordMatched = 'attachment_with_payment_text';
      }
    }
    
    // 2. Waiting for response:
    // If the last message in the history is from the Customer, we are waiting for Life response.
    // Also, if the execution is in "handoff" status, we are definitely waiting for Life (human) response.
    const lastMsg = history[history.length - 1];
    const lastSenderIsCustomer = lastMsg && lastMsg.sender === 'Customer';
    const isWaiting = lastSenderIsCustomer || conv.status === 'handoff';
    
    classified.push({
      id: conv.id,
      contact_name: conv.contact_name || conv.phone,
      phone: conv.phone,
      messages_count: sorted.length,
      status: conv.status,
      is_successful_sale: isSuccessfulSale,
      waiting_for_life_response: isWaiting,
      payment_keyword: paymentKeywordMatched,
      history
    });
  }
  
  // Dump everything for manual audit
  fs.writeFileSync(path.resolve(__dirname, 'rule_classified.json'), JSON.stringify(classified, null, 2));
  console.log('Saved rule classifications to scratch/rule_classified.json');
  
  // Print results
  const salesWaiting = classified.filter(c => c.is_successful_sale && c.waiting_for_life_response);
  const salesNotWaiting = classified.filter(c => c.is_successful_sale && !c.waiting_for_life_response);
  const othersWaiting = classified.filter(c => !c.is_successful_sale && c.waiting_for_life_response);
  const othersNotWaiting = classified.filter(c => !c.is_successful_sale && !c.waiting_for_life_response);
  
  console.log('\n=== RESULTS SUMMARY ===');
  console.log(`Total: ${classified.length}`);
  console.log(`1. Ventas Exitosas Esperando Respuesta: ${salesWaiting.length}`);
  console.log(`2. Ventas Exitosas NO Esperando Respuesta: ${salesNotWaiting.length}`);
  console.log(`3. Otras Conversaciones Esperando Respuesta: ${othersWaiting.length}`);
  console.log(`4. Otras Conversaciones NO Esperando: ${othersNotWaiting.length}`);
  
  console.log('\n=== DETAILS OF VENTAS EXITOSAS ESPERANDO RESPUESTA ===');
  salesWaiting.forEach(s => {
    console.log(`- ${s.contact_name} (${s.phone}): Last message: "${s.history[s.history.length-1]?.text.substring(0, 100)}"`);
  });
}

run().catch(console.error);
