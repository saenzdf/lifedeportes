#!/usr/bin/env node
/** Actualiza input_schema de buscar_producto_odoo en agente staff v10. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wfPath = path.join(__dirname, "..", "workflow_lifedeportes_sales_inbound_v10.json");
const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));
const node = wf.nodes.find((n) => n.id === "agent_1780762885818");
if (!node) throw new Error("staff agent missing");

const tool = node.data.config.flow_agent_function_tools?.find(
  (t) => t.name === "buscar_producto_odoo"
);
if (!tool) throw new Error("buscar_producto_odoo tool missing");

tool.description =
  "Resuelve producto Odoo desde lenguaje natural, deporte, variante (cuello/manga/tela) o descripcion de foto. Devuelve propuesta, alternativas, confidence y pregunta de clarificacion.";

tool.input_schema = {
  type: "object",
  required: ["product_text"],
  properties: {
    product_text: {
      type: "string",
      description:
        "Lo que dice la operaria o cliente: ej. camiseta de futbol, uniforme voleibol, camiseta polo",
    },
    quantity: { type: "number", description: "Cantidad de unidades (min 6 habitual)" },
    sport: {
      type: "string",
      enum: ["futbol", "baloncesto", "voleibol", "atletismo"],
      description: "Deporte si ya se conoce",
    },
    garment_type: {
      type: "string",
      enum: [
        "uniforme_completo",
        "camiseta_sola",
        "pantaloneta",
        "medias",
        "arquero",
        "sudadera_conjunto",
        "gorra",
        "bandera",
      ],
      description: "Tipo de prenda si se distingue",
    },
    collar: {
      type: "string",
      description: "polo_sin_botones, polo_con_botones, cuello_v, cuello_redondo, cuello_sport",
    },
    sleeves: {
      type: "string",
      description: "manga_corta, manga_larga, manga_sisa, ranglan",
    },
    material: { type: "string", description: "dry_fit, dumonti, hidrotec, lluvia" },
    photo_description: {
      type: "string",
      description: "Lo visto en foto referencia: ej. cuello polo, manga larga, dry fit",
    },
    visual_hints: {
      type: "array",
      items: { type: "string" },
      description: "Pistas visuales o del transcript",
    },
    reference_notes: {
      type: "string",
      description: "Notas adicionales de la operaria",
    },
  },
};

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");
console.log("Patched buscar_producto_odoo schema on staff agent");
