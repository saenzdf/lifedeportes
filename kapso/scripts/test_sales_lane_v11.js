#!/usr/bin/env node
/**
 * Huella del prompt v11 (ediciones manuales) + cableado sales-lane
 * (tools del vendedor vs functions, sin request-contact-info en cliente).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const prompt = fs.readFileSync(
  path.join(root, "prompts/agent_vendedor_v11_deepseek.md"),
  "utf8"
);
const wf = JSON.parse(
  fs.readFileSync(
    path.join(root, "workflow_lifedeportes_sales_inbound_v10.json"),
    "utf8"
  )
);
const reg = JSON.parse(fs.readFileSync(path.join(root, "service_registry.json"), "utf8"));

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log("PASS", name);
  } else {
    fail++;
    console.log("FAIL", name);
  }
}

check("v11 header", /v11 · DeepSeek V4/.test(prompt));
check("user: uniforme = pantaloneta, camiseta, medias", /uniforme.*=.*pantaloneta, camiseta, medias/.test(prompt));
check("user: uniformes de presentación", /Hacemos uniformes de presentación/.test(prompt));
check("user: cuello sport in Mal→bien", /si es cuello sport: \+\$3\.000/.test(prompt));
check("user: rompevientos without \$60.000", /Rompevientos \(68\)/.test(prompt) && !/\$60\.000/.test(prompt));
check("user: petos without \$28.000", /Peto sublimado \(69\)/.test(prompt) && !/\$28\.000/.test(prompt));
check("quote.* not broken by markdown italic", /`quote\.\*`/.test(prompt) && !/`quote\.`\*/.test(prompt));
check("shop URL is plain not a broken markdown link", /https:\/\/lifedeportes\.odoo\.com\/shop/.test(prompt) && !/odoo\.com\/shop”\]/.test(prompt));
check("router has phone branch", /\*\*Mandó su número\*\*/.test(prompt));
check("request-contact-info is not a vendor tool", /\*\*No\*\* es tu tool/.test(prompt));

const vendor = wf.nodes.find((n) => n.id === "agent_orquestador_1745500003000");
const staff = wf.nodes.find((n) => n.id === "agent_1780762885818");
const vTools = (vendor?.data?.config?.flow_agent_function_tools || []).map((t) => t.name);
const sTools = (staff?.data?.config?.flow_agent_function_tools || []).map((t) => t.name);
const vIds = (vendor?.data?.config?.flow_agent_function_tools || []).map((t) => t.function_id);

const needVendor = [
  "buscar_producto_odoo",
  "consultar_tarjeta_pedido",
  "consultar_referencias_diseno",
  "notificar_interes_ventas",
  "enviar_formulario_excel",
  "enviar_ubicacion",
];
for (const name of needVendor) {
  check(`vendor tool ${name}`, vTools.includes(name));
}
check("vendor has no request-contact-info", !vTools.includes("request_contact_info") && !vTools.includes("request-contact-info"));
check("vendor has no staff_sales_notify_reply", !vTools.includes("staff_sales_notify_reply"));

const notify = (vendor?.data?.config?.flow_agent_function_tools || []).find((t) => t.name === "notificar_interes_ventas");
check(
  "notify function_id matches registry",
  notify?.function_id === reg.functions.notify_sales_interest.kapso_function_id
);

const ensureNode = wf.nodes.find((n) => (n.data?.config?.function_id || "") === reg.customer_lane.ensure_crm_function_id);
check("ensure-crm-from-quote node in graph", Boolean(ensureNode));
check(
  "on-contact-shared is webhook not vendor tool",
  reg.functions.on_contact_shared?.public_endpoint === true && !vTools.includes("on_contact_shared")
);
check("staff keeps staff_sales_notify_reply", sTools.includes("staff_sales_notify_reply"));
check("staff keeps enviar_formulario_excel", sTools.includes("enviar_formulario_excel"));

const embed = fs.readFileSync(path.join(root, "scripts/embed_agent_knowledge.js"), "utf8");
check("embed points at v11", /promptFile: "prompts\/agent_vendedor_v11_deepseek.md"/.test(embed));

console.log(fail ? `\nFAILED ${fail}/${pass + fail}` : `\nOK ${pass}`);
process.exit(fail ? 1 : 0);
