import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const classified = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'rule_classified.json'), 'utf8'));

// We will build an array of orders
const orders = [];

classified.forEach(c => {
  // Let's find product details and total price from the chat log
  let products = 'No especificado';
  let total = 'No especificado';
  
  // Heuristics to find quantity and products
  // E.g. "7 camisetas para fútbol", "12 uniformes completos"
  const history = c.history;
  
  // Find messages mentioning numbers and sports gear
  let quantityMatch = null;
  let sportMatch = null;
  
  history.forEach(h => {
    const text = h.text.toLowerCase();
    
    // Check if agent quoted a total price
    // e.g. "total sería de $600.000", "total de $210.000", "total es de $245.000"
    const totalRegex = /total (?:sería de|es de|de)?\s*\$?([\d\.]+)/i;
    const m = text.match(totalRegex);
    if (m) {
      total = `$${m[1]}`;
    }
    
    // Check for products in client or agent text
    // "7 camisetas para fútbol", "12 uniformes", etc.
    const prodRegex = /(\d+)\s*(camisetas|uniformes|buzos|pantalones|hoodies|prendas)/i;
    const pm = text.match(prodRegex);
    if (pm) {
      products = `${pm[1]} ${pm[2]}`;
    }
  });
  
  // If we couldn't find a structured product description but client requested something:
  if (products === 'No especificado') {
    // Look for first customer message after welcome
    const clientMsgs = history.filter(h => h.sender === 'Customer');
    if (clientMsgs.length > 0) {
      const firstText = clientMsgs[0].text;
      if (firstText.toLowerCase().includes('cotizar') || firstText.toLowerCase().includes('uniforme')) {
        products = firstText.replace(/hola/i, '').replace(/quiero cotizar/i, '').trim();
        if (products.length > 50) products = products.substring(0, 50) + '...';
      }
    }
  }
  
  // Date of conversation (first message timestamp)
  let dateStr = 'No disponible';
  if (history.length > 0) {
    const firstMsg = history[0];
    dateStr = new Date(firstMsg.timestamp * 1000).toISOString().split('T')[0];
  }

  // Only include conversations that have some product inquiry or closed sale details
  if (products !== 'No especificado' && products !== '') {
    orders.push({
      contact_name: c.contact_name,
      phone: c.phone,
      date: dateStr,
      products: products,
      total: total,
      status: c.status === 'handoff' ? 'Handoff (Espera Humano)' : 'Esperando Respuesta',
      is_sale: c.is_successful_sale ? 'Sí' : 'No'
    });
  }
});

// Sort by date descending
orders.sort((a, b) => new Date(b.date) - new Date(a.date));

// Build Markdown table
let md = `# Resumen de Pedidos y Conversaciones\n\n`;
md += `A continuación se detallan los pedidos y cotizaciones identificados en las conversaciones con los clientes, ordenados por fecha:\n\n`;
md += `| Fecha | Cliente / Teléfono | Lista de Productos / Solicitud | Total Cotizado | ¿Venta Exitosa? | Estado |\n`;
md += `| :--- | :--- | :--- | :---: | :---: | :--- |\n`;

orders.forEach(o => {
  md += `| ${o.date} | **${o.contact_name}** (${o.phone}) | ${o.products} | ${o.total} | ${o.is_sale} | ${o.status} |\n`;
});

// Write artifact
const artifactDir = '/Users/diego/.gemini/antigravity/brain/3df7d9d8-f404-42f8-b46d-7c8e2ffa3f04';
const artifactPath = path.join(artifactDir, 'resumen_pedidos_conversaciones.md');

fs.writeFileSync(artifactPath, md, 'utf8');
console.log(`Report generated successfully at: ${artifactPath}`);
