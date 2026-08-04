/**
 * route_customer_burst_resume — tras wait_customer_burst (debounce ~30s).
 * timeout / silencio → vendedor; user_input → reinicia el wait;
 * ignore → vuelve al wait sin responder (prefill Meta Ads solo, o spam).
 *
 * Prioridad: ventas legítimas (keywords / audio con contenido comercial) siempre
 * van a vendedor. Prefill "Hola, quiero cotizar uniformes de" solo → ignore.
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};
  const system = executionContext.system || body?.system || {};
  const whatsappContext = body?.whatsapp_context || {};
  const messages = Array.isArray(whatsappContext.messages) ? whatsappContext.messages : [];
  const conversation = whatsappContext.conversation || {};
  const now = new Date().toISOString();

  const BLACKLIST = [
    "3000000035", // Johanna Castellanos
    "3000000062", // Stephany
    "3000000030", // Maria-Luci
    "3000000027", // Que Dios Me Mendiga
    "3000000079", // Kris💜💜
    "3000000063", // Alba Estrada
    "3000000007", // mangonesjoao
    "584226400323", // Yaneida
    "3000000078", // Luis angel Marin
    "3000000017", // Victoria junco
    "3000000038", // Bertha Hernández
    "3000000033", // Te Amo Hija Mía Celeste
    "3000000071", // Michell Girón
    "3000000050", // Yofe
    "3000000044", // Karen Ojeda
    "3000000049",
    "3000000083", // Michel (insultos)
    "3000000012",
    "3000000072",
    "3000000037", // Deymar Y Emma
    "3000000075", // Isaac David
    "3000000005",
    "3000000074",
    "584260851544", // Rosales
    "3000000036", // AE
    "3000000077", // LOA
    "3000000057", // Valledupar
    "3000000065", // gonzalesberriosanapaola
    "3000000026", // cristian
    "3000000073", // Carolina Acosta / Michell
    "3000000015",
    "3000000011", // Sergio
    "3000000076", // Wendy Perez
    "3000000010",
    "3000000003", // spam 2026-07-15 (😍❤️) gibberish + sticker
    "3000000041", // spam 2026-07-15 (anarincon819) pocket dial / child play
  ];

  const GENUINE_KEYWORDS = [
    "uniforme", "camiseta", "buzo", "pantaloneta", "medias", "talla", "futbol",
    "precio", "cotizar", "voley", "voleibol", "baloncesto", "arquero", "diseno", "sublimado",
    "dorsal", "nombre", "estampado", "taller", "pedido", "compra", "cotizacion",
    "presupuesto", "prenda", "tela", "dumonti", "dry", "manga", "cuello", "saco",
    "chaqueta", "pantalon", "licra", "impermeable", "bolsillo", "bordado",
    "vendedor", "asesor", "persona", "atencion", "humano", "atender", "cantidad",
    "unidad", "unidades", "equipo", "club", "colegio",
  ];

  const NON_VERBAL_MARKERS = [
    "silence", "ruido", "background noise", "outro jingle", "pause", "screaming",
    "sniffs", "sliding", "clicking", "musica", "music", "beeping", "throat",
    "inhales", "rain", "background", "noise", "jingle", "crying", "mooing",
    "rustling", "babbling", "paper", "laughter", "laugh", "cough", "sneeze",
    "breathing", "static", "humming", "whistle", "animal", "meow", "bark",
  ];

  const COLOMBIAN_INSULTS = [
    /\bmalparid[oa]/i,
    /\bsapo\b/i,
    /\b(gonorrea|hpta|mierda|hp)\b/i,
    /\bcoma\s+mierda/i,
    /\bhijo\s+de\s+puta/i,
    /\bcarechimba/i,
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
    const direct = msg.content ?? msg.body;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const nested = msg.text;
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
      msg.transcript ?? msg.metadata?.transcript ?? msg.kapso?.transcript
    );
    if (fromFields) return fromFields;
    // Kapso a veces embebe "Transcript: ..." en el body del audio
    const body = getMessageText(msg);
    const m = body.match(/transcript\s*:\s*(.+)$/is);
    if (m && m[1]) return m[1].trim();
    return "";
  }

  /**
   * Clasifica transcripción de audio:
   * - real_speech: habla humana con palabras → siempre contar (venta o no)
   * - non_verbal: silencio / ruido / animal / jingle
   * - empty: sin transcript
   */
  function classifyTranscript(rawText) {
    const original = String(rawText || "").trim();
    if (!original) return { kind: "empty", text: "", folded: "" };

    let folded = fold(original).replace(/\[|\]/g, " ");
    for (const mk of NON_VERBAL_MARKERS) {
      folded = folded.split(mk).join(" ");
    }
    folded = folded.replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();

    const words = folded.split(/\s+/).filter((w) => w.length >= 2);
    const letters = (folded.match(/[a-zñ]/g) || []).length;

    if (words.length >= 3 && letters >= 12) {
      return { kind: "real_speech", text: original, folded };
    }
    if (words.length >= 2 && letters >= 16) {
      return { kind: "real_speech", text: original, folded };
    }
    return { kind: "non_verbal", text: original, folded };
  }

  /** Prefill Meta Ads click-to-WhatsApp (sin deporte / sin pedido real). */
  function isAdsPrefillGreeting(text) {
    const t = fold(text).replace(/\s+/g, " ").trim();
    if (!t) return false;
    return (
      /^hola,?\s*quiero\s+cotizar\s+uniformes\s+de\s*$/.test(t) ||
      /^hola,?\s*quiero\s+cotizar\s+uniformes\s*$/.test(t)
    );
  }

  function isKeyboardSmash(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (t.length < 36) return false;
    if (isAdsPrefillGreeting(t)) return false;
    const folded = fold(t);
    if (GENUINE_KEYWORDS.some((kw) => folded.includes(kw))) return false;
    const tokens = folded.split(/\s+/).filter(Boolean);
    if (tokens.length < 6) return false;
    const shortTok = tokens.filter((x) => x.length <= 3).length;
    const weirdTok = tokens.filter((x) => /[0-9]/.test(x) || /(.)\1{2,}/.test(x) || x.length <= 2).length;
    if (shortTok / tokens.length >= 0.4 && weirdTok / tokens.length >= 0.35) return true;
    if (/(.)\1{4,}/.test(folded)) return true;
    return false;
  }

  const inboundMessages = messages.filter((m) => m.direction === "inbound");

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
  // Habla real en audio (aunque no diga "uniforme") cuenta como lead legítimo
  const hasRealSpeech = realSpeechCount >= 1;

  let isSpam = false;
  let spamReason = "";
  let isPrefillOnly = false;

  if (hasHumanAssignee) {
    isSpam = false;
  } else if (hasGenuineKeyword || hasRealSpeech) {
    // Prioridad ventas: keyword comercial O transcripción con habla real → nunca spam
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

    // Gibberish: ≥2 saludos/textos vacíos Y sin habla real Y sin otro contenido útil
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

    // Prefill Meta solo (o prefill + stickers/ruido sin pedido real)
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

  // Prefill-only también cuando hay genuine path corto-circuitado: recalcular bandera
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

  const shouldIgnore = isSpam || isPrefillOnly;

  let signal;
  let routeReason;
  if (reason === "user_input" && availableEdges.includes("user_input")) {
    signal = "user_input";
    routeReason = "burst_more_messages";
  } else if (shouldIgnore && availableEdges.includes("ignore")) {
    signal = "ignore";
    routeReason = isSpam ? `burst_ignore_spam:${spamReason}` : "burst_ignore_ads_prefill";
  } else if (availableEdges.includes("timeout")) {
    // Fallback: si no hay edge ignore, no mandar spam/prefill al vendedor si podemos
    // quedarnos en user_input; si no, timeout (el prompt del agente también silencia).
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
