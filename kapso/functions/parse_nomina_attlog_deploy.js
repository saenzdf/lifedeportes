/**
 * PIN del reloj ZKTeco → nombre / Odoo hr.employee.
 * PIN = hr.employee.barcode (Badge ID / credencial).
 * Generado desde kapso/config/attlog_employee_map.json — no editar a mano.
 * Regenerar: node kapso/scripts/sync_nomina_employee_codes.js
 */
const LIFE_ATTENDANCE_EMPLOYEES = {
  "4": "Jesus",
  "5": "Laura Alejandra",
  "6": "Yesica",
  "8": "Laura Gomez",
  "9": "Natalia",
  "10": "Valentina",
  "11": "Lorena",
  "15": "Tatiana",
  "16": "Milvany",
};

/** PIN reloj → hr.employee.id Odoo (null si no hay match). */
const LIFE_ATTENDANCE_ODOO_IDS = {
  "4": 12,
  "5": 16,
  "6": 6,
  "8": 15,
  "9": 10,
  "10": 13,
  "11": 5,
  "15": 7,
  "16": 4,
};

function lookupEmployee(pin) {
  const key = String(pin ?? "").trim();
  if (!key) return { pin: key, in_catalog: false, name: null, odoo_employee_id: null };
  if (!(key in LIFE_ATTENDANCE_EMPLOYEES)) {
    return { pin: key, in_catalog: false, name: null, odoo_employee_id: null };
  }
  const odooId = LIFE_ATTENDANCE_ODOO_IDS[key];
  return {
    pin: key,
    in_catalog: true,
    name: LIFE_ATTENDANCE_EMPLOYEES[key],
    odoo_employee_id: odooId == null ? null : Number(odooId),
  };
}

function resolveEmployeeName(pin) {
  return lookupEmployee(pin).name;
}

function employeeDisplayName(pin) {
  const { name, in_catalog, odoo_employee_id } = lookupEmployee(pin);
  if (name) {
    return odoo_employee_id ? `${name} (Odoo #${odoo_employee_id})` : name;
  }
  if (in_catalog) return `PIN ${pin} (nombre pendiente)`;
  return `PIN ${pin} (sin catálogo)`;
}


/**
 * Parser attlog.dat (ZKTeco / reloj ingreso-salida).
 * Formato por línea (tab-separated):
 *   PIN  DateTime  Verified  Status  WorkCode  Reserved
 * Status: 0 = entrada, 1 = salida (convención ZKTeco).
 */


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

function parseAttlogLines(text) {
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

function buildNominaDraftFromAttlog(text, options = {}) {
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

{ formatTime, hoursBetween, extractDeviceId };


/**
 * PIN del reloj ZKTeco → nombre / Odoo hr.employee.
 * PIN = hr.employee.barcode (Badge ID / credencial).
 * Generado desde kapso/config/attlog_employee_map.json — no editar a mano.
 * Regenerar: node kapso/scripts/sync_nomina_employee_codes.js
 */
const LIFE_ATTENDANCE_EMPLOYEES = {
  "4": "Jesus",
  "5": "Laura Alejandra",
  "6": "Yesica",
  "8": "Laura Gomez",
  "9": "Natalia",
  "10": "Valentina",
  "11": "Lorena",
  "15": "Tatiana",
  "16": "Milvany",
};

/** PIN reloj → hr.employee.id Odoo (null si no hay match). */
const LIFE_ATTENDANCE_ODOO_IDS = {
  "4": 12,
  "5": 16,
  "6": 6,
  "8": 15,
  "9": 10,
  "10": 13,
  "11": 5,
  "15": 7,
  "16": 4,
};

function lookupEmployee(pin) {
  const key = String(pin ?? "").trim();
  if (!key) return { pin: key, in_catalog: false, name: null, odoo_employee_id: null };
  if (!(key in LIFE_ATTENDANCE_EMPLOYEES)) {
    return { pin: key, in_catalog: false, name: null, odoo_employee_id: null };
  }
  const odooId = LIFE_ATTENDANCE_ODOO_IDS[key];
  return {
    pin: key,
    in_catalog: true,
    name: LIFE_ATTENDANCE_EMPLOYEES[key],
    odoo_employee_id: odooId == null ? null : Number(odooId),
  };
}

function resolveEmployeeName(pin) {
  return lookupEmployee(pin).name;
}

function employeeDisplayName(pin) {
  const { name, in_catalog, odoo_employee_id } = lookupEmployee(pin);
  if (name) {
    return odoo_employee_id ? `${name} (Odoo #${odoo_employee_id})` : name;
  }
  if (in_catalog) return `PIN ${pin} (nombre pendiente)`;
  return `PIN ${pin} (sin catálogo)`;
}


/**
 * Parser attlog.dat (ZKTeco / reloj ingreso-salida).
 * Formato por línea (tab-separated):
 *   PIN  DateTime  Verified  Status  WorkCode  Reserved
 * Status: 0 = entrada, 1 = salida (convención ZKTeco).
 */


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

function parseAttlogLines(text) {
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

  let entrada_time_str = entradaEv ? entradaEv.time.slice(0, 8) : null;
  let salida_time_str = salidaEv ? salidaEv.time.slice(0, 8) : null;

  if (!entrada_time_str && salida_time_str) {
    flags.push("sin_entrada");
    entrada_time_str = "08:00:00"; // Simulación entrada
  }
  if (entrada_time_str && !salida_time_str) {
    flags.push("sin_salida");
    salida_time_str = "17:00:00"; // Simulación salida
  }
  if (entradas.length > 1) flags.push("multiples_entradas");
  if (salidas.length > 1) flags.push("multiples_salidas");

  let hours = null;
  if (entrada_time_str && salida_time_str) {
    const t1 = intTime(entrada_time_str);
    const t2 = intTime(salida_time_str);
    hours = Math.round(Math.max(0.5, t2 - t1) * 100) / 100;
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

function intTime(timeStr) {
  const parts = timeStr.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h + m / 60.0;
}

function buildNominaDraftFromAttlog(text, options = {}) {
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

{ formatTime, hoursBetween, extractDeviceId };


/**
 * PIN del reloj ZKTeco → nombre / Odoo hr.employee.
 * PIN = hr.employee.barcode (Badge ID / credencial).
 * Generado desde kapso/config/attlog_employee_map.json — no editar a mano.
 * Regenerar: node kapso/scripts/sync_nomina_employee_codes.js
 */
const LIFE_ATTENDANCE_EMPLOYEES = {
  "4": "Jesus",
  "5": "Laura Alejandra",
  "6": "Yesica",
  "8": "Laura Gomez",
  "9": "Natalia",
  "10": "Valentina",
  "11": "Lorena",
  "15": "Tatiana",
  "16": "Milvany",
};

/** PIN reloj → hr.employee.id Odoo (null si no hay match). */
const LIFE_ATTENDANCE_ODOO_IDS = {
  "4": 12,
  "5": 16,
  "6": 6,
  "8": 15,
  "9": 10,
  "10": 13,
  "11": 5,
  "15": 7,
  "16": 4,
};

function lookupEmployee(pin) {
  const key = String(pin ?? "").trim();
  if (!key) return { pin: key, in_catalog: false, name: null, odoo_employee_id: null };
  if (!(key in LIFE_ATTENDANCE_EMPLOYEES)) {
    return { pin: key, in_catalog: false, name: null, odoo_employee_id: null };
  }
  const odooId = LIFE_ATTENDANCE_ODOO_IDS[key];
  return {
    pin: key,
    in_catalog: true,
    name: LIFE_ATTENDANCE_EMPLOYEES[key],
    odoo_employee_id: odooId == null ? null : Number(odooId),
  };
}

function resolveEmployeeName(pin) {
  return lookupEmployee(pin).name;
}

function employeeDisplayName(pin) {
  const { name, in_catalog, odoo_employee_id } = lookupEmployee(pin);
  if (name) {
    return odoo_employee_id ? `${name} (Odoo #${odoo_employee_id})` : name;
  }
  if (in_catalog) return `PIN ${pin} (nombre pendiente)`;
  return `PIN ${pin} (sin catálogo)`;
}


/**
 * Parser attlog.dat (ZKTeco / reloj ingreso-salida).
 * Formato por línea (tab-separated):
 *   PIN  DateTime  Verified  Status  WorkCode  Reserved
 * Status: 0 = entrada, 1 = salida (convención ZKTeco).
 */


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

function parseAttlogLines(text) {
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

function buildNominaDraftFromAttlog(text, options = {}) {
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

{ formatTime, hoursBetween, extractDeviceId };


/**
 * Kapso function: descarga attlog.dat de WhatsApp y arma nomina_draft (por confirmar).
 * Solo staff (Javier u otros en allowlist). No escribe Odoo HR aún — fase cola.
 */

async function fetchAttlogText(fileUrl) {
  const resp = await fetch(fileUrl);
  if (!resp.ok) {
    throw new Error(`download_failed:${resp.status}`);
  }
  const buf = await resp.arrayBuffer();
  const dec = new TextDecoder("utf-8", { fatal: false });
  return dec.decode(buf);
}

function pickFileUrl(body) {
  const input = body?.input || body?.data || {};
  const vars = body?.execution_context?.vars || {};
  const ctx = body?.whatsapp_context || {};
  const messages = Array.isArray(ctx.messages) ? ctx.messages : [];
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  const msgMedia =
    lastInbound?.media_url ||
    lastInbound?.media?.url ||
    lastInbound?.document?.url ||
    null;

  const candidates = [
    input.file_url,
    input.media_url,
    msgMedia,
    vars?.media?.url,
    vars?.nomina?.source_file_url,
    ctx?.media_data?.url,
    ctx?.last_media_url,
  ];

  for (const c of candidates) {
    const url = String(c || "").trim();
    if (url.startsWith("http")) return url;
  }
  return null;
}

function pickFilename(body, fileUrl) {
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const fromVars = String(vars?.nomina?.source_filename || input.filename || "").trim();
  if (fromVars) return fromVars;
  try {
    const path = new URL(fileUrl).pathname;
    const base = path.split("/").pop();
    if (base) return decodeURIComponent(base);
  } catch {
    /* ignore */
  }
  return "attlog.dat";
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const isStaff = vars?.user?.role === "staff";
  if (!isStaff) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "staff_only",
        vars: {
          service: {
            last_call_name: "parse_nomina_attlog",
            last_call_status: "blocked",
            last_call_at: now,
            fallback_message: "Solo personal autorizado puede subir nómina.",
          },
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const fileUrl = pickFileUrl(body);
  if (!fileUrl) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "missing_file_url",
        vars: {
          service: {
            last_call_name: "parse_nomina_attlog",
            last_call_status: "error",
            last_call_at: now,
            fallback_message:
              "No encontré el archivo .dat adjunto. Envíe el attlog.dat del reloj y escriba SUBIR NOMINA.",
          },
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const filename = pickFilename(body, fileUrl);
    const text = await fetchAttlogText(fileUrl);
    const result = buildNominaDraftFromAttlog(text, {
      filename,
      uploaded_at: now,
      uploaded_by: vars?.user?.name || vars?.staff_member || null,
    });

    if (!result.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: result.error,
          vars: {
            service: {
              last_call_name: "parse_nomina_attlog",
              last_call_status: "error",
              last_call_at: now,
              fallback_message: "El archivo no parece un attlog.dat válido del reloj.",
            },
          },
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const draft = result.nomina_draft;
    const reference = `NOM-${Date.now().toString(36).toUpperCase()}`;

    return new Response(
      JSON.stringify({
        ok: true,
        status: "pending_confirmation",
        message: draft.summary_text,
        reference,
        vars: {
          nomina: {
            ...vars.nomina,
            status: "pending_confirmation",
            confirmed: false,
            reference,
            period: draft.period,
            source_file_url: fileUrl,
            source_filename: filename,
            employee_count: draft.employees.length,
            summary_text: draft.summary_text,
            summary_html: draft.summary_html,
            draft,
          },
          staff: {
            ...vars.staff,
            registration_type: "nomina",
            last_upload_kind: "attlog_dat",
          },
          service: {
            last_call_name: "parse_nomina_attlog",
            last_call_status: "ready",
            last_call_at: now,
            fallback_message: null,
          },
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: String(err?.message || err),
        vars: {
          service: {
            last_call_name: "parse_nomina_attlog",
            last_call_status: "error",
            last_call_at: now,
            fallback_message: "No pude leer el archivo del reloj. Reenvíe el .dat.",
          },
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}

