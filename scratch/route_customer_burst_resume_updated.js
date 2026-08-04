/**
 * route-customer-burst-resume — reanudación de burst de cliente.
 * Incluye protección anti loop_guard (stepCount >= 300) y salida limpia en timeouts.
 */

function fold(str = "") {
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getMessageText(msg = {}) {
  return (
    msg.text?.body ||
    msg.caption ||
    msg.body ||
    msg.message?.text?.body ||
    ""
  );
}

function getTranscript(msg = {}) {
  return (
    msg.audio?.transcript ||
    msg.transcript ||
    msg.message?.audio?.transcript ||
    ""
  );
}

const GENUINE_KEYWORDS = [
  "uniforme",
  "camiseta",
  "sudadera",
  "peto",
  "chaqueta",
  "rompevientos",
  "cotizar",
  "cotiz",
  "precio",
  "cuanto",
  "valor",
  "abono",
  "pedido",
  "diseño",
  "diseno",
  "logo",
  "escudo",
  "muestra",
  "catalogo",
  "talla",
];

const GREETING_ONLY = /^(hola|buenas|buenos\s+dias|buenas\s+tardes|buenas\s+noches|saludos|informacion|info|que\s+tal)$/i;

const BLACKLIST = [
  "573000000000",
];

const COLOMBIAN_INSULTS = [
  /\b(hijueputa|gonorrea|malparido|triplehijueputa)\b/i,
];

function isKeyboardSmash(text = "") {
  const t = text.trim().toLowerCase();
  if (t.length < 8) return false;
  if (/^([a-z0-9])\1+$/.test(t)) return true;
  if (!/[aeiou]/i.test(t) && t.length > 6) return true;
  return false;
}

function isAdsPrefillGreeting(text = "") {
  const f = fold(text);
  return f.includes("hola quiero cotizar uniformes de");
}

function classifyTranscript(rawTranscript = "") {
  const folded = fold(rawTranscript).trim();
  if (!folded) return { kind: "empty", folded: "" };
  if (folded.includes("musica") || folded.includes("subtitulos")) {
    return { kind: "non_verbal", folded };
  }
  const cleanText = folded.replace(/\[.*?\]|\(.*?\)/g, "").trim();
  if (!cleanText || cleanText.length < 3) {
    return { kind: "non_verbal", folded };
  }
  return { kind: "real_speech", folded: cleanText };
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};
  const system = executionContext.system || vars.system || body.system || {};
  const context = executionContext.context || {};
  const whatsappContext = body?.whatsapp_context || {};
  const conversation = whatsappContext.conversation || {};

  const now = new Date().toISOString();
  const waId = String(
    context?.phone_number || conversation.phone_number || vars?.user?.wa_id || ""
  ).replace(/\D/g, "");

  const hasHumanAssignee = Boolean(
    conversation.assigned_to_user_id ||
      conversation.assigned_user ||
      context.assigned_to_user_id
  );

  const inboundMessages = Array.isArray(body?.inbound_messages)
    ? body.inbound_messages
    : Array.isArray(whatsappContext?.inbound_messages)
    ? whatsappContext.inbound_messages
    : [];

  let nonPrefillTextCount = 0;
  let allWordsCombined = "";
  let prefillOnlyTexts = 0;
  let anyNonPrefillSignal = false;
  let realSpeechCount = 0;

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
      realSpeechCount++;
      anyNonPrefillSignal = true;
      allWordsCombined += " " + classified.folded;
    }
    if (type === "image" || type === "video" || type === "document") {
      anyNonPrefillSignal = true;
    }
  });

  const hasGenuineKeyword = GENUINE_KEYWORDS.some((kw) => allWordsCombined.includes(kw));
  const hasRealSpeech = realSpeechCount >= 1;

  let isSpam = false;
  let spamReason = "";
  let isPrefillOnly = false;

  if (hasHumanAssignee) {
    isSpam = false;
  } else if (hasGenuineKeyword || hasRealSpeech) {
    isSpam = false;
  } else {
    let audiosCount = 0;
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
        audioClassifications.push(classifyTranscript(getTranscript(m)));
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
        if (cleaned.length <= 5) {
          shortTextsCount++;
        } else {
          nonSpamTextsCount++;
        }
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
      !hasRealSpeech &&
      imagesCount === 0 &&
      (audiosCount === 0 || allAudiosNonVerbal);

    const isSmashText =
      smashTextsCount >= 1 && nonSpamTextsCount === 0 && !hasGenuineKeyword && !hasRealSpeech;
    const isBlacklisted = waId && BLACKLIST.includes(waId);

    isPrefillOnly =
      prefillOnlyTexts >= 1 &&
      nonPrefillTextCount === 0 &&
      !hasGenuineKeyword &&
      !hasRealSpeech &&
      audiosCount === 0 &&
      imagesCount === 0 &&
      smashTextsCount === 0;

    if (isBlacklisted) {
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

  if (!hasHumanAssignee && !hasGenuineKeyword && !hasRealSpeech && !isSpam) {
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

  let spamProfile = null;
  if (isSpam) {
    spamProfile = {
      is_spam: true,
      reason: spamReason,
      classified_at: now,
    };
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

  const stepCount = Number(
    system?.step_count ||
      vars?.system?.step_count ||
      executionContext?.step_count ||
      0
  );

  const shouldIgnore = isSpam || isPrefillOnly;

  let signal;
  let routeReason;

  if (stepCount >= 300 && availableEdges.includes("timeout")) {
    signal = "timeout";
    routeReason = `burst_max_step_count_exit:${stepCount}`;
  } else if (reason === "user_input" && availableEdges.includes("user_input")) {
    signal = "user_input";
    routeReason = "burst_more_messages";
  } else if (shouldIgnore && reason === "timeout" && availableEdges.includes("timeout")) {
    signal = "timeout";
    routeReason = isSpam ? `burst_ignore_spam_timeout_exit:${spamReason}` : "burst_ignore_ads_prefill_timeout_exit";
  } else if (shouldIgnore && availableEdges.includes("ignore")) {
    signal = "ignore";
    routeReason = isSpam ? `burst_ignore_spam:${spamReason}` : "burst_ignore_ads_prefill";
  } else if (availableEdges.includes("timeout")) {
    if (shouldIgnore && availableEdges.includes("user_input") && reason !== "timeout") {
      signal = "user_input";
      routeReason = "burst_ignore_fallback_rewait";
    } else {
      signal = "timeout";
      routeReason = reason === "timeout" ? "burst_silence_timeout" : "burst_default_to_vendor";
    }
  } else if (availableEdges.includes("user_input")) {
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
        service: {
          ...(vars.service || {}),
          last_call_name: "route_customer_burst_resume",
          last_call_status: "ready",
          last_call_at: now,
          burst_resume_reason: reason || null,
          route_reason: routeReason,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
