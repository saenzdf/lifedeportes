/**
 * Asignación de asesor a nivel contacto (res.partner), no oportunidad archivada.
 * Fuente de verdad: comment del partner (teléfono + BSUID WhatsApp).
 */

const ADVISOR_NAMES = new Set(["Paola", "Javier"]);

export function parseAdvisorFromText(text) {
  const src = String(text || "");
  const meta = src.match(/<!--\s*kapso:advisor=([^>\s]+)/i);
  if (meta && ADVISOR_NAMES.has(capitalizeAdvisor(meta[1]))) {
    const name = capitalizeAdvisor(meta[1]);
    const phoneMeta = src.match(/kapso:advisor_phone=(\d+)/i);
    return {
      name,
      phone_e164: phoneMeta ? phoneMeta[1] : phoneForAdvisorName(name),
    };
  }
  const html = src.match(/Asignado a:\s*(Paola|Javier)/i);
  if (html) {
    const name = capitalizeAdvisor(html[1]);
    return { name, phone_e164: phoneForAdvisorName(name) };
  }
  return null;
}

function capitalizeAdvisor(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

export function phoneForAdvisorName(name) {
  return name === "Paola" ? "573213988464" : name === "Javier" ? "573103362484" : null;
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function local10(value) {
  const d = String(value ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

export function buildPartnerAdvisorComment(existingComment, { name, phone_e164, wa_digits, bsuid }) {
  const advisorName = capitalizeAdvisor(name);
  if (!advisorName) return String(existingComment || "").trim();

  let base = String(existingComment || "")
    .replace(/<!--\s*kapso:advisor[\s\S]*?-->/gi, "")
    .replace(/<p>\s*<b>\s*Asignado a:\s*(Paola|Javier)\s*<\/b>\s*<\/p>/gi, "")
    .trim();

  const meta = [
    `kapso:advisor=${advisorName}`,
    phone_e164 ? `advisor_phone=${digitsOnly(phone_e164)}` : "",
    wa_digits ? `wa=${local10(wa_digits)}` : "",
    bsuid ? `bsuid=${compact(bsuid)}` : "",
    `at=${new Date().toISOString().slice(0, 10)}`,
  ]
    .filter(Boolean)
    .join(" ");

  const block = `<!-- ${meta} -->\n<p><b>Asignado a: ${advisorName}</b></p>`;
  return base ? `${base}\n\n${block}`.trim() : block;
}

function digitsOnly(v) {
  return String(v ?? "").replace(/\D/g, "");
}

export async function findPartnerByContact(executeKw, { phone, bsuid }) {
  const local = local10(phone);
  if (local.length >= 7) {
    const rows =
      (await executeKw(
        "res.partner",
        "search_read",
        [[["phone", "ilike", local]]],
        { fields: ["id", "name", "phone", "comment"], limit: 5 }
      )) || [];
    if (rows[0]?.id) return rows[0];
  }
  if (compact(bsuid)) {
    const rows =
      (await executeKw(
        "res.partner",
        "search_read",
        [[["comment", "ilike", compact(bsuid)]]],
        { fields: ["id", "name", "phone", "comment"], limit: 3 }
      )) || [];
    if (rows[0]?.id) return rows[0];
  }
  return null;
}

export async function readContactAdvisor(executeKw, { partnerId, phone, bsuid }) {
  let partner = null;
  if (partnerId) {
    const rows =
      (await executeKw(
        "res.partner",
        "search_read",
        [[["id", "=", partnerId]]],
        { fields: ["id", "comment", "phone"], limit: 1 }
      )) || [];
    partner = rows[0] || null;
  } else {
    partner = await findPartnerByContact(executeKw, { phone, bsuid });
  }
  if (!partner?.id) return { partner_id: null, advisor: null };
  return { partner_id: partner.id, advisor: parseAdvisorFromText(partner.comment) };
}

/** Una sola vez: copiar asesor del lead ACTIVO más reciente (no opp archivada antigua). */
export async function bootstrapAdvisorOnPartner(executeKw, partnerId, parseLeadAssignee) {
  if (!partnerId) return null;
  const existing = await readContactAdvisor(executeKw, { partnerId });
  if (existing.advisor?.name) return existing.advisor;

  const leads =
    (await executeKw(
      "crm.lead",
      "search_read",
      [
        [
          ["partner_id", "=", partnerId],
          ["type", "=", "opportunity"],
          ["active", "=", true],
        ],
      ],
      {
        fields: ["id", "description", "active"],
        order: "id desc",
        limit: 5,
      }
    )) || [];

  for (const lead of leads) {
    const name = parseLeadAssignee(lead.description);
    if (!name) continue;
    const phone_e164 = phoneForAdvisorName(name);
    const comment = buildPartnerAdvisorComment("", {
      name,
      phone_e164,
    });
    await executeKw("res.partner", "write", [[partnerId], { comment }]);
    return { name, phone_e164, bootstrapped_from_lead: lead.id };
  }
  return null;
}

export async function writeContactAdvisor(executeKw, partnerId, payload) {
  if (!partnerId) return { ok: false, reason: "missing_partner" };
  const rows =
    (await executeKw(
      "res.partner",
      "search_read",
      [[["id", "=", partnerId]]],
      { fields: ["comment"], limit: 1 }
    )) || [];
  const comment = buildPartnerAdvisorComment(rows[0]?.comment || "", payload);
  await executeKw("res.partner", "write", [[partnerId], { comment }]);
  return { ok: true, partner_id: partnerId };
}
