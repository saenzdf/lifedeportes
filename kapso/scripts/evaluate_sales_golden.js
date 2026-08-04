#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchProduct } from "../functions/lib/product_match_engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "catalog/life_catalog_semantic_v1.json"), "utf8")
);
const dataset = JSON.parse(
  fs.readFileSync(path.join(root, "learning/golden_cases.json"), "utf8")
);

let passed = 0;
const failures = [];
for (const testCase of dataset.cases || []) {
  const quantity = Number(testCase.utterance.match(/\b(\d+)\b/)?.[1] || 0) || undefined;
  const result = matchProduct(
    {
      product_text: testCase.utterance,
      ...(quantity ? { quantity } : {}),
    },
    catalog
  );
  const productOk =
    testCase.expected_product_id === null ||
    result.odoo_template_id === testCase.expected_product_id;
  const garmentOk =
    !testCase.expected_garment_type ||
    result.parsed?.garmentType === testCase.expected_garment_type;
  const questionOk =
    testCase.expected_question === undefined ||
    result.clarifying_question === testCase.expected_question;
  if (productOk && garmentOk && questionOk) {
    passed += 1;
  } else {
    failures.push({
      id: testCase.id,
      expected: {
        product_id: testCase.expected_product_id,
        garment_type: testCase.expected_garment_type,
        question: testCase.expected_question,
      },
      actual: {
        product_id: result.odoo_template_id || null,
        garment_type: result.parsed?.garmentType || null,
        question: result.clarifying_question || null,
      },
    });
  }
}

const total = (dataset.cases || []).length;
console.log(JSON.stringify({ passed, total, accuracy: total ? passed / total : 0, failures }, null, 2));
process.exit(failures.length ? 1 : 0);
