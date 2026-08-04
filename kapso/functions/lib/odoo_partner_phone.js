/**
 * Búsqueda de res.partner por teléfono WhatsApp (Odoo 19 prod).
 * Usar phone_sanitized / phone_mobile_search; phone visible suele tener espacios.
 */

export function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeWaPhone(raw) {
  const digits = digitsOnly(raw);
  if (!digits) {
    return { e164Plus: null, e164Digits: null, local10: null, raw: String(raw ?? "").trim() };
  }

  let national = digits;
  if (digits.startsWith("57") && digits.length >= 12) {
    national = digits.slice(-10);
  } else if (digits.length >= 10) {
    national = digits.slice(-10);
  } else {
    return { e164Plus: null, e164Digits: null, local10: null, raw: String(raw ?? "").trim() };
  }

  return {
    e164Plus: `+57${national}`,
    e164Digits: `57${national}`,
    local10: national,
    raw: String(raw ?? "").trim(),
  };
}

const ACTIVE_PARTNER = ["active", "=", true];

export function partnerSearchDomains(normalized) {
  if (!normalized?.e164Plus) return [];
  const { e164Plus, e164Digits, local10 } = normalized;
  return [
    { strategy: "phone_sanitized", domain: [ACTIVE_PARTNER, ["phone_sanitized", "=", e164Plus]] },
    { strategy: "phone_mobile_search_plus", domain: [ACTIVE_PARTNER, ["phone_mobile_search", "=", e164Plus]] },
    { strategy: "phone_mobile_search_digits", domain: [ACTIVE_PARTNER, ["phone_mobile_search", "=", e164Digits]] },
    { strategy: "phone_exact_digits", domain: [ACTIVE_PARTNER, ["phone", "=", e164Digits]] },
    { strategy: "phone_ilike_local10", domain: [ACTIVE_PARTNER, ["phone", "ilike", local10]] },
  ];
}

export function mergePartnerCandidates(existing, rows) {
  const seen = new Set(existing.map((row) => row.id));
  const merged = [...existing];
  for (const row of rows || []) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

export function pickPartnerByLatestOrder(candidates, orders) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const orderList = Array.isArray(orders) ? orders : [];
  for (const order of orderList) {
    const partnerId = Array.isArray(order?.partner_id) ? order.partner_id[0] : order?.partner_id;
    const hit = candidates.find((candidate) => candidate.id === partnerId);
    if (hit) return hit;
  }

  return [...candidates].sort((a, b) => a.id - b.id)[0];
}

/**
 * @param {(model: string, method: string, args: unknown[], kw?: object) => Promise<unknown>} executeKw
 */
export async function findPartnerByWaPhone(executeKw, rawPhone, options = {}) {
  const normalized = normalizeWaPhone(rawPhone);
  if (!normalized.e164Plus) {
    return {
      partner: null,
      normalized,
      match_strategy: null,
      ambiguous: false,
      candidates: [],
    };
  }

  const fields = options.fields || ["id", "name", "phone", "phone_sanitized"];
  let candidates = [];
  let match_strategy = null;

  for (const { strategy, domain } of partnerSearchDomains(normalized)) {
    const rows = await executeKw("res.partner", "search_read", [domain], {
      fields,
      limit: options.limit || 10,
    });
    const before = candidates.length;
    candidates = mergePartnerCandidates(candidates, rows);
    if (candidates.length === 1 && before === 0) {
      match_strategy = strategy;
      return {
        partner: candidates[0],
        normalized,
        match_strategy,
        ambiguous: false,
        candidates: summarizeCandidates(candidates),
      };
    }
    if (candidates.length > 0 && !match_strategy) {
      match_strategy = strategy;
    }
  }

  if (candidates.length === 0) {
    return {
      partner: null,
      normalized,
      match_strategy: null,
      ambiguous: false,
      candidates: [],
    };
  }

  if (candidates.length === 1) {
    return {
      partner: candidates[0],
      normalized,
      match_strategy,
      ambiguous: false,
      candidates: summarizeCandidates(candidates),
    };
  }

  const ids = candidates.map((candidate) => candidate.id);
  const saleOrders = await executeKw(
    "sale.order",
    "search_read",
    [[["partner_id", "in", ids]]],
    {
      fields: ["id", "name", "partner_id", "date_order", "state"],
      order: "date_order desc, id desc",
      limit: 50,
    }
  );

  const partner = pickPartnerByLatestOrder(candidates, saleOrders);
  return {
    partner,
    normalized,
    match_strategy: "disambiguate_latest_order",
    ambiguous: true,
    candidates: summarizeCandidates(candidates),
    chosen_partner_id: partner?.id || null,
  };
}

function summarizeCandidates(candidates) {
  return (candidates || []).map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    phone: candidate.phone || null,
    phone_sanitized: candidate.phone_sanitized || null,
  }));
}

export function partnerCreateVals(displayName, normalized, extra = {}) {
  return {
    name: displayName,
    phone: normalized?.e164Plus || false,
    comment: extra.comment || false,
  };
}

function nameSearchTerms(rawName) {
  const name = String(rawName ?? "").trim();
  if (!name) return [];
  const terms = [name];
  const preseas = name.match(/preseas\s*#?\s*(\d+)/i);
  if (preseas) {
    terms.push(`PRESEAS ${preseas[1]}`);
    terms.push(`PRESEAS #${preseas[1]}`);
    terms.push("PRESEAS");
  }
  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
}

/**
 * @param {(model: string, method: string, args: unknown[], kw?: object) => Promise<unknown>} executeKw
 */
export async function findPartnerByName(executeKw, rawName, options = {}) {
  const terms = nameSearchTerms(rawName);
  if (!terms.length) {
    return {
      partner: null,
      match_strategy: null,
      ambiguous: false,
      candidates: [],
    };
  }

  const fields = options.fields || ["id", "name", "phone", "phone_sanitized"];
  let candidates = [];
  let match_strategy = null;

  for (const term of terms) {
    const rows = await executeKw(
      "res.partner",
      "search_read",
      [[ACTIVE_PARTNER, ["name", "ilike", term]]],
      { fields, limit: options.limit || 10 }
    );
    const before = candidates.length;
    candidates = mergePartnerCandidates(candidates, rows);
    if (candidates.length === 1 && before === 0) {
      match_strategy = `name_ilike:${term}`;
      return {
        partner: candidates[0],
        match_strategy,
        ambiguous: false,
        candidates: summarizeCandidates(candidates),
      };
    }
    if (candidates.length > 0 && !match_strategy) {
      match_strategy = `name_ilike:${term}`;
    }
  }

  if (candidates.length === 0) {
    return {
      partner: null,
      match_strategy: null,
      ambiguous: false,
      candidates: [],
    };
  }

  if (candidates.length === 1) {
    return {
      partner: candidates[0],
      match_strategy,
      ambiguous: false,
      candidates: summarizeCandidates(candidates),
    };
  }

  const ids = candidates.map((candidate) => candidate.id);
  const saleOrders = await executeKw(
    "sale.order",
    "search_read",
    [[["partner_id", "in", ids]]],
    {
      fields: ["id", "name", "partner_id", "date_order", "state"],
      order: "date_order desc, id desc",
      limit: 50,
    }
  );

  const partner = pickPartnerByLatestOrder(candidates, saleOrders);
  return {
    partner,
    match_strategy: "disambiguate_latest_order_by_name",
    ambiguous: true,
    candidates: summarizeCandidates(candidates),
    chosen_partner_id: partner?.id || null,
  };
}
