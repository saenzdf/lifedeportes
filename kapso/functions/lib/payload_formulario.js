/**
 * Payload Formulario v1 — contrato Kapso → Odoo (ADR 0005).
 * Kapso construye y adjunta; Odoo (o script PoC) llena celdas.
 */

export const PAYLOAD_SCHEMA_VERSION = "formulario_payload_v1";
export const PAYLOAD_ATTACHMENT_NAME = "formulario_payload_v1.json";

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * @param {{ detail?: object, resolvedLines?: array, commercialLines?: array, fingerprint?: string|null, meta?: object }} input
 */
export function buildFormularioPayload(input = {}) {
  const detail = input.detail || {};
  const resolved = Array.isArray(input.resolvedLines) ? input.resolvedLines : [];
  const commercial = Array.isArray(input.commercialLines)
    ? input.commercialLines
    : resolved.map((l) => ({
        product_text: l.product_text || l.product_base,
        quantity: l.quantity,
        product_variant_id: l.product_variant_id,
        category: l.category,
      }));

  const people = Array.isArray(detail.people)
    ? detail.people
    : Array.isArray(detail.rows)
      ? detail.rows.map((r) => ({
          identity: {
            print_name: r.nombre || r.name || r.print_name,
            number: r.numero || r.number,
          },
          color_medias: r.color_medias || r.color_media || "",
          components: [{ size: r.talla || r.size || "", comment: r.comentario || r.comment || "" }],
          product_hint: r.category || r.rol || "",
        }))
      : [];

  const units = people.map((p, i) => {
    const id = p.identity || {};
    const comp = Array.isArray(p.components) ? p.components[0] || {} : {};
    return {
      row: i + 1,
      nombre: compact(id.print_name || id.name || p.nombre),
      numero: compact(id.number || p.numero),
      talla: compact(comp.size || p.talla),
      color_medias: compact(p.color_medias || ""),
      comentario: compact(comp.comment || p.comentario || ""),
      product_hint: compact(p.product_hint || ""),
    };
  });

  const lines = resolved.map((l, i) => ({
    line_id: compact(l.line_id) || `rl_${i + 1}`,
    product_base: compact(l.product_base || l.product_text || l.name),
    product_variant_id: Number(l.product_variant_id || l.odoo_product_id || l.product_id || 0) || null,
    product_tmpl_id: Number(l.product_tmpl_id || 0) || null,
    quantity: Math.max(0, Number(l.quantity || 0)),
    category: compact(l.category) || null,
    confidence: compact(l.confidence) || null,
    principal: {
      cuello: compact(l.attributes?.cuello || ""),
      manga: compact(l.attributes?.manga || l.attributes?.largo_manga || ""),
      genero: compact(l.attributes?.genero || ""),
      deporte: compact(l.attributes?.deporte || l.attributes?.deportes || ""),
    },
    otros: {
      tela: compact(l.attributes?.tela || ""),
      medias: compact(l.attributes?.medias || ""),
      tipo_pantalon: compact(l.attributes?.tipo_pantalon || ""),
      forro: compact(l.attributes?.forro || ""),
    },
    attributes: l.attributes || {},
    comments: compact(l.comments || ""),
  }));

  const personCount = units.length;
  const lineQty = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);

  return {
    schema_version: PAYLOAD_SCHEMA_VERSION,
    built_at: new Date().toISOString(),
    fingerprint: input.fingerprint || null,
    meta: {
      source: input.meta?.source || "kapso",
      parse_status: detail.parse_status || null,
      layout: detail.layout || null,
      ...(input.meta || {}),
    },
    commercial: { lines: commercial },
    lines,
    units,
    totals: {
      person_count: personCount,
      line_qty: lineQty,
      qty_match:
        personCount === 0 && lineQty === 0
          ? null
          : personCount > 0 && lineQty > 0
            ? personCount === lineQty
            : false,
    },
  };
}

export function validateFormularioPayload(payload) {
  const errors = [];
  const warnings = [];
  if (!payload || payload.schema_version !== PAYLOAD_SCHEMA_VERSION) {
    errors.push({ code: "schema", message: "schema_version inválido o ausente" });
  }
  const lines = payload?.lines || [];
  const units = payload?.units || [];
  if (!lines.length) errors.push({ code: "no_lines", message: "Sin líneas comerciales en payload" });
  if (!units.length) warnings.push({ code: "no_units", message: "Sin unidades/personas (Aprobación vacía)" });

  for (const l of lines) {
    if (!l.product_base) errors.push({ code: "no_product_base", message: "Línea sin product_base" });
    if (!l.product_variant_id) {
      warnings.push({
        code: "unresolved_variant",
        message: `Sin variante Odoo: ${l.product_base}`,
      });
    }
    if (Number(l.quantity || 0) <= 0) {
      errors.push({ code: "bad_qty", message: `Cantidad inválida: ${l.product_base}` });
    }
  }

  const totals = payload?.totals || {};
  if (totals.qty_match === false) {
    warnings.push({
      code: "qty_people_vs_lines",
      message: `Personas (${totals.person_count}) != líneas (${totals.line_qty})`,
    });
  }
  if (totals.person_count === 0 && totals.line_qty > 0) {
    warnings.push({
      code: "lines_without_people",
      message: `Qty líneas ${totals.line_qty} sin personas en detalle — no forzar cuadre`,
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    grave: errors.some((e) =>
      ["schema", "no_lines", "bad_qty", "no_product_base"].includes(e.code)
    ),
  };
}

/**
 * Confrontación híbrida (ADR 0006): grave → bloquea; avisos → needs_review.
 *
 * Match clave (primera intención visual): filas con Nombre/Talla sin Producto
 * → suelen faltar líneas en la SO o la expansión Pedido! (SEQUENCE/XLOOKUP) no cubre.
 */
export function confrontPayloadVsSheet(payload, parsedApprovalRows = [], parsedPedidoAttrs = []) {
  const validation = validateFormularioPayload(payload);
  const diffs = [];

  const expectedPeople = (payload?.units || []).length;
  const sheetPeople = (parsedApprovalRows || []).filter((r) => r?.nombre).length;
  if (expectedPeople && sheetPeople && expectedPeople !== sheetPeople) {
    diffs.push({
      code: "people_count",
      severity: "warning",
      message: `Payload personas ${expectedPeople} vs sheet ${sheetPeople}`,
    });
  }

  // Primera intención: nombres/tallas de más vs qty comercial (faltan productos en SO).
  const orphans = (parsedApprovalRows || []).filter((r) => {
    const nombre = compact(r?.nombre || r?.identity?.print_name || "");
    const talla = compact(
      r?.talla || (Array.isArray(r?.components) ? r.components[0]?.size : "") || ""
    );
    const producto = compact(r?.producto || r?.product_base || "");
    const onlyFormula = Boolean(r?.product_formula) && !producto;
    // Solo marcar huérfano si hay valor B vacío explícito (no fórmula sin evaluar).
    return (nombre || talla) && !producto && !onlyFormula && r?.producto === "";
  });
  if (orphans.length) {
    diffs.push({
      code: "names_without_product",
      severity: "warning",
      message: `${orphans.length} fila(s) con nombre/talla sin Producto — revisar líneas SO o plantilla Pedido→Aprobación`,
      count: orphans.length,
      sample: orphans.slice(0, 5).map((r) => compact(r.nombre || r.identity?.print_name)),
    });
  }

  const lineQty = (payload?.lines || []).reduce((s, l) => s + Number(l.quantity || 0), 0);
  if (expectedPeople && lineQty && expectedPeople > lineQty) {
    diffs.push({
      code: "people_exceed_line_qty",
      severity: "warning",
      message: `Personas (${expectedPeople}) > qty líneas (${lineQty}) — faltan productos en el pedido`,
    });
  }
  if (expectedPeople && lineQty && expectedPeople < lineQty) {
    diffs.push({
      code: "people_short_of_line_qty",
      severity: "warning",
      message: `Personas (${expectedPeople}) < qty líneas (${lineQty}) — faltan nombres/tallas en Formulario o sobran productos en SO`,
    });
  }
  if (!expectedPeople && lineQty > 0) {
    diffs.push({
      code: "lines_without_people",
      severity: "warning",
      message: `SO tiene qty ${lineQty} pero Formulario/payload sin personas — no forzar cuadre; revisar parse Excel/OCR/lista`,
    });
  }
  if (sheetPeople && lineQty && sheetPeople > lineQty) {
    diffs.push({
      code: "names_without_product",
      severity: "warning",
      message: `${sheetPeople - lineQty} nombre(s) de más en Aprobación vs qty SO (${lineQty}) — primera intención: faltan productos`,
      count: sheetPeople - lineQty,
    });
  }
  if (sheetPeople && lineQty && sheetPeople < lineQty) {
    diffs.push({
      code: "sheet_people_short_of_line_qty",
      severity: "warning",
      message: `Aprobación ${sheetPeople} personas < qty SO ${lineQty} — lista incompleta o parse falló`,
    });
  }

  const expectedBases = (payload?.lines || []).map((l) => compact(l.product_base).toLowerCase()).filter(Boolean);
  const sheetBases = (parsedPedidoAttrs || [])
    .map((r) => compact(r.product_base).toLowerCase())
    .filter(Boolean);
  for (const b of expectedBases) {
    if (sheetBases.length && !sheetBases.includes(b)) {
      diffs.push({
        code: "missing_product_base",
        severity: "warning",
        message: `Producto base no visto en sheet attrs: ${b}`,
      });
    }
  }

  const grave =
    validation.grave ||
    diffs.some((d) => d.severity === "error") ||
    validation.errors.some((e) => e.code === "no_lines");

  return {
    ok: !grave,
    grave,
    needs_review: Boolean(validation.warnings.length || diffs.length),
    validation,
    diffs,
    summary: grave
      ? `Confrontación GRAVE: ${(validation.errors[0] || diffs[0])?.message || "error"}`
      : validation.warnings.length || diffs.length
        ? `Confrontación con avisos (${validation.warnings.length + diffs.length})`
        : "Confrontación OK",
  };
}

/** Convierte payload → shape que consume applyLifeFormularioFill. */
export function payloadToFillInput(payload) {
  const units = payload?.units || [];
  const people = units.map((u) => ({
    identity: { print_name: u.nombre, number: u.numero },
    color_medias: u.color_medias || "",
    components: [{ size: u.talla || "", comment: u.comentario || "" }],
    product_hint: u.product_hint || "",
  }));
  const resolvedLines = (payload?.lines || []).map((l) => ({
    line_id: l.line_id,
    product_base: l.product_base,
    product_text: l.product_base,
    product_variant_id: l.product_variant_id,
    product_tmpl_id: l.product_tmpl_id,
    quantity: l.quantity,
    category: l.category,
    confidence: l.confidence,
    attributes: {
      ...(l.attributes || {}),
      ...l.principal,
      ...l.otros,
    },
    comments: l.comments || "",
  }));
  return {
    detail: {
      people,
      parse_status: payload?.meta?.parse_status,
      layout: payload?.meta?.layout,
    },
    resolvedLines,
  };
}
