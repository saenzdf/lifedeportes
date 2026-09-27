#!/usr/bin/env node
/**
 * audit_lead_tool_usage.js — Auditor y monitor de uso de tools en Kapso Life Deportes.
 *
 * Modos de uso:
 *   node kapso/scripts/audit_lead_tool_usage.js --recent 10
 *   node kapso/scripts/audit_lead_tool_usage.js --watch
 *   node kapso/scripts/audit_lead_tool_usage.js --test-functions
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const envPath = path.join(root, "../.env");

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const base = process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai";
const apiKey = process.env.KAPSO_API_KEY;
const WF_ID = "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";
const SEARCH_FID = "4503ca5c-7114-4442-bada-112be3ddf67e";

if (!apiKey) {
  console.error("Error: KAPSO_API_KEY no encontrada en entorno ni en .env");
  process.exit(1);
}

async function kapsoFetch(pathname, options = {}) {
  const url = `${base}${pathname}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Kapso API error [${res.status}] en ${pathname}: ${txt}`);
  }
  return res.json();
}

/**
 * Audita una ejecución individual inspeccionando sus variables y pasos.
 */
async function auditExecution(executionId) {
  try {
    const res = await kapsoFetch(`/platform/v1/workflow_executions/${executionId}`);
    const data = res.data || res;
    const steps = data.steps || [];
    const vars = data.vars || data.execution_context?.vars || {};
    const context = data.whatsapp_context || {};
    const phone = vars.user?.wa_id || vars.user?.phone || context.conversation?.phone_number || "Desconocido";
    const contactName = vars.user?.name || context.conversation?.contact_name || "Cliente";

    // Extraer último mensaje del cliente
    let lastCustomerMsg = vars.context?.last_inbound_text || "";
    if (!lastCustomerMsg && Array.isArray(context.messages)) {
      for (let i = context.messages.length - 1; i >= 0; i--) {
        const m = context.messages[i];
        if (m.direction === "inbound" || m.kapso?.direction === "inbound") {
          lastCustomerMsg = m.text?.body || m.kapso?.content || m.body || "";
          break;
        }
      }
    }

    // Auditoría de tools
    const toolsUsed = [];
    if (vars.service?.last_call_name) toolsUsed.push(vars.service.last_call_name);
    if (vars.pricing?.total_cop) toolsUsed.push("buscar_producto_odoo (cotizado)");
    if (vars.sales_notify?.status === "sent") toolsUsed.push("notificar_interes_ventas (enviado)");
    if (vars.excel_form?.sent) toolsUsed.push("enviar_formulario_excel");

    const issues = [];
    const passes = [];

    // Regla 1: Detección de intención comercial y uso de buscar_producto_odoo
    const isCommercial = /uniforme|camiseta|cotiz|precio|cu[aá]nto|valor|para\s+\d+|futbol|basket|voley/i.test(lastCustomerMsg);
    if (isCommercial) {
      if (vars.quote?.product_text || vars.pricing?.total_cop || vars.service?.last_call_name === "buscar_producto_odoo") {
        passes.push(`✓ Llamó buscar_producto_odoo: "${vars.quote?.product_text || vars.product?.match_name}" ($${vars.pricing?.total_cop || vars.quote?.total_cop} COP)`);
        if (vars.jev_shadow?.ok) {
          passes.push(`✓ Jev activo: Match ${vars.jev_shadow.matched_template} (latencia: ${vars.jev_shadow.latency_ms}ms, confianza: ${vars.jev_shadow.confidence})`);
        }
      } else {
        issues.push(`⚠️ El cliente pidió producto/precio ("${lastCustomerMsg.slice(0, 40)}..."), pero no se registró llamada a buscar_producto_odoo`);
      }
    }

    // Regla 2: Intención de pago / cuentas y notificación a asesor
    const isPaymentIntent = /cuenta|bancolombia|daviplata|nequi|transfer|abon|pagar|comprobante|datos para el abono/i.test(lastCustomerMsg);
    if (isPaymentIntent) {
      if (vars.sales_notify?.status === "sent" || vars.service?.last_call_name === "notificar_interes_ventas") {
        passes.push(`✓ Notificó asesor comercial: Prioridad 3 asignada a ${vars.sales_notify?.advisor_assigned || "asesor"}`);
      } else {
        issues.push(`⚠️ El cliente pidió pagar/cuentas ("${lastCustomerMsg.slice(0, 40)}..."), pero no se llamó notificar_interes_ventas`);
      }
    }

    // Regla 3: Sobrecostos en tallas especiales si fueron mencionadas
    if (/\b(2xl|xxl|3xl|xxxl)\b/i.test(lastCustomerMsg)) {
      if (vars.pricing?.surcharges && vars.pricing.surcharges.length > 0) {
        passes.push(`✓ Detectó sobrecostos de tallas grandes: ${vars.pricing.surcharges.map(s => s.name).join(", ")}`);
      } else {
        issues.push(`⚠️ Mencionó tallas 2XL/3XL en mensaje pero no se encontraron sobrecostos aplicados en pricing`);
      }
    }

    return {
      id: executionId,
      status: data.status,
      created_at: data.created_at || data.started_at,
      contact: `${contactName} (${phone})`,
      lastMessage: lastCustomerMsg.slice(0, 70),
      tools: toolsUsed,
      passes,
      issues,
      summary: vars.pricing?.summary_es || vars.quote?.summary_es || "Sin cotización formal",
    };
  } catch (err) {
    return { id: executionId, error: err.message };
  }
}

/**
 * Modo Reciente: Audita las últimas N ejecuciones.
 */
async function auditRecent(limit = 10) {
  console.log(`\n🔍 Consultando las últimas ${limit} ejecuciones del workflow ${WF_ID}...\n`);
  const res = await kapsoFetch(`/platform/v1/workflows/${WF_ID}/executions?limit=${limit}`);
  const list = res.data?.executions || res.data || [];

  if (!list.length) {
    console.log("No se encontraron ejecuciones recientes.");
    return;
  }

  for (const ex of list) {
    const audit = await auditExecution(ex.id);
    if (audit.error) {
      console.log(`❌ Ejecución ${ex.id}: Error al auditar (${audit.error})`);
      continue;
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🆔 Ejecución: ${audit.id} | Estado: ${audit.status} | Fecha: ${audit.created_at}`);
    console.log(`👤 Contacto: ${audit.contact}`);
    if (audit.lastMessage) console.log(`💬 Mensaje cliente: "${audit.lastMessage}"`);
    console.log(`🛠️  Tools utilizadas: ${audit.tools.length ? audit.tools.join(" → ") : "Ninguna"}`);
    if (audit.summary !== "Sin cotización formal") console.log(`📋 Cotización: ${audit.summary}`);

    if (audit.passes.length) {
      audit.passes.forEach(p => console.log(`   ${p}`));
    }
    if (audit.issues.length) {
      audit.issues.forEach(i => console.log(`   ${i}`));
    } else {
      console.log(`   ✅ Cumplimiento de reglas de tools: OK`);
    }
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

/**
 * Modo Watcher: Monitorea continuamente en tiempo real cada X segundos.
 */
async function watchExecutions(intervalSec = 10) {
  console.log(`\n👀 Iniciando observador en vivo de ejecuciones de Kapso (intervalo: ${intervalSec}s)...`);
  console.log(`Presiona Ctrl+C para detener.\n`);

  const seenIds = new Set();
  // Inicializar con las existentes
  try {
    const initRes = await kapsoFetch(`/platform/v1/workflows/${WF_ID}/executions?limit=5`);
    const initList = initRes.data?.executions || initRes.data || [];
    initList.forEach(e => seenIds.add(e.id));
  } catch (e) {
    console.error("Error al inicializar lista de ejecuciones:", e.message);
  }

  setInterval(async () => {
    try {
      const res = await kapsoFetch(`/platform/v1/workflows/${WF_ID}/executions?limit=5`);
      const list = res.data?.executions || res.data || [];
      for (const ex of list) {
        if (!seenIds.has(ex.id)) {
          seenIds.add(ex.id);
          console.log(`\n🔔 NUEVA EJECUCIÓN DETECTADA: ${ex.id}`);
          // Esperar 3 segundos a que termine el procesamiento del turno
          await new Promise(r => setTimeout(r, 3000));
          const audit = await auditExecution(ex.id);
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`🆔 ${audit.id} | Contacto: ${audit.contact}`);
          console.log(`💬 Mensaje: "${audit.lastMessage}"`);
          console.log(`🛠️  Tools: ${audit.tools.join(" → ") || "Ninguna"}`);
          if (audit.passes.length) audit.passes.forEach(p => console.log(`   ${p}`));
          if (audit.issues.length) audit.issues.forEach(i => console.log(`   ${i}`));
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        }
      }
    } catch (err) {
      console.error("Error en ciclo de monitoreo:", err.message);
    }
  }, intervalSec * 1000);
}

/**
 * Modo Test: Prueba directa de la función y de la lógica de Jev.
 */
async function testFunctions() {
  console.log("\n🧪 Ejecutando batería de pruebas unitarias sobre odoo-search-product-price (Jev)...\n");

  const testCases = [
    {
      name: "Uniforme base de fútbol (50 jugadores + 1 arquero)",
      input: { product_text: "50 uniformes de futbol y 1 arquero", quantity: 51 },
      expectTemplate: 115,
      expectTotal: 2550000,
      expectSurchargesCount: 0,
    },
    {
      name: "Uniformes de fútbol con tallas 2XL / 3XL y cuello sport",
      input: { product_text: "14 uniformes fútbol cuello sport, 2 en XXL y 1 en 3XL", quantity: 14 },
      expectTemplate: 115,
      expectTotal: 804000,
      expectSurchargesCount: 3,
    },
    {
      name: "Camisetas deportivas dry-fit solas",
      input: { product_text: "20 camisetas dry fit para atletismo", quantity: 20 },
      expectTemplate: 62,
      expectTotal: 600000,
      expectSurchargesCount: 0,
    },
  ];

  let passed = 0;
  for (const tc of testCases) {
    process.stdout.write(`Prueba: ${tc.name}... `);
    try {
      const res = await kapsoFetch(`/platform/v1/functions/${SEARCH_FID}/invoke`, {
        method: "POST",
        body: JSON.stringify({ input: tc.input }),
      });

      const template = res.vars?.product?.odoo_template_id;
      const total = res.vars?.pricing?.total_cop;
      const surcharges = res.vars?.pricing?.surcharges || [];

      if (template === tc.expectTemplate && total === tc.expectTotal && surcharges.length === tc.expectSurchargesCount) {
        console.log(`✅ PASÓ (${res.vars?.jev_shadow?.latency_ms || 0}ms, confidence: ${res.vars?.jev_shadow?.confidence})`);
        passed++;
      } else {
        console.log(`❌ FALLÓ`);
        console.log(`   Esperado: Template ${tc.expectTemplate}, Total $${tc.expectTotal}, Surcharges: ${tc.expectSurchargesCount}`);
        console.log(`   Obtenido: Template ${template}, Total $${total}, Surcharges: ${surcharges.length}`);
      }
    } catch (e) {
      console.log(`❌ ERROR: ${e.message}`);
    }
  }

  console.log(`\nResultado: ${passed}/${testCases.length} pruebas pasadas con éxito.\n`);
}

async function main() {
  const arg = process.argv[2] || "--recent";
  if (arg === "--recent") {
    const limit = Number(process.argv[3]) || 10;
    await auditRecent(limit);
  } else if (arg === "--watch") {
    await watchExecutions();
  } else if (arg === "--test-functions") {
    await testFunctions();
  } else {
    console.log(`Uso:
  node kapso/scripts/audit_lead_tool_usage.js --recent [N]
  node kapso/scripts/audit_lead_tool_usage.js --watch
  node kapso/scripts/audit_lead_tool_usage.js --test-functions`);
  }
}

main().catch(console.error);
