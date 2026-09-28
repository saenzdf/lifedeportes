// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: compute-fidelity-retention  id: 37be9c66-e600-4d40-af99-81003ef7fb39
// ultimo deploy: 2026-08-04T17:25:11-04:00  status: deployed
// motivo: cadena Jump/Inbox retirada
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

/**
 * compute_fidelity_retention — compara snapshot Kapso vs order_draft actual (post-sync Odoo).
 * Invocable como tool o nodo; también usable tras sync-order-draft-from-odoo.
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const snapshot = vars.fidelity?.kapso_snapshot;
  if (!snapshot) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: "Sin fidelity.kapso_snapshot — no hay KPI de retención aún.",
        vars: {
          service: {
            last_call_name: "compute_fidelity_retention",
            last_call_status: "skipped",
            last_call_at: now,
          },
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const currentLines = linesFromOrderDraft(vars.order_draft || {});
  const metrics = computeFidelityRetention(snapshot, currentLines);

  const fidelity = {
    ...(vars.fidelity || {}),
    ...metrics,
    last_compared_at: now,
    last_compare_source: "order_draft",
  };

  return new Response(
    JSON.stringify({
      ok: true,
      message: metrics.pass_clean
        ? `Fidelidad OK — pass_clean (retention ${metrics.retention_pct}%).`
        : `Fidelidad: retention ${metrics.retention_pct}% · ${metrics.lines_changed} línea(s) tocada(s).`,
      metrics,
      vars: {
        fidelity,
        service: {
          last_call_name: "compute_fidelity_retention",
          last_call_status: "ready",
          last_call_at: now,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

function compact(v) {
  if (v == null) return "";
  return String(v).trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeLine(line = {}) {
  return {
    product_variant_id: num(line.product_variant_id || line.odoo_product_id || line.product_id),
    product_text: compact(line.product_text || line.product_base || line.name).toLowerCase(),
    quantity: num(line.quantity),
    unit_cop: num(line.unit_cop || line.price_unit),
    attributes: {
      cuello: compact(line.attributes?.cuello || line.collar).toLowerCase(),
      manga: compact(line.attributes?.manga || line.sleeves).toLowerCase(),
      tela: compact(line.attributes?.tela || line.material).toLowerCase(),
    },
  };
}

function linesFromSnapshot(snapshot) {
  const raw = snapshot?.resolved_lines || snapshot?.rows || snapshot?.commercial_lines || [];
  return (Array.isArray(raw) ? raw : []).map(normalizeLine).filter((l) => l.quantity > 0);
}

function linesFromOrderDraft(orderDraft = {}) {
  const resolved = orderDraft.commercial?.resolved_lines;
  if (Array.isArray(resolved) && resolved.length) {
    return resolved.map(normalizeLine).filter((l) => l.quantity > 0);
  }
  const lines = orderDraft.commercial?.lines;
  if (Array.isArray(lines) && lines.length) {
    return lines.map(normalizeLine).filter((l) => l.quantity > 0);
  }
  return [];
}

function lineKey(line) {
  if (line.product_variant_id) return `id:${line.product_variant_id}`;
  return `t:${line.product_text}|${line.attributes.cuello}|${line.attributes.manga}|${line.attributes.tela}`;
}

function compareLine(a, b) {
  const fields = [];
  let matched = 0;
  let total = 0;
  const checks = [
    ["quantity", a.quantity === b.quantity],
    ["product_variant_id", !a.product_variant_id || a.product_variant_id === b.product_variant_id],
    ["product_text", !a.product_text || a.product_text === b.product_text],
    ["cuello", !a.attributes.cuello || a.attributes.cuello === b.attributes.cuello],
    ["manga", !a.attributes.manga || a.attributes.manga === b.attributes.manga],
    ["tela", !a.attributes.tela || a.attributes.tela === b.attributes.tela],
  ];
  for (const [name, ok] of checks) {
    total += 1;
    if (ok) matched += 1;
    else fields.push(name);
  }
  return { matched, total, fields };
}

function computeFidelityRetention(kapsoSnapshot, currentLinesInput) {
  const kapsoLines = linesFromSnapshot(kapsoSnapshot);
  const currentLines = (Array.isArray(currentLinesInput) ? currentLinesInput : []).map(
    normalizeLine
  );

  if (!kapsoLines.length) {
    return {
      pass_clean: false,
      retention_pct: null,
      correction_burden: null,
      lines_compared: 0,
      lines_changed: 0,
      detail: { reason: "no_kapso_snapshot_lines" },
    };
  }

  const currentByKey = new Map();
  for (const line of currentLines) {
    currentByKey.set(lineKey(line), line);
  }

  let matchedFields = 0;
  let totalFields = 0;
  let linesChanged = 0;
  const detail = [];

  for (const kLine of kapsoLines) {
    const key = lineKey(kLine);
    const cLine = currentByKey.get(key);
    if (!cLine) {
      linesChanged += 1;
      totalFields += 6;
      detail.push({ key, status: "missing_or_replaced", fields: ["line"] });
      continue;
    }
    const cmp = compareLine(kLine, cLine);
    matchedFields += cmp.matched;
    totalFields += cmp.total;
    if (cmp.fields.length) {
      linesChanged += 1;
      detail.push({ key, status: "changed", fields: cmp.fields });
    } else {
      detail.push({ key, status: "same", fields: [] });
    }
  }

  for (const cLine of currentLines) {
    const key = lineKey(cLine);
    if (!kapsoLines.some((k) => lineKey(k) === key)) {
      linesChanged += 1;
      detail.push({ key, status: "added_in_odoo", fields: ["line"] });
    }
  }

  const retention_pct =
    totalFields > 0 ? Math.round((1000 * matchedFields) / totalFields) / 10 : 0;
  const pass_clean = linesChanged === 0 && retention_pct >= 99.9;
  const correction_burden = Math.round(10 * (100 - retention_pct)) / 10;

  return {
    pass_clean,
    retention_pct,
    correction_burden,
    lines_compared: kapsoLines.length,
    lines_changed: linesChanged,
    detail,
  };
}
