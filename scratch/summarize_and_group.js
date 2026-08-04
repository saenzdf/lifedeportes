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

import { loadConfig, requestJson } from '../../.agents/skills/automate-whatsapp/scripts/lib/workflows/kapso-api.js';

async function fetchMessages(config, conversationId) {
  const res = await requestJson(config, {
    method: 'GET',
    path: '/platform/v1/whatsapp/messages',
    query: {
      phone_number_id: '1095603153637786',
      conversation_id: conversationId,
      per_page: 20
    }
  });
  if (res.ok) {
    return res.data.messages || res.data || [];
  }
  return [];
}

async function analyzeWithGemini(apiKey, contactName, chatLog) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const systemInstruction = `
You are an expert sales auditor for Life Deportes, a sports apparel manufacturer.
Your task is to analyze the chat transcript between a customer and the automated sales agent, and determine:
1. If this is a "venta exitosa" (successful sale).
   - In Life Deportes, a successful sale is when the client has decided to purchase, requested payment details, sent a payment receipt (abono/comprobante de transferencia) or confirmed details to start production/design.
   - If they only asked for prices, catalogs, address or details but did not make a buying decision or request payment details or pay, it is NOT a successful sale.
2. If this conversation is currently "esperando respuesta de Life" (waiting for a response from Life).
   - The conversation is waiting for a response from Life if the last action/message requires a response or action from the human staff/Life team.
   - Examples of waiting for response: The client sent a proof of payment and is waiting for validation; the client sent logos/specifications and is waiting for design mockups; the client asked a question or reported an error (like a link not working) and has not received a resolution; the last message is from the client asking a question.
   - Examples of NOT waiting: The last message is from Life/Agent and there is no pending action; the conversation is finished (e.g. "thanks, goodbye"); the client just started the conversation and has not asked anything yet.
3. Provide a brief 1-sentence summary of the conversation in Spanish.

You MUST respond strictly with a JSON object conforming to this structure:
{
  "is_successful_sale": boolean,
  "waiting_for_life_response": boolean,
  "summary": "1-sentence summary in Spanish",
  "reason": "1-sentence reason in Spanish explaining your classification"
}
`;

  const prompt = `
Customer: ${contactName}
Chat Log (most recent messages first or chronological - check timestamps):
${chatLog}
`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    systemInstruction: {
      parts: [
        { text: systemInstruction }
      ]
    },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error: ${res.status} - ${errText}`);
    }
    
    const result = await res.json();
    const textResult = result.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(textResult);
  } catch (error) {
    console.error(`Error calling Gemini for ${contactName}:`, error.message);
    return {
      is_successful_sale: false,
      waiting_for_life_response: false,
      summary: "Error analizando conversación.",
      reason: error.message
    };
  }
}

async function run() {
  const config = loadConfig();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Missing GEMINI_API_KEY in environment');
    process.exit(1);
  }
  
  const conversations = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'platform_conversations.json'), 'utf8'));
  console.log(`Analyzing ${conversations.length} conversations...`);
  
  const results = [];
  const batchSize = 5; // To avoid hitting rate limits too fast
  
  for (let i = 0; i < conversations.length; i += batchSize) {
    const batch = conversations.slice(i, i + batchSize);
    const promises = batch.map(async (conv) => {
      const messages = await fetchMessages(config, conv.id);
      
      // Sort messages chronologically
      const sortedMessages = [...messages].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
      
      // Format messages
      const chatLog = sortedMessages.map(msg => {
        const direction = msg.kapso?.direction || 'unknown';
        const sender = direction === 'inbound' ? 'Customer' : 'LifeAgent';
        const content = msg.kapso?.content || msg.text?.body || '';
        const date = new Date(Number(msg.timestamp) * 1000).toISOString();
        return `[${sender} - ${date}]: ${content}`;
      }).join('\n');
      
      const analysis = await analyzeWithGemini(apiKey, conv.contact_name || conv.phone, chatLog);
      
      return {
        id: conv.id,
        phone: conv.phone,
        contact_name: conv.contact_name || conv.phone,
        messages_count: sortedMessages.length,
        last_message_text: conv.kapso?.last_message_text,
        analysis
      };
    });
    
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
    console.log(`Processed ${results.length}/${conversations.length} conversations`);
    
    // Quick sleep
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Save results
  fs.writeFileSync(path.resolve(__dirname, 'classified_conversations.json'), JSON.stringify(results, null, 2));
  console.log('Saved classifications to scratch/classified_conversations.json');
  
  // Calculate summary metrics
  const total = results.length;
  const successfulSales = results.filter(r => r.analysis.is_successful_sale);
  const waitingResponse = results.filter(r => r.analysis.waiting_for_life_response);
  const successfulAndWaiting = results.filter(r => r.analysis.is_successful_sale && r.analysis.waiting_for_life_response);
  const successfulAndNotWaiting = results.filter(r => r.analysis.is_successful_sale && !r.analysis.waiting_for_life_response);
  const otherConversations = results.filter(r => !r.analysis.is_successful_sale);
  
  console.log('\n======================================');
  console.log('SUMMARY METRICS:');
  console.log(`Total Conversations: ${total}`);
  console.log(`Successful Sales (Ventas Exitosas): ${successfulSales.length}`);
  console.log(`Successful Sales Waiting for Response: ${successfulAndWaiting.length}`);
  console.log(`Successful Sales NOT Waiting: ${successfulAndNotWaiting.length}`);
  console.log(`Other Conversations (Inquiries, etc.): ${otherConversations.length}`);
  console.log('======================================');
}

run().catch(console.error);
