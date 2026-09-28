/**
 * route_customer_burst_resume — tras wait_customer_burst (debounce ~30s).
 * timeout / silencio → vendedor; user_input → reinicia el wait;
 * ads_greet → saludo neutro preconfigurado + wait (prefill Meta Ads);
 * ignore / end → spam real (o Ads fuera de ventana 06:00–22:00).
 *
 * Prefill "Hola, quiero cotizar/quiero uniformes de" solo → ads_greet (06–22).
 * ≥2 audios sin contexto de ropa deportiva → ignore/end.
 * Tras spam+timeout: termina la ejecución (evita loop 30s y no dispara al vendedor).
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};
  const system = executionContext.system || body?.system || {};
  const whatsappContext = body?.whatsapp_context || {};
  const messages = Array.isArray(whatsappContext.messages)
    ? whatsappContext.messages
    : Array.isArray(body?.inbound_messages)
      ? body.inbound_messages
      : Array.isArray(whatsappContext?.inbound_messages)
        ? whatsappContext.inbound_messages
        : [];
  const conversation = whatsappContext.conversation || {};
  const now = new Date().toISOString();

  const BLACKLIST = [
    "3000000035", "3000000062", "3000000030", "3000000027", "3000000079",
    "3000000063", "3000000007", "584226400323", "3000000078", "3000000017",
    "3000000038", "3000000033", "3000000071", "3000000050", "3000000044",
    "3000000049", "3000000083", "3000000012", "3000000072", "3000000037",
    "3000000075", "3000000005", "3000000074", "584260851544", "3000000036",
    "3000000077", "3000000057", "3000000065", "3000000026", "3000000073",
    "3000000015", "3000000011", "3000000076", "3000000010",
    "3000000003", "3000000041",
  ];

  const GENUINE_KEYWORDS = [
    "uniforme", "camiseta", "buzo", "pantaloneta", "medias", "talla", "futbol",
    "precio", "cotizar", "voley", "voleibol", "baloncesto", "arquero", "diseno", "sublimado",
    "dorsal", "nombre", "estampado", "taller", "pedido", "compra", "cotizacion",
    "presupuesto", "prenda", "tela", "dumonti", "dry", "manga", "cuello", "saco",
    "chaqueta", "pantalon", "licra", "impermeable", "bolsillo", "bordado",
    "vendedor", "asesor", "persona", "atencion", "humano", "atender", "cantidad",
    "unidad", "unidades", "equipo", "club", "colegio",
    "cuenta", "banco", "nequi", "bancolombia", "daviplata", "consignar", "consignacion",
    "transferir", "transferencia", "abono", "abonar", "pago", "pagar", "espera",
    "entrega", "entregar", "envio", "enviar", "despacho", "octubre", "noviembre",
    "diciembre", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado",
  ];

  const NON_VERBAL_MARKERS = [
    "silence", "ruido", "background noise", "outro jingle", "pause", "screaming",
    "sniffs", "sliding", "clicking", "musica", "music", "beeping", "throat",
    "inhales", "rain", "background", "noise", "jingle", "crying", "mooing",
    "rustling", "babbling", "paper", "laughter", "laugh", "cough", "sneeze",
    "breathing", "static", "humming", "whistle", "animal", "meow", "bark",
  ];

  const COLOMBIAN_INSULTS = [
    /\bmalparid[oa]/i, /\bsapo\b/i, /\b(gonorrea|hpta|mierda|hp)\b/i,
    /\bcoma\s+mierda/i, /\bhijo\s+de\s+puta/i, /\bcarechimba/i,
  ];

  const GREETING_ONLY = /^(hola+|buenas?|buenos\s+dias?|buenas\s+tardes?|buenas\s+noches?|hi|hey|ok|oki|si|sí|dale|ya)$/i;

  const context = executionContext.context || body?.context || {};
  const waId = String(
    context?.phone_number ||
      conversation.phone_number ||
      vars?.user?.wa_id ||
      (messages[0] ? messages[0].from || messages[0].sender_phone_number : "") ||
      ""
  ).replace(/\D/g, "");

  function fold(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function getMessageText(msg) {
    if (!msg || typeof msg !== "object") return "";
    const direct = msg.content ?? msg.body ?? msg.caption;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const nested = msg.text ?? msg.message?.text;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
    if (nested && typeof nested === "object") {
      const bodyText = nested.body ?? nested.text;
      if (typeof bodyText === "string" && bodyText.trim()) return bodyText.trim();
    }
    return "";
  }

  function transcriptRawToString(raw) {
    if (!raw) return "";
    if (typeof raw === "string") return raw.trim();
    if (typeof raw === "object") {
      const t = raw.text ?? raw.transcript ?? raw.body ?? "";
      return typeof t === "string" ? t.trim() : "";
    }
    return "";
  }

  function getTranscript(msg) {
    if (!msg || typeof msg !== "object") return "";
    const fromFields = transcriptRawToString(
      msg.transcript ??
        msg.metadata?.transcript ??
        msg.kapso?.transcript ??
        msg.audio?.transcript ??
        msg.message?.audio?.transcript
    );
    if (fromFields) return fromFields;
    const bodyText = getMessageText(msg);
    const m = bodyText.match(/transcript\s*:\s*(.+)$/is);
    if (m && m[1]) return m[1].trim();
    return "";
  }

  function classifyTranscript(rawText) {
    const original = String(rawText || "").trim();
    if (!original) return { kind: "empty", text: "", folded: "" };
    let folded = fold(original).replace(/\[|\]/g, " ");
    for (const mk of NON_VERBAL_MARKERS) folded = folded.split(mk).join(" ");
    folded = folded.replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();
    const words = folded.split(/\s+/).filter((w) => w.length >= 2);
    const letters = (folded.match(/[a-zñ]/g) || []).length;
    if (words.length >= 3 && letters >= 12) return { kind: "real_speech", text: original, folded };
    if (words.length >= 2 && letters >= 16) return { kind: "real_speech", text: original, folded };
    return { kind: "non_verbal", text: original, folded };
  }

  function isSalesSpeech(foldedText) {
    return GENUINE_KEYWORDS.some((kw) => foldedText.includes(kw));
  }

  function isAdsPrefillGreeting(text) {
    // Meta a veces mete ZWSP / puntuación rara al final del prefill incompleto.
    let t = fold(text)
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/[^\wñáéíóúü\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!t) return false;
    const mid = Math.floor(t.length / 2);
    if (mid > 10 && t.slice(0, mid).trim() === t.slice(mid).trim()) {
      t = t.slice(0, mid).trim();
    }
    return (
      /^hola\s*quiero\s+cotizar\s+uniformes\s+de\s*$/.test(t) ||
      /^hola\s*quiero\s+cotizar\s+uniformes\s*$/.test(t) ||
      /^hola\s*quiero\s+uniformes\s+de\s*$/.test(t) ||
      /^quiero\s+(cotizar\s+)?uniformes\s+de\s*$/.test(t)
    );
  }

  /** Ventana de envío al cliente: 06:00–22:00 Bogotá. */
  function customerSendOkNow() {
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const map = {};
      for (const p of fmt.formatToParts(new Date())) {
        if (p.type !== "literal") map[p.type] = p.value;
      }
      const minutes = Number(map.hour) * 60 + Number(map.minute);
      return minutes >= 6 * 60 && minutes < 22 * 60;
    } catch {
      return true;
    }
  }

  const SPANISH_SHORT_WORDS = new Set([
    "a", "al", "de", "del", "el", "en", "es", "la", "las", "le", "les", "lo", "los",
    "me", "mi", "no", "o", "se", "si", "su", "sus", "te", "tu", "un", "una", "unos",
    "unas", "ya", "yo", "con", "por", "que", "mas", "tan", "muy", "dia", "ano", "mes"
  ]);

  function isKeyboardSmash(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (t.length < 36) return false;
    if (isAdsPrefillGreeting(t)) return false;
    const folded = fold(t);
    if (GENUINE_KEYWORDS.some((kw) => folded.includes(kw))) return false;
    if (/(.)\1{4,}/.test(folded)) return true;
    if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(folded)) return true;
    const tokens = folded.split(/\s+/).filter(Boolean);
    if (tokens.length < 6) return false;
    const nonStopTokens = tokens.filter((x) => !SPANISH_SHORT_WORDS.has(x));
    if (nonStopTokens.length === 0) return false;
    const weirdTok = nonStopTokens.filter(
      (x) => /[0-9]/.test(x) || /(.)\1{2,}/.test(x) || x.length <= 2
    ).length;
    if (weirdTok / nonStopTokens.length >= 0.5) return true;
    return false;
  }

  const inboundMessages = messages.filter(
    (m) => !m.direction || String(m.direction).toLowerCase() === "inbound"
  );

  const assignee = conversation.assignee || vars.assignee || vars.assignee_id || null;
  const hasHumanAssignee =
    assignee !== null &&
    assignee !== undefined &&
    String(assignee).toLowerCase() !== "null" &&
    String(assignee).trim() !== "";

  let allWordsCombined = "";
  let nonPrefillTextCount = 0;
  let prefillOnlyTexts = 0;
  let anyNonPrefillSignal = false;
  let salesSpeechCount = 0;

  inboundMessages.forEach((m) => {
    const text = getMessageText(m);
    const transcript = getTranscript(m);
    const type = String(m.message_type || m.type || "").toLowerCase();
    const classified = classifyTranscript(transcript);

    if (text) {
      if (isAdsPrefillGreeting(text)) {
        prefillOnlyTexts++;
      } else {
        nonPrefillTextCount++;
        anyNonPrefillSignal = true;
        allWordsCombined += " " + fold(text);
      }
    }
    if (classified.kind === "real_speech") {
      if (isSalesSpeech(classified.folded)) {
        salesSpeechCount++;
        anyNonPrefillSignal = true;
        allWordsCombined += " " + classified.folded;
      }
    }
    if (type === "image" || type === "video" || type === "document") {
      anyNonPrefillSignal = true;
    }
  });

  const hasGenuineKeyword = GENUINE_KEYWORDS.some((kw) => allWordsCombined.includes(kw));
  const hasSalesSpeech = salesSpeechCount >= 1;

  let isSpam = false;
  let spamReason = "";
  let isPrefillOnly = false;

  if (hasHumanAssignee) {
    isSpam = false;
  } else if (hasGenuineKeyword || hasSalesSpeech) {
    isSpam = false;
  } else {
    let audiosCount = 0;
    let salesAudioCount = 0;
    let imagesCount = 0;
    let stickersCount = 0;
    let shortTextsCount = 0;
    let nonSpamTextsCount = 0;
    let smashTextsCount = 0;
    const inboundTexts = [];
    const audioClassifications = [];

    inboundMessages.forEach((m) => {
      const type = String(m.message_type || m.type || "").toLowerCase();
      const textBody = getMessageText(m);

      if (type === "audio") {
        audiosCount++;
        const cls = classifyTranscript(getTranscript(m));
        audioClassifications.push(cls);
        if (cls.kind === "real_speech" && isSalesSpeech(cls.folded)) salesAudioCount++;
      } else if (type === "image" || type === "video") {
        imagesCount++;
      } else if (type === "sticker") {
        stickersCount++;
      } else if (textBody.trim()) {
        inboundTexts.push(textBody.trim());
        const cleaned = textBody.trim();
        if (isAdsPrefillGreeting(cleaned)) return;
        if (isKeyboardSmash(cleaned)) {
          smashTextsCount++;
          return;
        }
        if (GREETING_ONLY.test(cleaned)) {
          shortTextsCount++;
          return;
        }
        if (cleaned.length <= 5) shortTextsCount++;
        else nonSpamTextsCount++;
      }
    });

    const hasInsults = inboundTexts.some((text) =>
      COLOMBIAN_INSULTS.some((regex) => regex.test(text))
    );

    const allAudiosNonVerbal =
      audiosCount >= 1 &&
      audioClassifications.every((c) => c.kind === "non_verbal" || c.kind === "empty");
    const isPocketDialAudios = audiosCount >= 2 && allAudiosNonVerbal;
    const isMediaFloodChildPlay =
      audiosCount >= 2 && (imagesCount >= 2 || stickersCount >= 3);
    const isStickerFlood = stickersCount >= 4 && nonSpamTextsCount === 0 && !anyNonPrefillSignal;
    const isGibberishText =
      shortTextsCount >= 2 &&
      nonSpamTextsCount === 0 &&
      smashTextsCount === 0 &&
      !hasSalesSpeech &&
      imagesCount === 0 &&
      (audiosCount === 0 || allAudiosNonVerbal);
    const isSmashText =
      smashTextsCount >= 1 && nonSpamTextsCount === 0 && !hasGenuineKeyword && !hasSalesSpeech;
    const isBlacklisted = waId && BLACKLIST.includes(waId);

    // ≥2 audios sin ropa deportiva / venta (ruido o habla irrelevante).
    // Saludos / prefill Meta no cuentan como texto de lead.
    const isNonSalesAudioFlood =
      audiosCount >= 2 &&
      salesAudioCount === 0 &&
      nonSpamTextsCount === 0 &&
      imagesCount === 0 &&
      stickersCount === 0 &&
      smashTextsCount === 0;

    isPrefillOnly =
      prefillOnlyTexts >= 1 &&
      nonPrefillTextCount === 0 &&
      !hasGenuineKeyword &&
      !hasSalesSpeech &&
      audiosCount === 0 &&
      imagesCount === 0 &&
      smashTextsCount === 0;

    if (isNonSalesAudioFlood) {
      isSpam = true;
      spamReason = "2+ audios sin contexto de ropa deportiva / uniformes — no lead.";
    } else if (isBlacklisted) {
      isSpam = true;
      spamReason = "Phone number is blacklisted.";
    } else if (hasInsults) {
      isSpam = true;
      spamReason = "Insults / profanity detected.";
    } else if (isMediaFloodChildPlay) {
      isSpam = true;
      spamReason = `Child play / media flood detected (${audiosCount} audios and either ${imagesCount} images or ${stickersCount} stickers).`;
    } else if (isPocketDialAudios) {
      isSpam = true;
      spamReason = `Pocket dial detected (${audiosCount} audios with only background noise/silence).`;
    } else if (isStickerFlood) {
      isSpam = true;
      spamReason = `Sticker flood detected (${stickersCount} stickers).`;
    } else if (isSmashText) {
      isSpam = true;
      spamReason = "Keyboard smash / gibberish long text detected.";
    } else if (isGibberishText) {
      isSpam = true;
      spamReason = `Gibberish text detected (${shortTextsCount} short meaningless messages, no real speech).`;
    }
  }

  if (!hasHumanAssignee && !hasGenuineKeyword && !hasSalesSpeech && !isSpam) {
    const onlyPrefill =
      inboundMessages.length > 0 &&
      inboundMessages.every((m) => {
        const type = String(m.message_type || m.type || "").toLowerCase();
        if (type === "audio" || type === "image" || type === "video" || type === "sticker" || type === "document") {
          return false;
        }
        const text = getMessageText(m);
        return !text || isAdsPrefillGreeting(text);
      });
    if (onlyPrefill) isPrefillOnly = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Jev (TypeSafe vía OpenRouter) — capa de decisión tipada.
  //   LIFE_JEV_MODE=off (default) | shadow | on
  //   shadow → solo registra la decisión de Jev en vars.jev_shadow.guard (NO cambia routing)
  //   on     → Jev puede RESCATAR leads (spam→lead) y confirmar prefill Ads.
  //            NUNCA puede convertir un no-spam en spam (protege ingresos).
  //            Blacklist y hasHumanAssignee siguen siendo deterministas.
  // Sin OPENROUTER_API_KEY o si la llamada falla → null y se usa la heurística.
  // ─────────────────────────────────────────────────────────────────────────
  const JEV_MODE = String(env?.LIFE_JEV_MODE || "off").toLowerCase().trim();
  const JEV_THRESHOLD = Number(env?.LIFE_JEV_THRESHOLD || 0.7);

  async function jevDecide(questions, timeoutMs = 8000) {
    const key = String(env?.OPENROUTER_API_KEY || "").trim();
    if (!key) return { ok: false, reason: "no_api_key", answers: null };

    const state = {
      burst_messages: inboundMessages.slice(0, 8).map((m) => {
        const type = String(m.message_type || m.type || "text").toLowerCase();
        const entry = { type };
        const text = getMessageText(m);
        if (text) entry.text = text.slice(0, 600);
        const tr = getTranscript(m);
        if (tr) entry.transcript = tr.slice(0, 600);
        return entry;
      }),
      prefill_text_count: prefillOnlyTexts,
      real_text_count: nonPrefillTextCount,
      has_human_assignee: hasHumanAssignee,
      in_send_window_06_22: customerSendOkNow(),
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "typesafe/jev-1.13", state, questions }),
        signal: ctrl.signal,
      });
      if (!res.ok) return { ok: false, reason: `http_${res.status}`, answers: null };
      const json = await res.json();
      return { ok: true, reason: null, answers: json?.answers || null, cost: json?.usage?.cost };
    } catch (err) {
      return { ok: false, reason: String(err?.name || err?.message || err).slice(0, 60), answers: null };
    } finally {
      clearTimeout(timer);
    }
  }

  const JEV_QUESTIONS = {
    lead_intent: {
      type: "choice",
      instructions:
        "¿Cuál es la intención real de este burst de mensajes entrantes hacia Life Deportes, una empresa de uniformes y ropa deportiva personalizada?",
      criteria: {
        sales_lead:
          "El cliente pregunta o muestra interés real de compra/cotización de ropa deportiva o uniformes, aunque sea breve o mal escrito.",
        ads_prefill_only:
          "Es solo un saludo/prefill automático de Meta Ads (p. ej. 'Hola, quiero cotizar uniformes de') sin ningún contenido propio del cliente.",
        spam_or_noise:
          "Ruido: pocket-dial, stickers o audios sin habla humana, insultos, texto basura o flood de medios sin relación con ventas.",
      },
    },
    is_real_speech: {
      type: "noul",
      instructions: "¿Al menos uno de los mensajes contiene habla humana real (no solo ruido, silencio o música)?",
      criteria: {
        true: "Hay palabras reconocibles transcritas de un audio.",
        false: "Solo ruido, silencio, música o marcadores no verbales.",
      },
    },
    is_insult: {
      type: "noul",
      instructions: "¿El mensaje contiene insultos o profanidad explícita?",
      criteria: {
        true: "Insulto o profanidad explícita en español.",
        false: "No hay insultos ni profanidad.",
      },
    },
  };

  const heuristicClass = isSpam ? "spam_or_noise" : isPrefillOnly ? "ads_prefill_only" : "sales_lead";
  let jevShadow = null;

  if (JEV_MODE === "shadow" || JEV_MODE === "on") {
    const t0 = Date.now();
    const jev = await jevDecide(JEV_QUESTIONS);
    const ans = jev.answers;
    const intent = ans?.lead_intent && ans.lead_intent.type === "choice" ? ans.lead_intent : null;
    const jevClass = intent?.choice ?? null;
    const jevConfidence =
      typeof intent?.confidence === "number"
        ? intent.confidence
        : jevClass && typeof intent?.probabilities?.[jevClass] === "number"
          ? intent.probabilities[jevClass]
          : null;
    const jevUsable =
      jev.ok && jevClass !== null && jevConfidence !== null && jevConfidence >= JEV_THRESHOLD;

    jevShadow = {
      enabled: true,
      mode: JEV_MODE,
      ok: jev.ok,
      reason: jev.reason,
      decision: jevClass,
      confidence: jevConfidence,
      probabilities: intent?.probabilities ?? null,
      is_real_speech: ans?.is_real_speech?.noul ?? null,
      is_insult: ans?.is_insult?.noul ?? null,
      heuristic: heuristicClass,
      agreement: jevClass === null ? null : jevClass === heuristicClass,
      applied: false,
      latency_ms: Date.now() - t0,
      cost_usd: jev.cost ?? null,
      called_at: now,
    };

    if (JEV_MODE === "on" && jevUsable) {
      const blacklisted = Boolean(waId && BLACKLIST.includes(waId));
      if (!blacklisted && !hasHumanAssignee) {
        if (jevClass === "sales_lead" && isSpam) {
          // Rescate: la heurística descartaba un lead; Jev dice que sí lo es.
          isSpam = false;
          spamReason = "";
          jevShadow.applied = true;
          jevShadow.applied_reason = "rescued_lead";
        } else if (jevClass === "ads_prefill_only" && !isSpam && !isPrefillOnly) {
          isPrefillOnly = true;
          jevShadow.applied = true;
          jevShadow.applied_reason = "detected_ads_prefill";
        }
      }
      // Dirección contraria (no-spam → spam) NO se aplica: protege ingresos.
    }
  }

  let spamProfile = null;
  if (isSpam) {
    spamProfile = { is_spam: true, reason: spamReason, classified_at: now };
  } else if (isPrefillOnly) {
    spamProfile = {
      is_spam: false,
      ads_prefill_only: true,
      reason: "Meta Ads prefill greeting only — waiting for real message",
      classified_at: now,
    };
  } else if (vars.spam_profile?.is_spam) {
    spamProfile = {
      is_spam: false,
      reason: "Lead cured via real speech transcript, sports keyword, or staff override",
      classified_at: now,
    };
  } else {
    spamProfile = vars.spam_profile || null;
    if (spamProfile && spamProfile.ads_prefill_only && !isPrefillOnly) {
      spamProfile = {
        ...spamProfile,
        ads_prefill_only: false,
        reason: "Customer sent follow-up after ads prefill",
        classified_at: now,
      };
    }
  }

  const reason = String(
    system?.last_resume?.reason ||
      vars?.system?.last_resume?.reason ||
      executionContext?.last_resume?.reason ||
      body?.last_resume_reason ||
      ""
  ).toLowerCase();

  // Routing abajo: spam → ignore/end; ads prefill → ads_greet (06–22).

  async function endQuietExecution() {
    const executionId = String(
      body?.execution_id ||
        body?.workflow_execution_id ||
        executionContext?.execution_id ||
        executionContext?.id ||
        system?.execution_id ||
        system?.workflow_execution_id ||
        vars?.kapso?.execution_id ||
        body?.flow_info?.execution_id ||
        ""
    ).trim();
    const apiKey = String(env?.KAPSO_API_KEY || "").trim();
    if (!executionId || !apiKey) return { ok: false, reason: "missing_id_or_key" };
    try {
      const base = String(env?.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
      const resp = await fetch(`${base}/platform/v1/workflow_executions/${executionId}`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({ workflow_execution: { status: "ended" } }),
      });
      return { ok: resp.ok, status: resp.status };
    } catch (err) {
      return { ok: false, error: String(err?.message || err).slice(0, 120) };
    }
  }

  let quietEnded = null;
  // Spam NUNCA va al vendedor. Prefill Ads → saludo neutro (ads_greet) en 06–22.
  // En prod, a veces available_edges en timeout solo trae ["timeout"] (sin "ignore"):
  // igual hay que evitar el edge timeout → ensure-crm → vendedor para spam.
  const edgeSet = new Set(
    (availableEdges || []).map((e) => String(e || "").trim()).filter(Boolean)
  );
  const sendOk = customerSendOkNow();
  const alreadyGreeted = Boolean(
    vars?.service?.ads_prefill_greeted || vars?.spam_profile?.ads_greeted
  );

  let signal;
  let routeReason;
  let servicePatch = {};

  // Durante el debounce, otro mensaje siempre reinicia el wait (juntar burst).
  if (reason === "user_input" && edgeSet.has("user_input")) {
    signal = "user_input";
    routeReason = "burst_more_messages";
  } else if (isSpam) {
    const isTimeoutIgnore = reason === "timeout";
    if (isTimeoutIgnore) {
      quietEnded = await endQuietExecution();
    }
    if (isTimeoutIgnore && edgeSet.has("end")) {
      signal = "end";
      routeReason = `burst_end_spam:${spamReason}`;
    } else if (edgeSet.has("ignore")) {
      signal = "ignore";
      routeReason = `burst_ignore_spam:${spamReason}`;
    } else if (edgeSet.has("user_input")) {
      signal = "user_input";
      routeReason = "burst_ignore_fallback_rewait";
    } else {
      signal = "ignore";
      routeReason = "burst_ignore_forced_no_edge";
    }
  } else if (isPrefillOnly) {
    // Ya saludamos este prefill → no repetir; esperar o cerrar en silencio.
    if (alreadyGreeted) {
      if (reason === "timeout" && edgeSet.has("end")) {
        quietEnded = await endQuietExecution();
        signal = "end";
        routeReason = "burst_end_ads_already_greeted";
      } else if (edgeSet.has("ignore")) {
        signal = "ignore";
        routeReason = "burst_ignore_ads_already_greeted";
      } else if (edgeSet.has("user_input")) {
        signal = "user_input";
        routeReason = "burst_ads_greeted_rewait";
      } else {
        signal = "ignore";
        routeReason = "burst_ads_greeted_forced";
      }
    } else if (!sendOk) {
      // Noche 22:00–06:00: sin WA; resume matutino retoma el hilo.
      if (reason === "timeout" && edgeSet.has("end")) {
        quietEnded = await endQuietExecution();
        signal = "end";
        routeReason = "burst_end_ads_outside_send_window";
      } else if (edgeSet.has("ignore")) {
        signal = "ignore";
        routeReason = "burst_ignore_ads_outside_send_window";
      } else if (edgeSet.has("user_input")) {
        signal = "user_input";
        routeReason = "burst_ads_night_rewait";
      } else {
        signal = "ignore";
        routeReason = "burst_ads_night_forced";
      }
    } else if (edgeSet.has("ads_greet")) {
      signal = "ads_greet";
      routeReason = "burst_ads_prefill_greet";
      servicePatch = {
        ads_prefill_greeted: true,
        greeting_sent: true,
      };
      if (spamProfile) {
        spamProfile = {
          ...spamProfile,
          ads_greeted: true,
          reason: "Meta Ads prefill — saludo neutro enviado; waiting real message",
        };
      }
    } else if (edgeSet.has("ignore")) {
      // Grafo viejo sin ads_greet: no mandar al vendedor.
      signal = "ignore";
      routeReason = "burst_ignore_ads_no_greet_edge";
    } else if (edgeSet.has("user_input")) {
      signal = "user_input";
      routeReason = "burst_ads_fallback_rewait";
    } else {
      signal = "ignore";
      routeReason = "burst_ads_forced_no_edge";
    }
  } else if (edgeSet.has("timeout")) {
    signal = "timeout";
    routeReason = reason === "timeout" ? "burst_silence_timeout" : "burst_default_to_vendor";
  } else if (edgeSet.has("user_input")) {
    signal = "user_input";
    routeReason = "burst_fallback_input";
  } else {
    signal = availableEdges[0];
    routeReason = "first_edge";
  }

  return new Response(
    JSON.stringify({
      next_edge: signal,
      vars: {
        spam_profile: spamProfile,
        jev_shadow: jevShadow,
        service: {
          ...(vars.service || {}),
          ...servicePatch,
          last_call_name: "route_customer_burst_resume",
          last_call_status: "ready",
          last_call_at: now,
          burst_resume_reason: reason || null,
          route_reason: routeReason,
          quiet_ended: quietEnded,
          customer_send_ok: sendOk,
          available_edges_seen: availableEdges,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
