#!/usr/bin/env node
/**
 * sweep_rescue_leads_jev.js — Barredor inteligente de rescate con Jev (typesafe/jev-1.13).
 *
 * Escanea conversaciones recientes en Kapso, cruza contra leads en Odoo CRM,
 * y para las que NO están en CRM, utiliza Jev Decisions API para evaluar si
 * existe una oportunidad real perdida/atascada. Si es afirmativo, crea el lead
 * en Odoo con resumen, adjuntos e links directos.
 *
 * Uso:
 *   node kapso/scripts/sweep_rescue_leads_jev.js --dry-run
 *   node kapso/scripts/sweep_rescue_leads_jev.js --hours 72 --dry-run
 *   node kapso/scripts/sweep_rescue_leads_jev.js --live
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const PHONE_ID = "1095603153637786";
const PROJECT_ID = "b470d474-6a7a-4d84-a214-6cd4b198b4f3";
const STAFF_PHONES = new Set([
  "573103362484", // Javier
  "573213988464", // Paola
  "3000000046", // Sebastián
  "3000000047", // Diego
]);

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, "utf8").split("\n");
  for (const line of lines) {
    if (line.includes("=") && !line.startsWith("#")) {
      const [k, ...rest] = line.split("=");
      const key = k.trim();
      const val = rest.join("=").trim().replace(/^["\x27]|["\x27]$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}

function loadEnv() {
  loadEnvFile(path.join(ROOT, "..", "..", ".env"));
  loadEnvFile(path.join(ROOT, ".env"));
}

function digits(v) {
  return String(v || "").replace(/\D/g, "");
}

function matchPhone(a, b) {
  const x = digits(a);
  const y = digits(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(y.slice(-10)) || y.endsWith(x.slice(-10));
}

async function kapso(apiPath) {
  const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const res = await fetch(`${base}${apiPath}`, {
    headers: {
      "X-API-Key": process.env.KAPSO_API_KEY,
      Accept: "application/json",
    },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function callJevDecision(state, questions) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, reason: "missing_openrouter_api_key" };

  try {
    const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "typesafe/jev-1.13",
        state,
        questions,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, reason: `http_${res.status}: ${txt.slice(0, 100)}` };
    }
    const data = await res.json();
    return { ok: true, answers: data?.answers || {}, usage: data?.usage };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function odooAuth() {
  const url = process.env.ODOO_LIFEDEPORTES_PROD_URL.replace(/\/$/, "");
  const body = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "common",
      method: "authenticate",
      args: [
        process.env.ODOO_LIFEDEPORTES_PROD_DB,
        process.env.ODOO_LIFEDEPORTES_PROD_USERNAME,
        process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD,
        {},
      ],
    },
    id: 1,
  };
  const r = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error?.data?.message || j.error.message);
  return j.result;
}

async function odooExec(uid, model, method, args, kwargs = {}) {
  const url = process.env.ODOO_LIFEDEPORTES_PROD_URL.replace(/\/$/, "");
  const body = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [
        process.env.ODOO_LIFEDEPORTES_PROD_DB,
        uid,
        process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD,
        model,
        method,
        args,
        kwargs,
      ],
    },
    id: 2,
  };
  const r = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error?.data?.message || j.error.message);
  return j.result;
}

function cleanMsgText(m) {
  const k = m?.kapso || {};
  return String(k.content || k.caption || m.text?.body || m.content || "").trim();
}

async function run() {
  loadEnv();
  const dryRun = !process.argv.includes("--live");
  const hoursArgIdx = process.argv.indexOf("--hours");
  const hours = hoursArgIdx >= 0 ? Number(process.argv[hoursArgIdx + 1]) : 72;
  const sinceMs = Date.now() - hours * 3600 * 1000;

  console.log(`========================================================`);
  console.log(`🧹 BARREDOR DE RESCATE CRM CON JEV (Life Deportes)`);
  console.log(`   Modo: ${dryRun ? "DRY RUN (Simulación)" : "LIVE (Creará oportunidades en Odoo)"}`);
  console.log(`   Ventana: últimas ${hours} horas`);
  console.log(`========================================================\n`);

  // 1. Auth Odoo & fetch recent leads
  console.log("Conectando con Odoo prod...");
  const uid = await odooAuth();
  const sinceOdooStr = new Date(sinceMs - 7 * 86400 * 1000).toISOString().replace("T", " ").slice(0, 19);
  const existingLeads = await odooExec(
    uid,
    "crm.lead",
    "search_read",
    [[["create_date", ">=", sinceOdooStr]]],
    { fields: ["id", "name", "phone", "description", "create_date"], limit: 1000 }
  );
  console.log(`Leads recientes en Odoo analizados: ${existingLeads.length}`);

  // Build lookup index
  const leadsPhoneSet = new Set();
  const leadsConvSet = new Set();
  for (const l of existingLeads) {
    const p = digits(l.phone);
    if (p && p.length >= 10) leadsPhoneSet.add(p.slice(-10));
    const desc = l.description || "";
    const m = desc.match(/conversation_id=([a-f0-9-]+)/i) || desc.match(/kapso:conv=([a-f0-9-]+)/i);
    if (m) leadsConvSet.add(m[1].toLowerCase());
  }

  // 2. Fetch Kapso conversations
  console.log("Consultando conversaciones recientes en Kapso...");
  const candidateConvs = [];
  let page = 1;
  while (page <= 4) {
    const r = await kapso(`/platform/v1/whatsapp/conversations?phone_number_id=${PHONE_ID}&per_page=50&page=${page}`);
    const rows = r.json?.data || [];
    if (!rows.length) break;
    for (const c of rows) {
      const t = new Date(c.last_active_at || c.updated_at || c.kapso?.last_message_timestamp || 0).getTime();
      if (t >= sinceMs) {
        candidateConvs.push(c);
      }
    }
    if (rows.length < 50) break;
    page++;
  }
  console.log(`Conversaciones activas en últimas ${hours}h: ${candidateConvs.length}`);

  // 3. Filter out staff, already-in-CRM, or completely empty
  const toInspect = [];
  for (const c of candidateConvs) {
    const phone = digits(c.phone_number);
    if (STAFF_PHONES.has(phone)) continue;
    if (phone && leadsPhoneSet.has(phone.slice(-10))) continue;
    if (c.id && leadsConvSet.has(c.id.toLowerCase())) continue;

    toInspect.push(c);
  }
  console.log(`Conversaciones sin lead en CRM para evaluar con Jev: ${toInspect.length}\n`);

  const rescued = [];

  for (const c of toInspect) {
    const convId = c.id;
    const phone = c.phone_number || "Sin teléfono";
    const contactName = c.contact_name || c.username || "Cliente";

    // Fetch last messages
    const mRes = await kapso(`/platform/v1/whatsapp/messages?conversation_id=${encodeURIComponent(convId)}&per_page=20`);
    const msgs = mRes.json?.data || (Array.isArray(mRes.json) ? mRes.json : []);
    msgs.sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));

    if (!msgs.length) continue;

    // Check if ads prefill only
    const inbounds = msgs.filter(m => (m.kapso?.direction || m.direction) === "inbound");
    if (inbounds.length <= 1) {
      const firstTxt = cleanMsgText(inbounds[0] || {}).toLowerCase();
      if (/^hola,\s*quiero\s+cotizar\s+uniformes\s+de\s*$/i.test(firstTxt) || firstTxt.length < 5) {
        // Ignorar prefill vacío
        continue;
      }
    }

    // Has media?
    const hasMedia = msgs.some(m => m.kapso?.has_media || m.type === "image" || m.type === "document");

    // Format chat thread for Jev
    const threadLines = msgs.map(m => {
      const dir = (m.kapso?.direction || m.direction) === "inbound" ? "CLIENTE" : "BOT/STAFF";
      const type = m.type || m.kapso?.type || "";
      let txt = cleanMsgText(m);
      if (!txt && (type === "image" || type === "document")) txt = `[Archivo adjunto: ${type}]`;
      return `${dir}: ${txt}`;
    });

    const lastMessage = msgs[msgs.length - 1];
    const lastSender = (lastMessage.kapso?.direction || lastMessage.direction) === "inbound" ? "cliente" : "bot_o_staff";

    // 4. Call Jev Decisions API
    const jevState = {
      customer_name: contactName,
      customer_phone: phone,
      has_attached_media: hasMedia,
      last_message_sender: lastSender,
      total_messages: msgs.length,
      chat_transcript: threadLines.join("\n").slice(-2500)
    };

    const jevQuestions = {
      is_commercial_lead: {
        type: "choice",
        instructions: "¿El cliente tiene una intención comercial real y definida de cotizar o mandar a confeccionar prendas deportivas en Life Deportes?",
        criteria: {
          "yes_opportunity": "Sí: solicita cotización, especifica prendas, cantidades, deporte, o adjunta diseño/fotos para cotizar.",
          "no_casual_or_spam": "No: es un saludo sin contenido, spam, mensaje equivocado o no hay intención comercial clara.",
          "declined_or_closed": "No: el cliente dijo expresamente que ya no le interesa, que desistió, o el asunto ya fue finalizado negativamente."
        }
      },
      detected_garment_category: {
        type: "choice",
        instructions: "¿Qué tipo de prenda principal busca el cliente según la conversación?",
        criteria: {
          "uniformes_completos": "Uniformes deportivos completos (ej: fútbol, baloncesto, voleibol)",
          "camisetas_solas": "Solo camisetas o polos deportivas",
          "sudaderas_o_buzos": "Sudaderas completas, chaquetas o busos/hoodies",
          "otro_o_no_especificado": "Otros artículos o aún no lo ha especificado"
        }
      },
      lead_status: {
        type: "choice",
        instructions: "¿En qué estado operativo se encuentra la conversación?",
        criteria: {
          "frozen_in_bot": "El bot no respondió, se congeló, o la conversación quedó interrumpida cuando el cliente esperaba avance.",
          "quoted_pending_client": "El bot o asesor ya entregó precio y se espera respuesta/abono del cliente.",
          "exploring_details": "Estaban aclarando detalles de tela, diseño o tallas antes de cotizar."
        }
      }
    };

    const jevRes = await callJevDecision(jevState, jevQuestions);
    if (!jevRes.ok) {
      console.log(`⚠️ Error llamando a Jev para ${phone}: ${jevRes.reason}`);
      continue;
    }

    const decision = jevRes.answers?.is_commercial_lead?.choice;
    const confidence = jevRes.answers?.is_commercial_lead?.confidence || 0;
    const garment = jevRes.answers?.detected_garment_category?.choice || "otro";
    const status = jevRes.answers?.lead_status?.choice || "frozen_in_bot";

    if (decision === "yes_opportunity" && confidence >= 0.70) {
      console.log(`🎯 OPORTUNIDAD DETECTADA POR JEV:`);
      console.log(`   Cliente: ${contactName} | Tel: ${phone} | Confianza: ${(confidence * 100).toFixed(0)}%`);
      console.log(`   Prenda: ${garment} | Estado: ${status}`);

      // Extract details for lead
      const convUrl = `https://inbox.kapso.ai/projects/${PROJECT_ID}?conversation_id=${encodeURIComponent(convId)}`;
      const waLink = phone.startsWith("57") ? `https://wa.me/${phone}` : `https://wa.me/57${phone}`;

      const leadDescription = `
<p><b>🤖 Oportunidad Rescatada Automáticamente por Jev</b> — detectada intención comercial en Kapso sin lead en Odoo.</p>
<p><b>Estado detectado:</b> ${status} (Prenda: ${garment})</p>
<p><a href="${convUrl}" target="_blank" rel="noopener noreferrer"><b>Abrir chat en Kapso</b></a> (enviar template / responder)</p>
<p><a href="${waLink}" target="_blank"><b>Escribir por WhatsApp</b></a></p>
<p><b>Resumen de conversación reciente:</b></p>
<blockquote>${threadLines.slice(-6).map(l => `<p>${l}</p>`).join("")}</blockquote>
<!-- team:${contactName} -->
<!-- kapso:conv=${convId} bsuid=${c.business_scoped_user_id || ""} fp=${convId}|rescate_jev source=sweep_rescue_jev -->
`.trim();

      const leadVals = {
        name: `[Rescate Jev] ${contactName} - ${garment.replace(/_/g, " ")}`,
        contact_name: contactName,
        partner_name: contactName,
        phone: phone.startsWith("+") ? phone : `+${phone}`,
        type: "opportunity",
        stage_id: 6, // Asistente Kapso
        team_id: 1,  // Sales
        user_id: 2,  // Admin
        description: leadDescription,
      };

      if (!dryRun) {
        try {
          const leadId = await odooExec(uid, "crm.lead", "create", [leadVals]);
          console.log(`   ✅ CREADO en Odoo con ID: ${leadId}`);

          // Attach media if any
          for (const m of msgs) {
            const rawUrl = m.kapso?.media_url || m.image?.url || m.document?.url || (cleanMsgText(m).match(/https:\/\/[^\s)]+/i) || [])[0];
            if (rawUrl && rawUrl.includes("kapso.ai") && (rawUrl.includes("active_storage") || rawUrl.includes("media"))) {
              try {
                const imgRes = await fetch(rawUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
                if (imgRes.ok) {
                  const buf = await imgRes.arrayBuffer();
                  const b64 = Buffer.from(buf).toString("base64");
                  const filename = m.document?.filename || `adjunto_${leadId}.png`;
                  await odooExec(uid, "ir.attachment", "create", [{
                    name: filename,
                    datas: b64,
                    res_model: "crm.lead",
                    res_id: leadId,
                    mimetype: m.document?.mime_type || "image/png"
                  }]);
                  console.log(`   📎 Adjunto creado: ${filename}`);
                }
              } catch (attErr) {
                console.log(`   ⚠️ No se pudo adjuntar archivo: ${attErr.message}`);
              }
            }
          }

          rescued.push({ leadId, contactName, phone, garment, status });
        } catch (e) {
          console.log(`   ❌ Error al crear en Odoo: ${e.message}`);
        }
      } else {
        console.log(`   [DRY-RUN] Se crearía lead en Odoo: "${leadVals.name}"`);
        rescued.push({ dryRun: true, contactName, phone, garment, status });
      }
      console.log(`--------------------------------------------------------`);
    }
  }

  console.log(`\n🎉 Resumen del barrido Jev:`);
  console.log(`   Total evaluados: ${toInspect.length}`);
  console.log(`   Oportunidades rescatadas: ${rescued.length}`);
}

run().catch(console.error);
