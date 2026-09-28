#!/usr/bin/env node
/**
 * Tests del split prompt + KB (debug antes de publicar grafo).
 * Ejecutar: node kapso/tests/run_agent_knowledge_tests.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kapsoRoot = path.resolve(__dirname, "..");

const {
  KB_CATALOG,
  AGENTS,
  RETIRED_AGENTS,
  loadKnowledge,
  applyAgent,
} = await import(path.join(kapsoRoot, "scripts/embed_agent_knowledge.js"));

let passed = 0;
let failed = 0;

function ok(name) {
  console.log("✓", name);
  passed++;
}

function fail(name, detail) {
  console.log("✗", name, detail || "");
  failed++;
}

function assert(name, cond, detail) {
  if (cond) ok(name);
  else fail(name, detail);
}

// --- Archivos fuente ---
for (const [key, def] of Object.entries(KB_CATALOG)) {
  const p = path.join(kapsoRoot, def.file);
  assert(`KB file exists: ${key}`, fs.existsSync(p));
  const text = fs.readFileSync(p, "utf8");
  assert(`KB min length: ${key}`, text.length >= 200, `${text.length} chars`);
}

const catalog = fs.readFileSync(path.join(kapsoRoot, KB_CATALOG.life_catalogo_precios.file), "utf8");
assert("catalogo: precio uniforme fútbol", catalog.includes("$50.000") && catalog.includes("Fútbol"));
assert("catalogo: camiseta dry-fit", catalog.includes("$30.000"));

const lenguaje = fs.readFileSync(path.join(kapsoRoot, KB_CATALOG.life_lenguaje_cliente_productos.file), "utf8");
assert("lenguaje: ambigüedad camiseta", lenguaje.includes("camiseta sola") && lenguaje.includes("uniforme completo"));
assert("lenguaje: voley", lenguaje.includes("voley"));
assert("lenguaje: arquero campo", lenguaje.includes("de campo"));

const reglas = fs.readFileSync(path.join(kapsoRoot, KB_CATALOG.life_reglas_comerciales.file), "utf8");
assert("reglas: mínimo 6", /6 unidades/i.test(reglas));
assert("reglas: deportes", reglas.includes("Fútbol") && reglas.includes("Atletismo"));
assert("reglas: frase cierre", reglas.includes("abono del 50%"));
assert("reglas: horarios", reglas.includes("8:00") && reglas.includes("5:00 p.m.") && reglas.includes("2:00 p.m."));
assert("reglas: whatsapp", reglas.includes("310 336 2484"));
assert("reglas: condiciones web", reglas.includes("terms-of-use"));

const horarios = fs.readFileSync(path.join(kapsoRoot, KB_CATALOG.life_horarios_ventas.file), "utf8");
assert("horarios KB: in_hours", horarios.includes("in_hours"));
assert("horarios KB: copy cierre", horarios.includes("hoy mismo"));

const flujoMedia = fs.readFileSync(path.join(kapsoRoot, KB_CATALOG.life_flujo_audio_foto.file), "utf8");
assert("flujo media: transcript", flujoMedia.includes("Transcript"));
assert("flujo media: camiseta sola", flujoMedia.includes("camiseta_sola"));
assert("flujo media: respuesta texto", /siempre.*texto/i.test(flujoMedia));

const vendedorSlim = fs.readFileSync(
  path.join(kapsoRoot, AGENTS.vendedor.promptFile),
  "utf8"
);
const vendedorV3 = fs.readFileSync(path.join(kapsoRoot, "prompts/agent_vendedor_v3.md"), "utf8");

assert("vendedor slim: sin catálogo embebido", !vendedorSlim.includes("### 5.3 Catálogo Completo"));
assert(
  "vendedor slim: longitud razonable (FAQ hard rules v10)",
  vendedorSlim.length < 35000 && vendedorSlim.length > 8000,
  `len=${vendedorSlim.length}`
);
assert("vendedor slim: ref KB horarios", vendedorSlim.includes("life_horarios_ventas"));
assert("vendedor slim: ref KB catálogo", vendedorSlim.includes("life_catalogo_precios"));
assert("vendedor slim: ref KB lenguaje cliente", vendedorSlim.includes("life_lenguaje_cliente_productos"));
assert("vendedor slim: ref KB audio foto", vendedorSlim.includes("life_flujo_audio_foto"));
assert("vendedor slim: respuesta texto", /texto/i.test(vendedorSlim) && vendedorSlim.includes("life_flujo_audio_foto"));
assert("vendedor slim: buscar obligatorio Fase 3", 
  vendedorSlim.includes("buscar_producto_odoo") && /Obligatorio/i.test(vendedorSlim));
assert("vendedor slim: checklist precio", /Checklist\s*(—|-)?\s*Antes de enviar/i.test(vendedorSlim));

// El prompt staff legacy se conserva como referencia, pero NO se embebe en ningún nodo.
const staffSlim = fs.readFileSync(path.join(kapsoRoot, "prompts/agent_staff_upload_v9_slim.md"), "utf8");
assert("staff legacy: prompt archivado existe (referencia)", staffSlim.includes("life_catalog_staff_match"));
assert("staff legacy: agente retirado del embed", !!RETIRED_AGENTS.staff && !AGENTS.staff);

const variantes = fs.readFileSync(path.join(kapsoRoot, KB_CATALOG.life_variantes_odoo.file), "utf8");
assert("variantes: voley corta 12202", variantes.includes("12202"));
assert("variantes: corta vs china", variantes.includes("manga corta") && variantes.includes("manga china"));

// --- loadKnowledge ---
const vKb = loadKnowledge(AGENTS.vendedor.knowledgeKeys);
assert("vendedor KB count", vKb.length === AGENTS.vendedor.knowledgeKeys.length);
assert("vendedor KB schema", vKb.every((k) => k.name && k.description && k.knowledge_base_text));

// --- Simular embed en copia del grafo ---
const wfPath = path.join(kapsoRoot, "workflow_lifedeportes_sales_inbound_v10.json");
const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));
const wfCopy = JSON.parse(JSON.stringify(wf));

applyAgent(wfCopy, "vendedor");

const vNode = wfCopy.nodes.find((n) => n.id === AGENTS.vendedor.nodeId);
const nodeIds = new Set(wfCopy.nodes.map((n) => n.id));

// --- Carril staff = Hermes local (retiro 2026-09-16) ---
assert("grafo staff: agente staff legacy retirado", !nodeIds.has("agent_1780762885818"));
assert("grafo staff: forwarder a Hermes presente", nodeIds.has("fn_staff_hermes_forwarder"));
assert("grafo staff: sin camino legacy de subida", !nodeIds.has("fn_validate_staff_write_1745500003300"));
assert("grafo staff: sin decide legacy lane-resume", !nodeIds.has("decide_route_staff_lane_resume_1745500019060"));
const fwdEdges = wfCopy.edges.filter((e) => e.source === "fn_staff_hermes_forwarder");
assert(
  "grafo staff: forwarder despacha a wait_staff_lane",
  fwdEdges.length === 1 && fwdEdges[0].target === "wait_staff_lane_1745500019050",
  JSON.stringify(fwdEdges)
);
const burstTimeout = wfCopy.edges.find(
  (e) => e.source === "decide_route_staff_burst_resume_1745500019210" && e.label === "timeout"
);
assert(
  "grafo staff: el burst staff va al forwarder (no al agente)",
  burstTimeout?.target === "fn_staff_hermes_forwarder",
  JSON.stringify(burstTimeout)
);
const laneNext = wfCopy.edges.find((e) => e.source === "wait_staff_lane_1745500019050");
assert(
  "grafo staff: wait_staff_lane reengancha al burst",
  laneNext?.target === "wait_staff_burst_1745500019200",
  JSON.stringify(laneNext)
);
assert(
  "grafo staff: functions legacy fuera del grafo",
  !wfCopy.nodes.some((n) =>
    ["odoo-create-lead-and-so", "build-quote-payload", "route-staff-domain-guard", "compile-staff-order-draft"].includes(
      n.data?.config?.function_name
    )
  )
);

assert("grafo vendedor: KB no vacío", vNode.data.config.flow_agent_knowledge_bases.length === AGENTS.vendedor.knowledgeKeys.length);
assert(
  "grafo vendedor: prompt sin sección 5.3",
  !vNode.data.config.system_prompt.includes("Sudaderas en algodón lycrado")
);
assert(
  "grafo vendedor: tool schema extendido",
  !!vNode.data.config.flow_agent_function_tools
    ?.find((t) => t.name === "buscar_producto_odoo")
    ?.input_schema?.properties?.sport
);

// --- validate-graph (archivo en disco puede estar desactualizado; validamos copia temporal) ---
const tmpPath = path.join(kapsoRoot, ".tmp_workflow_kb_test.json");
fs.writeFileSync(tmpPath, JSON.stringify(wfCopy, null, 2));
const validate = spawnSync(
  "node",
  [path.join(kapsoRoot, "scripts/validate-graph-lifedeportes.js"), tmpPath],
  { encoding: "utf8" }
);
fs.unlinkSync(tmpPath);

let validateOk = false;
try {
  const report = JSON.parse(validate.stdout);
  validateOk = report.valid === true;
  if (!validateOk) {
    fail("validate-graph en grafo con KB", JSON.stringify(report.errors).slice(0, 200));
  } else {
    ok("validate-graph en grafo con KB");
  }
} catch (e) {
  fail("validate-graph parse", e.message + " " + validate.stderr?.slice(0, 100));
}

// --- Escenarios de flujo (documentación ejecutable) ---
const flowScenarios = [
  {
    name: "Fase 1 precio desde → KB catálogo",
    phase: 1,
    mustConsult: ["life_catalogo_precios"],
    mustTool: false,
  },
  {
    name: "Fase 3 cotización → buscar_producto_odoo + KB fallback",
    phase: 3,
    mustConsult: ["life_catalogo_precios"],
    mustTool: true,
    tool: "buscar_producto_odoo",
  },
  {
    name: "Deporte rechazado → KB reglas",
    phase: 1,
    mustConsult: ["life_reglas_comerciales"],
    mustTool: false,
  },
  {
    name: "Audio + foto → KB flujo media",
    phase: 1,
    mustConsult: ["life_flujo_audio_foto"],
    mustTool: false,
  },
  {
    name: "Audio cliente → KB kapso patterns",
    phase: 1,
    mustConsult: ["kapso_whatsapp_patterns"],
    mustTool: false,
  },
];

for (const sc of flowScenarios) {
  const promptRefs = sc.mustConsult.every((kb) => vendedorSlim.includes(kb));
  const toolRef = !sc.mustTool || vendedorSlim.includes(sc.tool);
  assert(`flujo: ${sc.name}`, promptRefs && toolRef);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
