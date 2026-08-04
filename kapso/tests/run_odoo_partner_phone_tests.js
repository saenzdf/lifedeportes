#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  normalizeWaPhone,
  partnerSearchDomains,
  pickPartnerByLatestOrder,
  mergePartnerCandidates,
} from "../functions/lib/odoo_partner_phone.js";

function ok(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`);
  console.log(`✓ ${name}`);
}

ok("normalize wa_id", normalizeWaPhone("3000000029").e164Plus === "3000000029");
ok("normalize spaced odoo phone", normalizeWaPhone("3000000029").e164Digits === "3000000029");
ok("normalize empty", normalizeWaPhone("").e164Plus === null);

const domains = partnerSearchDomains(normalizeWaPhone("3000000029"));
ok("domains prefer sanitized", domains[0].strategy === "phone_sanitized");
ok("domains count", domains.length === 5);

const candidates = [
  { id: 3317, name: "GUARUMO" },
  { id: 3458, name: "GUARUMO 2" },
];
const orders = [
  { id: 99, partner_id: [3458, "GUARUMO 2"], date_order: "2026-06-01" },
  { id: 50, partner_id: [3317, "GUARUMO"], date_order: "2025-01-01" },
];
ok(
  "disambiguate latest order",
  pickPartnerByLatestOrder(candidates, orders).id === 3458
);

ok(
  "merge candidates",
  mergePartnerCandidates([{ id: 1 }], [{ id: 1 }, { id: 2 }]).length === 2
);

console.log("\nAll partner phone tests passed");
