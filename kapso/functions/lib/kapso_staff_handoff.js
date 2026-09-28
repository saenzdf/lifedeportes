/**
 * Abre el inbox del cliente para que staff pueda escribir tras un aviso.
 * Kapso bloquea Compose en waiting/running; handoff pausa el bot y habilita humano.
 * Si la exec está ended, intenta reactivarla a handoff (staff no puede escribir en ended).
 */

const WORKFLOW_ID = "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";
const VENDOR_STEP = "agent_orquestador_1745500003000";
const PRE_VENDOR_STEP_RE =
  /ensure_crm|fn_ensure|resolve_business|fn_resolve|classify_contact|route_user|policy.?guard|wait_customer_burst|guard_policy|guard_staff/i;

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unwrapExecutions(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const data = payload.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.executions)) return data.executions;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(payload.executions)) return payload.executions;
  return [];
}

function stepId(exec) {
  return compact(
    exec?.current_step?.identifier || exec?.current_step_identifier || ""
  );
}

function isCustomerVendorExec(exec) {
  const step = stepId(exec);
  if (!step) return true;
  if (isPreVendorHandoffStep(step)) return false;
  if (step === VENDOR_STEP || step.includes("orquestador")) return true;
  if (/historico|histórico/i.test(step)) return true;
  if (/staff/i.test(step) && !/customer/i.test(step)) return false;
  return true;
}

function isPreVendorHandoffStep(step) {
  return PRE_VENDOR_STEP_RE.test(String(step || ""));
}

async function kapsoJson(env, method, path, body) {
  const apiKey = compact(env.KAPSO_API_KEY);
  if (!apiKey) throw new Error("missing_kapso_api_key");
  const base = compact(env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const resp = await fetch(`${base}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      `${resp.status} ${compact(json?.error?.message || json?.error || resp.statusText)}`.slice(
        0,
        220
      )
    );
  }
  return json;
}

async function listExecutionsForConversation(env, workflowId, conversationId) {
  const qs = new URLSearchParams({
    whatsapp_conversation_id: conversationId,
    per_page: "20",
    page: "1",
  });
  const json = await kapsoJson(
    env,
    "GET",
    `/platform/v1/workflows/${workflowId}/executions?${qs.toString()}`
  );
  return unwrapExecutions(json).filter(
    (e) => compact(e.whatsapp_conversation_id) === compact(conversationId)
  );
}

function pickCustomerExecution(executions) {
  const vendor = executions.filter(isCustomerVendorExec);
  const pool = vendor.length ? vendor : executions;
  return (
    pool.sort((a, b) => {
      const ta = Date.parse(a.updated_at || a.created_at || 0);
      const tb = Date.parse(b.updated_at || b.created_at || 0);
      return tb - ta;
    })[0] || null
  );
}

function handoffEnabled(env) {
  const raw = String(env.LIFE_STAFF_NOTIFY_HANDOFF ?? "true").toLowerCase().trim();
  return !["0", "false", "no", "off"].includes(raw);
}

/**
 * @returns {Promise<{ ok: boolean, skipped?: string, execution_id?: string, from?: string, to?: string, error?: string }>}
 */
export async function openCustomerConversationForStaff(env, conversationId) {
  const convId = compact(conversationId);
  if (!convId) return { ok: false, skipped: "missing_conversation_id" };
  if (!handoffEnabled(env)) return { ok: false, skipped: "handoff_disabled" };
  if (!compact(env.KAPSO_API_KEY)) return { ok: false, skipped: "missing_kapso_api_key" };

  const workflowId =
    compact(env.LIFE_WORKFLOW_ID) || compact(env.KAPSO_WORKFLOW_ID) || WORKFLOW_ID;

  try {
    const executions = await listExecutionsForConversation(env, workflowId, convId);
    const exec = pickCustomerExecution(executions);
    if (!exec?.id) return { ok: false, skipped: "no_execution" };

    const fromStatus = compact(exec.status).toLowerCase();
    if (fromStatus === "handoff") {
      return { ok: true, skipped: "already_handoff", execution_id: exec.id, from: fromStatus };
    }
    if (isPreVendorHandoffStep(stepId(exec))) {
      return {
        ok: false,
        skipped: "pre_vendor_step",
        execution_id: exec.id,
        from: fromStatus,
        step: stepId(exec),
      };
    }
    if (!["waiting", "running", "ended", "failed"].includes(fromStatus)) {
      return { ok: false, skipped: `status_${fromStatus || "unknown"}`, execution_id: exec.id };
    }

    await kapsoJson(env, "PATCH", `/platform/v1/workflow_executions/${exec.id}`, {
      workflow_execution: { status: "handoff" },
    });
    return {
      ok: true,
      execution_id: exec.id,
      from: fromStatus,
      to: "handoff",
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 200) };
  }
}

export { WORKFLOW_ID, VENDOR_STEP, isCustomerVendorExec, isPreVendorHandoffStep, pickCustomerExecution };
