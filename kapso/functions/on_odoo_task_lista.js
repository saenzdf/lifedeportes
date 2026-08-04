/**
 * on_odoo_task_lista — webhook Odoo (Acción en project.task → Interpretar lista).
 *
 * Staff sube Excel/PDF/foto a la tarea y ejecuta Acción → Interpretar lista.
 * Organiza lista → task.description + SO.note (+ líneas comerciales opcionales).
 *
 * Auth: Header X-Life-Webhook-Secret
 * Secrets: LIFE_ODOO_WEBHOOK_SECRET, ODOO_*, GEMINI_API_KEY (imágenes/PDF raster)
 * public_endpoint=true
 *
 * Source ESM — deploy via: node kapso/scripts/deploy_on_odoo_task_lista.js
 */

import { applyListaFromTask } from "./lib/apply_lista_from_task.js";
import { compact, jsonResponse } from "./lib/order_detail_shared.js";

function extractSecret(request, url) {
  return (
    compact(request.headers.get("x-life-webhook-secret")) ||
    compact(request.headers.get("X-Life-Webhook-Secret")) ||
    compact(url.searchParams.get("secret")) ||
    compact(url.searchParams.get("token"))
  );
}

function normalizePayload(raw) {
  const p = raw?.input || raw || {};
  const taskId =
    Number(p.task_id || p._id || p.id || 0) ||
    (compact(p._model) === "project.task" ? Number(p._id || 0) : 0) ||
    null;
  return {
    event: compact(p.event) || "project.task.interpretar_lista",
    task_id: taskId,
    force: Boolean(p.force || p.force_lista),
    sync_commercial: p.sync_commercial !== false,
    raw_keys: Object.keys(p),
  };
}

async function odooAuthenticate(env) {
  const base = compact(env.ODOO_URL).replace(/\/$/, "");
  const db = compact(env.ODOO_DB);
  const login = compact(env.ODOO_USERNAME);
  const password = String(env.ODOO_PASSWORD || "");
  if (!base || !db || !login || !password) return null;

  const authRes = await fetch(`${base}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "common",
        method: "authenticate",
        args: [db, login, password, {}],
      },
      id: 1,
    }),
  });
  const authJson = await authRes.json();
  const uid = authJson?.result;
  if (!uid) return null;

  async function executeKw(model, method, args = [], kwargs = {}) {
    const res = await fetch(`${base}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "object",
          method: "execute_kw",
          args: [db, uid, password, model, method, args, kwargs],
        },
        id: Date.now(),
      }),
    });
    const json = await res.json();
    if (json.error) {
      throw new Error(json.error?.data?.message || JSON.stringify(json.error));
    }
    return json.result;
  }

  return { uid, executeKw };
}

async function handler(request, env) {
  const url = new URL(request.url);
  const expected = compact(
    env.LIFE_TASK_LISTA_WEBHOOK_SECRET || env.LIFE_ODOO_WEBHOOK_SECRET || ""
  );
  const got = extractSecret(request, url);
  if (expected && got !== expected) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const payload = normalizePayload(body);
  if (!payload.task_id) {
    return jsonResponse({ ok: false, error: "missing_task_id", payload }, 400);
  }

  const odoo = await odooAuthenticate(env);
  if (!odoo) {
    return jsonResponse({ ok: false, error: "odoo_auth_failed" }, 502);
  }

  let lista;
  try {
    lista = await applyListaFromTask(odoo, {
      taskId: payload.task_id,
      force: payload.force,
      syncCommercial: payload.sync_commercial,
      env,
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: "lista_error",
        message: String(err?.message || err).slice(0, 400),
        task_id: payload.task_id,
      },
      500
    );
  }

  const ok = Boolean(lista.applied);
  return jsonResponse({
    ok,
    event: payload.event,
    task_id: payload.task_id,
    at: new Date().toISOString(),
    lista,
    message: ok
      ? `Lista organizada (${lista.rows} filas) en tarea${lista.order_name ? ` + ${lista.order_name}` : ""}.`
      : lista.message || lista.reason,
  });
}

export { handler };
