/**
 * Tiers de relación y TTL de memoria comercial (prospectos fríos).
 * Plan: kapso/docs/client_profile_tags_plan.md
 */

export const DEFAULT_MEMORY_TTL_DAYS = 14;
export const CONFIRMED_OPP_WINDOW_DAYS = 30;

export function memoryTtlDays(env = {}) {
  const n = Number(env.LIFE_MEMORY_TTL_DAYS ?? DEFAULT_MEMORY_TTL_DAYS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MEMORY_TTL_DAYS;
}

export function daysSince(isoOrDate) {
  if (!isoOrDate) return Infinity;
  const t = Date.parse(String(isoOrDate));
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 86400000;
}

function maxIso(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export function parseKeepMemoryFlag(partnerComment) {
  return /kapso:keep_memory/i.test(String(partnerComment || ""));
}

/**
 * @param {object} input
 * @param {boolean} input.hasSaleDoneEver
 * @param {boolean} input.hasActiveOrderOrProject
 * @param {boolean} input.hasRecentConfirmedOpp
 * @param {string|null} input.lastCommercialActivityAt ISO
 * @param {number|null} input.partnerId
 * @param {boolean} input.keepMemory
 * @param {number} input.ttlDays
 */
export function computeRelationshipTier(input = {}) {
  const ttlDays = input.ttlDays ?? DEFAULT_MEMORY_TTL_DAYS;
  const {
    hasSaleDoneEver = false,
    hasActiveOrderOrProject = false,
    hasRecentConfirmedOpp = false,
    lastCommercialActivityAt = null,
    partnerId = null,
    keepMemory = false,
  } = input;

  if (keepMemory) {
    return buildProfile("customer", "full", { memory_expired: false, ttlDays });
  }
  if (hasSaleDoneEver || hasActiveOrderOrProject) {
    return buildProfile("customer", "full", { memory_expired: false, ttlDays });
  }
  if (hasRecentConfirmedOpp) {
    return buildProfile("warm_prospect", "quote", { memory_expired: false, ttlDays });
  }
  if (!partnerId) {
    return buildProfile("anonymous", "none", { memory_expired: false, ttlDays });
  }

  const idleDays = daysSince(lastCommercialActivityAt);
  if (!lastCommercialActivityAt || idleDays > ttlDays) {
    return buildProfile("cold_prospect", "none", {
      memory_expired: true,
      ttlDays,
      memory_ttl_days: 0,
    });
  }

  return buildProfile("warm_prospect", "quote", {
    memory_expired: false,
    ttlDays,
    memory_ttl_days: Math.max(0, Math.ceil(ttlDays - idleDays)),
  });
}

function buildProfile(tier, memory_scope, extra = {}) {
  const memory_expired = Boolean(extra.memory_expired);
  const primary_tag =
    tier === "customer"
      ? "returning_with_memory"
      : tier === "warm_prospect"
        ? "warm_prospect"
        : tier === "cold_prospect"
          ? "new_prospect"
          : "new_prospect";

  return {
    relationship_tier: tier,
    memory_scope,
    memory_expired,
    memory_ttl_days:
      extra.memory_ttl_days ??
      (tier === "warm_prospect" ? extra.ttlDays ?? DEFAULT_MEMORY_TTL_DAYS : 0),
    primary_tag,
    secondary_tags: memory_expired ? ["memory_expired"] : [],
    playbook_id:
      tier === "customer"
        ? "sales_default"
        : tier === "cold_prospect" || tier === "anonymous"
          ? "sales_default"
          : "sales_default",
    policy: {
      greet_as_returning: tier === "customer",
      forbid_restart_from_zero: tier === "customer" || tier === "warm_prospect",
      skip_hydrate: memory_expired || tier === "cold_prospect",
    },
  };
}

/** Señales Odoo para tier (reusa filas ya leídas en classify). */
export function commercialSignalsFromOdooRows({
  orders = [],
  projectTasks = [],
  opportunities = [],
  partnerComment = "",
  confirmedOppWindowDays = CONFIRMED_OPP_WINDOW_DAYS,
} = {}) {
  const hasSaleDoneEver = (orders || []).some((o) =>
    ["sale", "done"].includes(String(o.state || ""))
  );
  const hasActiveOrder = (orders || []).some((o) =>
    ["draft", "sent", "sale"].includes(String(o.state || ""))
  );
  const hasActiveProject = (projectTasks || []).length > 0;
  const hasActiveOrderOrProject = hasActiveOrder || hasActiveProject;

  let hasRecentConfirmedOpp = false;
  let lastCommercialActivityAt = null;

  for (const opp of opportunities || []) {
    const desc = String(opp.description || "");
    const writeDate = opp.write_date || opp.create_date || null;
    const confirmed =
      /\binteres_confirmado\b/i.test(desc) ||
      /quote[\s\S]{0,120}status[\s\S]{0,40}interes/i.test(desc);
    if (confirmed && daysSince(writeDate) <= confirmedOppWindowDays) {
      hasRecentConfirmedOpp = true;
    }
    const useful =
      /LIFE_DOSSIER_v1/i.test(desc) ||
      /\bcotizando\b/i.test(desc) ||
      /\binteres_confirmado\b/i.test(desc);
    if (useful) lastCommercialActivityAt = maxIso(lastCommercialActivityAt, writeDate);
  }

  for (const order of orders || []) {
    const state = String(order.state || "");
    if (["draft", "sent", "sale", "done"].includes(state)) {
      lastCommercialActivityAt = maxIso(
        lastCommercialActivityAt,
        order.write_date || order.date_order || null
      );
    }
  }

  for (const task of projectTasks || []) {
    lastCommercialActivityAt = maxIso(lastCommercialActivityAt, task.write_date || null);
  }

  return {
    hasSaleDoneEver,
    hasActiveOrderOrProject,
    hasRecentConfirmedOpp,
    lastCommercialActivityAt,
    keepMemory: parseKeepMemoryFlag(partnerComment),
  };
}

export function shouldLoadCommercialMemory(profile) {
  if (!profile) return true;
  if (profile.memory_expired) return false;
  if (profile.relationship_tier === "cold_prospect") return false;
  if (profile.policy?.skip_hydrate) return false;
  return profile.memory_scope !== "none" || profile.relationship_tier === "anonymous";
}
