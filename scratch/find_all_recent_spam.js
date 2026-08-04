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
      per_page: 50
    }
  });
  if (res.ok) {
    return res.data.messages || res.data || [];
  }
  return [];
}

// Sportswear keywords to identify genuine buyers
const genuineKeywords = [
  'futbol', 'fútbol', 'talla', 'precio', 'cuanto', 'cuánto', 'valor', 'diseño', 'diseno',
  'uniforme', 'pantalon', 'pantaloneta', 'camiseta', 'buzo', 'chaqueta', 'media', 'medias',
  'sublimado', 'deporte', 'deportivo', 'cotizar', 'cotización', 'cotizacion', 'pedido',
  'unidades', 'unidad', 'personalizado', 'logo', 'esquema', 'catálogo', 'catalogo'
];

// Gibberish or common ad click placeholders
const adClickPlaceholders = [
  'hola, quiero cotizar uniformes de',
  'hola quiero cotizar uniformes de'
];

async function run() {
  const config = loadConfig();
  const conversations = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'platform_conversations.json'), 'utf8'));
  
  // Filter for conversations created after June 1, 2026 with at least 3 messages
  const recentConversations = conversations.filter(c => {
    const createdDate = new Date(c.created_at);
    const msgCount = c.kapso?.messages_count || c.messages_count || 0;
    return createdDate >= new Date('2026-06-01T00:00:00Z') && msgCount >= 3;
  });
  
  console.log(`Analyzing ${recentConversations.length} conversations since June 1, 2026...`);
  
  const spamContacts = [];
  const genuineContacts = [];
  let processed = 0;
  
  for (const conv of recentConversations) {
    processed++;
    if (processed % 20 === 0) {
      console.log(`Processed ${processed}/${recentConversations.length}...`);
    }
    
    const messages = await fetchMessages(config, conv.id);
    const sorted = [...messages].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    
    // Group messages by sender
    const customerMessages = sorted.filter(msg => {
      const dir = msg.kapso?.direction || 'unknown';
      return dir === 'inbound';
    });
    
    if (customerMessages.length === 0) continue; // No inbound messages from customer
    
    // Extract customer message texts and types
    let inboundAudiosCount = 0;
    let inboundImagesCount = 0;
    let inboundStickersCount = 0;
    let inboundTexts = [];
    let inboundTypes = [];
    
    customerMessages.forEach(msg => {
      inboundTypes.push(msg.type);
      if (msg.type === 'audio' || msg.type === 'voice') inboundAudiosCount++;
      if (msg.type === 'image') inboundImagesCount++;
      if (msg.type === 'sticker') inboundStickersCount++;
      
      const txt = msg.kapso?.content || msg.text?.body || '';
      if (txt.trim()) {
        inboundTexts.push(txt.trim());
      }
    });
    
    // Analyze if there are genuine sportswear keywords
    let hasGenuineKeyword = false;
    let matchedKeywords = [];
    
    inboundTexts.forEach(txt => {
      const lowerTxt = txt.toLowerCase();
      // Remove standard ad click placeholder to see if there is other text
      let isAdClickOnly = adClickPlaceholders.some(p => lowerTxt === p || lowerTxt.startsWith(p));
      if (isAdClickOnly) return;
      
      genuineKeywords.forEach(kw => {
        if (lowerTxt.includes(kw)) {
          hasGenuineKeyword = true;
          matchedKeywords.push(kw);
        }
      });
    });
    
    // If the customer only clicked the ad button and never replied, we don't count them as spam, just inactive.
    const isInactiveAdClick = customerMessages.length === 1 && 
      adClickPlaceholders.some(p => customerMessages[0].kapso?.content?.toLowerCase()?.trim()?.startsWith(p));
      
    if (isInactiveAdClick) {
      continue;
    }
    
    // Apply rules to detect spam
    let isSpam = false;
    let spamReason = '';
    
    // Rule 1: Two or more audio messages, and no genuine text keywords
    if (inboundAudiosCount >= 2 && !hasGenuineKeyword) {
      isSpam = true;
      spamReason = `Sent ${inboundAudiosCount} audios without any sports/order related keywords.`;
    }
    
    // Rule 2: Unrelated photos + audios or gibberish
    // In our system, if they send images but no sportswear words
    const hasUnrelatedImages = inboundImagesCount >= 1 && !hasGenuineKeyword;
    if (hasUnrelatedImages && (inboundAudiosCount >= 1 || inboundTexts.some(t => t.length < 5))) {
      isSpam = true;
      spamReason = `Sent ${inboundImagesCount} images and ${inboundAudiosCount} audios/short text, with no sportswear context.`;
    }
    
    // Rule 3: Gibberish/insults text
    const insultKeywords = ['malparido', 'mierda', 'hp', 'sapo', 'hpta', 'puta', 'gonorrea'];
    const hasInsults = inboundTexts.some(txt => {
      const lower = txt.toLowerCase();
      return insultKeywords.some(ik => lower.includes(ik));
    });
    
    if (hasInsults) {
      isSpam = true;
      spamReason = 'Sent messages containing insults or profanity.';
    }
    
    // Rule 4: Gibberish/short texts only (excluding ad click)
    const nonAdTexts = inboundTexts.filter(t => !adClickPlaceholders.some(p => t.toLowerCase().startsWith(p)));
    const hasOnlyGibberish = nonAdTexts.length >= 2 && nonAdTexts.every(t => t.length <= 5) && !hasGenuineKeyword;
    if (hasOnlyGibberish && !isSpam) {
      isSpam = true;
      spamReason = `Sent only short/gibberish texts: ${JSON.stringify(nonAdTexts)}`;
    }
    
    // Rule 5: Pure sticker/media flood without conversation
    if (inboundStickersCount >= 3 && !hasGenuineKeyword && !isSpam) {
      isSpam = true;
      spamReason = `Sent ${inboundStickersCount} stickers without conversation.`;
    }
    
    const contactInfo = {
      name: conv.contact_name,
      phone: conv.phone_number,
      messagesCount: sorted.length,
      inboundCount: customerMessages.length,
      audios: inboundAudiosCount,
      images: inboundImagesCount,
      stickers: inboundStickersCount,
      texts: inboundTexts,
      isSpam,
      spamReason,
      matchedKeywords
    };
    
    if (isSpam) {
      spamContacts.push(contactInfo);
    } else {
      genuineContacts.push(contactInfo);
    }
    
    // Throttling to be polite to the API
    await new Promise(r => setTimeout(r, 100));
  }
  
  const report = {
    totalAnalyzed: recentConversations.length,
    spamCount: spamContacts.length,
    genuineCount: genuineContacts.length,
    spamContacts,
    genuineContacts
  };
  
  fs.writeFileSync(path.resolve(__dirname, 'recent_spam_contacts.json'), JSON.stringify(report, null, 2));
  console.log(`\nAnalysis complete!`);
  console.log(`Total analyzed conversations since June 1: ${recentConversations.length}`);
  console.log(`Detected spam contacts: ${spamContacts.length}`);
  console.log(`Detected genuine contacts: ${genuineContacts.length}`);
  console.log(`Results saved to scratch/recent_spam_contacts.json`);
}

run().catch(console.error);
