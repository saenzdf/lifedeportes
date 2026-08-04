#!/usr/bin/env node
/**
 * v8: staff post-upload/blocked → handoff (no loop back to staff general).
 * Preserves all node positions from the manually arranged graph.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const v7Path = path.join(root, "workflow_lifedeportes_sales_inbound_v7_staff.json");
const v8Path = path.join(root, "workflow_lifedeportes_sales_inbound_v8_handoff.json");

const graph = JSON.parse(fs.readFileSync(v7Path, "utf8"));
const HANDOFF = "handoff_general_1745500018000";

const retarget = [
  "e-blocked-to-general-v7",
  "e-upload-ok-to-general-v7",
  "e-nomina-ok-to-general-v7",
];

for (const edgeId of retarget) {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (edge) {
    edge.target = HANDOFF;
    edge.label = "next";
  }
}

// Rename edge ids for clarity (optional metadata only)
const rename = {
  "e-blocked-to-general-v7": "e-blocked-to-handoff-v8",
  "e-upload-ok-to-general-v7": "e-upload-ok-to-handoff-v8",
  "e-nomina-ok-to-general-v7": "e-nomina-ok-to-handoff-v8",
};
for (const [oldId, newId] of Object.entries(rename)) {
  const edge = graph.edges.find((e) => e.id === oldId);
  if (edge) edge.id = newId;
}

fs.writeFileSync(v8Path, JSON.stringify(graph, null, 2));
console.log("Wrote", v8Path);
console.log(
  "Staff terminal edges now → handoff:",
  graph.edges.filter((e) => e.target === HANDOFF).map((e) => e.id)
);
