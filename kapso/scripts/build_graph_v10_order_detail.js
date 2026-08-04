#!/usr/bin/env node
/**
 * Parchea agente staff pedido v10: tools lista + prompt v7 + KB life_lista_pedido_staff.
 * Requiere kapso/docs/order_detail_function_ids.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wfPath = path.join(root, "workflow_lifedeportes_sales_inbound_v10.json");
const idsPath = path.join(root, "docs/order_detail_function_ids.json");
const PEDIDO_AGENT = "agent_1780762885818";

const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));
const node = wf.nodes.find((n) => n.id === PEDIDO_AGENT);
if (!node) throw new Error("Pedido agent missing");

const prompt = fs.readFileSync(path.join(root, "prompts/agent_staff_upload_v9_slim.md"), "utf8").trim();
const listaKb = fs
  .readFileSync(path.join(root, "knowledge/life_lista_pedido_staff_v1.md"), "utf8")
  .trim();
const correccionKb = fs
  .readFileSync(path.join(root, "knowledge/life_correccion_pedido_staff_v1.md"), "utf8")
  .trim();

node.data.config.system_prompt = prompt;

const existingTools = node.data.config.flow_agent_function_tools || [];
const keepNames = new Set([
  "buscar_producto_odoo",
  "verificar_servicio",
  "previsualizar_borrador_cotizacion",
]);
const kept = existingTools.filter((t) => keepNames.has(t.name));

const orderDetailTools = [
  {
    name: "clasificar_adjuntos_pedido",
    description: "Clasifica adjuntos WhatsApp del hilo (lista Excel, imagen lista, referencia diseño). Devuelve suggested_tools.",
    function_id: ids.clasificar_adjuntos_pedido,
    function_name: "clasificar-adjuntos-pedido",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "parsear_lista_excel_pedido",
    description: "Descarga y parsea Excel FORMATO PEDIDO LIFE → order_draft.detail.rows y adjunto detail_list.",
    function_id: ids.parsear_lista_excel_pedido,
    function_name: "parsear-lista-excel-pedido",
    input_schema: {
      type: "object",
      properties: {
        file_url: { type: "string", description: "URL Excel (opcional si está en WhatsApp)" },
        filename: { type: "string" },
        merge_mode: { type: "string", enum: ["replace", "append"] },
      },
    },
  },
  {
    name: "parsear_lista_texto_pedido",
    description: "Parsea texto pegado o JSON de visión → order_draft.detail.rows.",
    function_id: ids.parsear_lista_texto_pedido,
    function_name: "parsear-lista-texto-pedido",
    input_schema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", description: "Lista en texto libre o JSON" },
        source: { type: "string", enum: ["text", "image_vision"] },
        merge_mode: { type: "string", enum: ["replace", "append"] },
      },
    },
  },
  {
    name: "parsear_lista_imagen_pedido",
    description: "Tras ask_about_file: normaliza vision_text a filas. Sin vision_text devuelve pregunta fija.",
    function_id: ids.parsear_lista_imagen_pedido,
    function_name: "parsear-lista-imagen-pedido",
    input_schema: {
      type: "object",
      properties: {
        file_url: { type: "string" },
        vision_text: { type: "string", description: "Salida de ask_about_file" },
        filename: { type: "string" },
        merge_mode: { type: "string", enum: ["replace", "append"] },
      },
    },
  },
  {
    name: "registrar_adjuntos_pedido",
    description: "Registra adjuntos (referencia diseño, Excel ya clasificado) en order_draft.attachments.",
    function_id: ids.registrar_adjuntos_pedido,
    function_name: "registrar-adjuntos-pedido",
    input_schema: {
      type: "object",
      properties: {
        attachments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              filename: { type: "string" },
              role: { type: "string", enum: ["detail_list", "design_reference", "other"] },
            },
          },
        },
      },
    },
  },
  {
    name: "fusionar_borrador_lista",
    description: "Fusiona filas, valida conteo vs cantidad comercial, arma summary_text y blockers.",
    function_id: ids.fusionar_borrador_lista,
    function_name: "fusionar-borrador-lista",
    input_schema: {
      type: "object",
      properties: {
        merge_mode: { type: "string", enum: ["replace", "append"] },
      },
    },
  },
];

const correctionTools = [
  {
    name: "buscar_pedido_odoo",
    description: "Busca pedido por número corto (ej. 2564). Devuelve tarea y etapa.",
    function_id: ids.buscar_pedido_odoo,
    function_name: "buscar-pedido-odoo",
    input_schema: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "Opcional — vars/hilo si falta" },
        customer_phone: { type: "string", description: "Opcional" },
        customer_name: { type: "string", description: "Opcional" },
      },
    },
  },
  {
    name: "corregir_pedido_odoo",
    description:
      "Lista en tarea + adjuntos Excel/fotos en project.task + chatter.",
    function_id: ids.corregir_pedido_odoo,
    function_name: "corregir-pedido-odoo",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "number" },
        change_type: {
          type: "string",
          enum: ["cliente", "error_interno", "error_diseno"],
        },
        change_summary: { type: "string" },
        list_mode: {
          type: "string",
          enum: ["full", "patch", "attachments_only"],
        },
      },
    },
  },
  {
    name: "sincronizar_pedido_odoo",
    description:
      "Pull Kapso←Odoo: reconstruye order_draft desde líneas SO + Formulario Life. Usar tras editar en Odoo o al retomar un pedido.",
    function_id: ids.sync_order_draft_from_odoo,
    function_name: "sync-order-draft-from-odoo",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "number" },
        order_name: { type: "string" },
      },
    },
  },
];

if (!ids.buscar_pedido_odoo || !ids.corregir_pedido_odoo) {
  console.warn("WARN: missing buscar/corregir ids — correction tools may be incomplete");
}
if (!ids.sync_order_draft_from_odoo) {
  console.warn("WARN: missing sync_order_draft_from_odoo id");
}

node.data.config.flow_agent_function_tools = [...kept, ...orderDetailTools, ...correctionTools].filter(
  (t) => t.function_id
);
const kbs = node.data.config.flow_agent_knowledge_bases || [];
const withoutStaffKb = kbs.filter(
  (k) => k.name !== "life_lista_pedido_staff" && k.name !== "life_correccion_pedido_staff"
);
node.data.config.flow_agent_knowledge_bases = [
  {
    name: "life_lista_pedido_staff",
    description: "Tools determinísticas: Excel, texto, imagen lista, adjuntos pedido.",
    knowledge_base_text: listaKb,
  },
  {
    name: "life_correccion_pedido_staff",
    description: "Buscar pedido, corregir lista, tipos de cambio, advertencia Excel.",
    knowledge_base_text: correccionKb,
  },
  ...withoutStaffKb,
];

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");
console.log("Patched pedido agent tools:", orderDetailTools.map((t) => t.name).join(", "));
