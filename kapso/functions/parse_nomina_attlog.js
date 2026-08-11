/**
 * Kapso function: descarga attlog.dat de WhatsApp y arma nomina_draft (por confirmar).
 * Solo staff (Javier u otros en allowlist). No escribe Odoo HR aún — fase cola.
 *
 * Generado como handler limpio que usa lib/parse_attlog_dat.js + lib/nomina_employee_codes.js.
 * Regenerar bundle: node kapso/scripts/bundle_parse_nomina_attlog.js
 */

import { buildNominaDraftFromAttlog } from "./lib/parse_attlog_dat.js";

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

{ handler };
