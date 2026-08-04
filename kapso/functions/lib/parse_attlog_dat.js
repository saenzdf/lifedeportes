/**
 * Parser attlog.dat (ZKTeco / reloj ingreso-salida).
 * Formato por línea (tab-separated):
 *   PIN  DateTime  Verified  Status  WorkCode  Reserved
 * Status: 0 = entrada, 1 = salida (convención ZKTeco).
 */

import { employeeDisplayName, lookupEmployee } from "./nomina_employee_codes.js";

const ATTLOG_LINE =
  /^\s*(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/;

function parseTimestamp(dateStr, timeStr) {
  const iso = `${dateStr}T${timeStr}`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function formatTime(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function hoursBetween(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.round(((endMs - startMs) / 3_600_000) * 100) / 100;
}

function extractDeviceId(filename) {
  const base = String(filename || "").split("/").pop() || "";
  const m = base.match(/^([A-Z0-9]+)_attlog\.dat$/i);
  return m ? m[1] : base.replace(/\.dat$/i, "") || null;
}

export function parseAttlogLines(text) {
  const rows = [];
  const lines = String(text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = line.match(ATTLOG_LINE);
    if (!m) {
      rows.push({ line: i + 1, raw: line, error: "formato_invalido" });
      continue;
    }
    const [, pin, date, time, verified, status, workCode, reserved] = m;
    rows.push({
      line: i + 1,
      pin,
      date,
      time,
      datetime: `${date} ${time}`,
      timestamp_ms: parseTimestamp(date, time),
      verified: Number(verified),
      status: Number(status),
      status_label: Number(status) === 1 ? "salida" : "entrada",
      work_code: Number(workCode),
      reserved: Number(reserved),
    });
  }
  return rows;
}

function groupByPinAndDate(events) {
  const map = new Map();
  for (const ev of events) {
    if (ev.error) continue;
    const key = `${ev.pin}|${ev.date}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(ev);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  }
  return map;
}

function summarizeDay(events) {
  const entradas = events.filter((e) => e.status === 0);
  const salidas = events.filter((e) => e.status === 1);
  const flags = [];

  let entradaEv = entradas[0] || null;
  let salidaEv = salidas.length ? salidas[salidas.length - 1] : null;

  // Relojes ZKTeco a veces marcan salida también como status 0: usar heurística horaria.
  if (!salidaEv && events.length >= 2) {
    const last = events[events.length - 1];
    const first = events[0];
    if (last.timestamp_ms > first.timestamp_ms + 2 * 3_600_000) {
      salidaEv = last;
      if (last.status === 0) flags.push("salida_heuristica");
    }
  }

  if (!entradaEv && salidaEv) flags.push("sin_entrada");
  if (entradaEv && !salidaEv) flags.push("sin_salida");
  if (entradas.length > 1) flags.push("multiples_entradas");
  if (salidas.length > 1) flags.push("multiples_salidas");

  let hours = null;
  if (entradaEv && salidaEv && entradaEv !== salidaEv) {
    hours = hoursBetween(entradaEv.timestamp_ms, salidaEv.timestamp_ms);
    if (hours !== null && hours > 16) flags.push("jornada_larga");
    if (hours !== null && hours < 1) flags.push("jornada_corta");
  }

  return {
    date: events[0]?.date,
    entrada: entradaEv ? entradaEv.time.slice(0, 8) : null,
    salida: salidaEv ? salidaEv.time.slice(0, 8) : null,
    hours,
    punch_count: events.length,
    flags,
    punches: events.map((e) => ({
      time: e.time.slice(0, 8),
      type: e.status_label,
    })),
  };
}

export function buildNominaDraftFromAttlog(text, options = {}) {
  const filename = options.filename || options.source_file || "attlog.dat";
  const parsed = parseAttlogLines(text);
  const valid = parsed.filter((r) => !r.error);
  const parseErrors = parsed.filter((r) => r.error);

  if (!valid.length) {
    return {
      ok: false,
      error: "archivo_vacio_o_invalido",
      parse_errors: parseErrors,
    };
  }

  const dates = valid.map((e) => e.date).sort();
  const period = {
    from: dates[0],
    to: dates[dates.length - 1],
  };

  const byPin = new Map();
  for (const ev of valid) {
    if (!byPin.has(ev.pin)) byPin.set(ev.pin, []);
    byPin.get(ev.pin).push(ev);
  }

  const warnings = [];
  if (parseErrors.length) {
    warnings.push({
      code: "lineas_invalidas",
      count: parseErrors.length,
      message: `${parseErrors.length} línea(s) no parseadas`,
    });
  }

  const employees = [];
  for (const [pin, events] of [...byPin.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const lookup = lookupEmployee(pin);
    if (!lookup.in_catalog) {
      warnings.push({
        code: "pin_sin_catalogo",
        pin,
        message: `PIN ${pin} no está en catálogo de empleadas`,
      });
    } else if (!lookup.name) {
      warnings.push({
        code: "pin_sin_nombre",
        pin,
        message: `PIN ${pin} está en catálogo pero falta el nombre`,
      });
    }
    const name = lookup.name;

    const dayGroups = groupByPinAndDate(events);
    const days = [...dayGroups.values()]
      .map(summarizeDay)
      .sort((a, b) => a.date.localeCompare(b.date));

    let totalHours = 0;
    let daysWithHours = 0;
    for (const d of days) {
      if (typeof d.hours === "number") {
        totalHours += d.hours;
        daysWithHours++;
      }
    }

    employees.push({
      pin,
      name: name || null,
      odoo_employee_id: lookup.odoo_employee_id || null,
      odoo_credential_field: "barcode",
      display_name: employeeDisplayName(pin),
      days,
      totals: {
        days_in_file: days.length,
        days_with_hours: daysWithHours,
        hours: Math.round(totalHours * 100) / 100,
        missing_salida: days.filter((d) => d.flags.includes("sin_salida")).length,
        missing_entrada: days.filter((d) => d.flags.includes("sin_entrada")).length,
      },
    });
  }

  return {
    ok: true,
    nomina_draft: {
      status: "pending_confirmation",
      confirmed: false,
      period,
      source: {
        file: filename,
        device_id: extractDeviceId(filename),
        format: "zkteco_attlog",
        record_count: valid.length,
        uploaded_at: options.uploaded_at || new Date().toISOString(),
        uploaded_by: options.uploaded_by || null,
      },
      employees,
      warnings,
      summary_text: buildSummaryText({ period, employees, warnings, filename }),
      summary_html: buildSummaryHtml({ period, employees, warnings, filename }),
    },
    parse_errors: parseErrors,
  };
}

function buildSummaryText({ period, employees, warnings, filename }) {
  const lines = [
    `Nómina por confirmar — ${period.from} a ${period.to}`,
    `Archivo: ${filename}`,
    "",
  ];
  for (const emp of employees) {
    lines.push(
      `${emp.display_name}: ${emp.totals.days_with_hours} días · ${emp.totals.hours} h` +
        (emp.totals.missing_salida ? ` · ${emp.totals.missing_salida} sin salida` : "")
    );
  }
  if (warnings.length) {
    lines.push("", "Alertas:");
    for (const w of warnings) lines.push(`- ${w.message}`);
  }
  lines.push("", "Responda CONFIRMO NOMINA para registrar (fase 2 Odoo HR).");
  return lines.join("\n");
}

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildSummaryHtml({ period, employees, warnings, filename }) {
  const rows = employees
    .flatMap((emp) =>
      emp.days.map((d) => ({
        pin: emp.pin,
        name: emp.display_name,
        ...d,
      }))
    )
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.pin) - Number(b.pin));

  const bodyRows = rows
    .map((r, idx) => {
      const bg = idx % 2 ? ' style="background-color:#f9f9f9;"' : "";
      const flags = r.flags.length ? r.flags.join(", ") : "—";
      const hours = r.hours != null ? String(r.hours) : "—";
      return `<tr${bg}><td style="padding:6px;">${escapeHtml(r.date)}</td><td style="padding:6px;">${escapeHtml(r.pin)}</td><td style="padding:6px;">${escapeHtml(r.name)}</td><td style="padding:6px;text-align:center;">${escapeHtml(r.entrada || "—")}</td><td style="padding:6px;text-align:center;">${escapeHtml(r.salida || "—")}</td><td style="padding:6px;text-align:center;">${hours}</td><td style="padding:6px;font-size:12px;">${escapeHtml(flags)}</td></tr>`;
    })
    .join("\n");

  const warnBlock = warnings.length
    ? `<h2>Alertas</h2><ul>${warnings.map((w) => `<li>${escapeHtml(w.message)}</li>`).join("")}</ul>`
    : "";

  const totals = employees
    .map(
      (e) =>
        `<li><strong>${escapeHtml(e.display_name)}</strong>: ${e.totals.days_with_hours} días · ${e.totals.hours} h</li>`
    )
    .join("\n");

  return `<h1>Nómina por confirmar</h1>
<p><strong>Periodo:</strong> ${escapeHtml(period.from)} → ${escapeHtml(period.to)}<br>
<strong>Archivo:</strong> ${escapeHtml(filename)}</p>
<h2>Resumen por empleada</h2>
<ul>${totals}</ul>
<hr>
<h2>Detalle diario</h2>
<table border="1" cellpadding="4" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px;">
<thead><tr style="background:#f2f2f2;">
<th>Fecha</th><th>PIN</th><th>Nombre</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Notas</th>
</tr></thead>
<tbody>
${bodyRows}
</tbody>
</table>
${warnBlock}
<p><em>Estado: pendiente de confirmación por Javier.</em></p>`;
}

export { formatTime, hoursBetween, extractDeviceId };
