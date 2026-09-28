#!/usr/bin/env node
/**
 * test_jev_buying_readiness.js — Prueba de Jev Decision para calificación de leads y compras.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env")
];

for (const envPath of candidates) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
    if (process.env.OPENROUTER_API_KEY) break;
  }
}

const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error("Falta OPENROUTER_API_KEY en .env");
  process.exit(1);
}

const TEST_CASES = [
  {
    name: "Caso 1: Pide cuentas para consignar (Casta)",
    text: "Si confirmo hoy mismo y abono el 50% para cuando estarían listas las camisetas? Me regalas las cuentas?",
    customer: "Casta",
    quote: { product: "Camiseta deportiva dry-fit", quantity: 14, total: 420000 },
    expectedReadiness: "ready_to_pay",
    expectedStars: "3"
  },
  {
    name: "Caso 2: Cotizando / preguntando precios (Alvarinho)",
    text: "cuanto saldría cada uniforme con peto para 8 personas?",
    customer: "Alvarinho Arias",
    quote: { product: "Uniforme de fútbol + peto", quantity: 8, total: 672000 },
    expectedReadiness: "quote_in_progress",
    expectedStars: "0"
  },
  {
    name: "Caso 3: Pide hablar con una persona / llamada",
    text: "Buenas, me regala un número para llamar? Necesito hablar con un asesor.",
    customer: "Carlos",
    quote: null,
    expectedReadiness: "needs_human",
    expectedStars: "2"
  },
  {
    name: "Caso 4: Envío de comprobante de pago",
    text: "Listo amigo, ya le transferí los $400.000 del anticipo por Bancolombia, aquí le mando el soporte.",
    customer: "Mauricio",
    quote: { product: "Uniformes de fútbol", quantity: 16, total: 800000 },
    expectedReadiness: "ready_to_pay",
    expectedStars: "3"
  }
];

async function runTest() {
  console.log("🧪 Probando Jev Decisions API para calificación de intención de pago...\n");

  const jevQuestions = {
    buying_readiness: {
      type: "choice",
      instructions: "Clasifica el nivel de intención del cliente. 'ready_to_pay' si pide cuentas bancarias, dice que va a transferir/abonar, pregunta cómo consignar o ya envió el comprobante. 'quote_in_progress' si solo está cotizando, preguntando precios o pidiendo información. 'needs_human' si pide hablar con un asesor o llamada.",
      criteria: {
        "ready_to_pay": "Pide cuentas, confirma abono del 50%, va a transferir, o adjunta comprobante",
        "quote_in_progress": "Está cotizando, preguntando precios, tallas o modelos",
        "needs_human": "Pide hablar con un asesor humano o solicita llamada",
        "other": "Dudas generales u otro motivo"
      }
    },
    has_explicit_payment_intent: {
      type: "choice",
      instructions: "¿El cliente solicita cuentas bancarias o confirma explícitamente que va a pagar/abonar?",
      criteria: {
        "yes": "Sí, pide cuentas o afirma que va a pagar/consignar",
        "no": "No, no ha pedido cuentas ni confirmado abono"
      }
    }
  };

  let passed = 0;

  for (const tc of TEST_CASES) {
    process.stdout.write(`Prueba [${tc.name}]... `);
    const t0 = Date.now();
    try {
      const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "typesafe/jev-1.13",
          state: {
            customer_name: tc.customer,
            last_message: tc.text,
            quote: tc.quote
          },
          questions: jevQuestions
        })
      });

      const data = await res.json();
      const latency = Date.now() - t0;
      const readiness = data?.answers?.buying_readiness?.choice;
      const confidence = data?.answers?.buying_readiness?.confidence;
      const payIntent = data?.answers?.has_explicit_payment_intent?.choice;

      if (readiness === tc.expectedReadiness) {
        console.log(`✅ PASÓ (${readiness}, conf: ${confidence}, pay: ${payIntent}, ${latency}ms)`);
        passed++;
      } else {
        console.log(`❌ FALLÓ. Esperado: ${tc.expectedReadiness}, Obtenido: ${readiness}`);
      }
    } catch (e) {
      console.log(`❌ ERROR: ${e.message}`);
    }
  }

  console.log(`\nResultado: ${passed}/${TEST_CASES.length} pruebas pasadas.`);
}

runTest().catch(console.error);
