#!/usr/bin/env node
/**
 * Build workflow v7: staff write guard + route-staff-post + loop back
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const v6 = JSON.parse(
  fs.readFileSync(path.join(root, "workflow_lifedeportes_sales_inbound_v6_vendedor.json"), "utf8")
);
const uploadPrompt = fs.readFileSync(path.join(root, "prompts/agent_staff_upload_v3.md"), "utf8");

const upload = v6.nodes.find((n) => n.id === "agent_1780762885818");
if (upload) upload.data.config.system_prompt = uploadPrompt;

const staffPost = v6.nodes.find((n) => n.id === "decide_route_staff_post_1745500002950");
if (staffPost) {
  staffPost.data.config.function_name = "route-staff-post";
  staffPost.data.display_name = "Decision: route-staff-post";
}

const newNodes = [
  {
    id: "fn_validate_staff_write_1745500003300",
    type: "flow-node",
    position: { x: 120, y: 600 },
    data: {
      node_type: "function",
      display_name: "Function: validate-staff-write",
      config: {
        function_id: "PLACEHOLDER_VALIDATE_STAFF_WRITE",
        function_name: "validate-staff-write",
        save_response_to: null,
      },
    },
  },
  {
    id: "decide_route_staff_write_1745500003310",
    type: "flow-node",
    position: { x: 120, y: 680 },
    data: {
      node_type: "decide",
      display_name: "Decision: route-staff-write",
      config: {
        decision_type: "function",
        function_id: "PLACEHOLDER_ROUTE_STAFF_WRITE",
        function_name: "route-staff-write",
        conditions: [
          {
            id: "d1-write-ok",
            label: "staff_write_ok",
            description: "Validacion OK, continuar write.",
          },
          {
            id: "d2-write-blocked",
            label: "staff_write_blocked",
            description: "Faltan confirmacion o datos.",
          },
        ],
      },
    },
  },
  {
    id: "send_staff_write_blocked_1745500003320",
    type: "flow-node",
    position: { x: 320, y: 760 },
    data: {
      node_type: "send_text",
      display_name: "Staff write blocked",
      config: {
        message:
          "Subida cancelada: {{vars.staff.write_blocked_reason}}. Revise datos y confirme de nuevo con el agente.",
        delay_seconds: 0,
      },
    },
  },
];

for (const n of newNodes) {
  if (!v6.nodes.find((x) => x.id === n.id)) v6.nodes.push(n);
}

v6.edges = v6.edges.filter(
  (e) => !(e.source === "agent_1780762885818" && e.target === "decide_route_staff_registration_1745500002755")
);

const addEdge = (id, source, target, label) => {
  if (!v6.edges.find((e) => e.id === id)) {
    v6.edges.push({ id, source, target, label, type: "default", flow_condition_id: null });
  }
};

addEdge("e-upload-to-validate-v7", "agent_1780762885818", "fn_validate_staff_write_1745500003300", "next");
addEdge("e-validate-to-decide-v7", "fn_validate_staff_write_1745500003300", "decide_route_staff_write_1745500003310", "next");
addEdge("e-write-ok-v7", "decide_route_staff_write_1745500003310", "decide_route_staff_registration_1745500002755", "staff_write_ok");
addEdge("e-write-blocked-v7", "decide_route_staff_write_1745500003310", "send_staff_write_blocked_1745500003320", "staff_write_blocked");
addEdge("e-blocked-to-handoff-v8", "send_staff_write_blocked_1745500003320", "handoff_general_1745500018000", "next");
addEdge("e-upload-ok-to-handoff-v8", "send_staff_upload_ok_1745500002800", "handoff_general_1745500018000", "next");
addEdge("e-nomina-ok-to-handoff-v8", "send_staff_nomina_ok_1745500002775", "handoff_general_1745500018000", "next");

const out = path.join(root, "workflow_lifedeportes_sales_inbound_v7_staff.json");
fs.writeFileSync(out, JSON.stringify(v6, null, 2));
console.log("Wrote", out, "nodes:", v6.nodes.length, "edges:", v6.edges.length);
