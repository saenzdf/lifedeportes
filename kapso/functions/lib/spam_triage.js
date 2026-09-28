/**
 * Triage spam / Meta Ads prefill (America/Bogota Life).
 * Usado por route_customer_burst_resume y policy_guard_input (misma lógica).
 */

const BLACKLIST = [
  "3000000035",
  "3000000062",
  "3000000030",
  "3000000027",
  "3000000079",
  "3000000063",
  "3000000007",
  "584226400323",
  "3000000078",
  "3000000017",
  "3000000038",
  "3000000033",
  "3000000071",
  "3000000050",
  "3000000044",
  "3000000049",
  "3000000083",
  "3000000012",
  "3000000072",
  "3000000037",
  "3000000075",
  "3000000005",
  "3000000074",
  "584260851544",
  "3000000036",
  "3000000077",
  "3000000057",
  "3000000065",
  "3000000026",
  "3000000073",
  "3000000015",
  "3000000011",
  "3000000076",
  "3000000010",
  "3000000003",
  "3000000041",
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
  const body = getMessageText(msg);
  const m = body.match(/transcript\s*:\s*(.+)$/is);
  if (m && m[1]) return m[1].trim();
  return "";
}

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

function isSalesSpeech(foldedText) {
  return GENUINE_KEYWORDS.some((kw) => foldedText.includes(kw));
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

/**
 * @returns {{ isSpam: boolean, isPrefillOnly: boolean, spamReason: string, hasGenuineKeyword: boolean, hasSalesSpeech: boolean }}
 */
function classifyInboundSpam({ messages, waId, hasHumanAssignee }) {
  const inboundMessages = (messages || []).filter(
    (m) => !m.direction || String(m.direction).toLowerCase() === "inbound"
  );

  let allWordsCombined = "";
  let nonPrefillTextCount = 0;
  let prefillOnlyTexts = 0;
  let anyNonPrefillSignal = false;
  let salesSpeechCount = 0;
  let hasSalesSpeech = false;

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
        hasSalesSpeech = true;
        anyNonPrefillSignal = true;
        allWordsCombined += " " + classified.folded;
      }
    }
    if (type === "image" || type === "video" || type === "document") {
      anyNonPrefillSignal = true;
    }
  });

  const hasGenuineKeyword = GENUINE_KEYWORDS.some((kw) => allWordsCombined.includes(kw));

  let isSpam = false;
  let spamReason = "";
  let isPrefillOnly = false;

  if (hasHumanAssignee) {
    return {
      isSpam: false,
      isPrefillOnly: false,
      spamReason: "",
      hasGenuineKeyword,
      hasSalesSpeech,
    };
  }

  if (hasGenuineKeyword || hasSalesSpeech) {
    return {
      isSpam: false,
      isPrefillOnly: false,
      spamReason: "",
      hasGenuineKeyword,
      hasSalesSpeech,
    };
  }

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
    !hasSalesSpeech &&
    imagesCount === 0 &&
    (audiosCount === 0 || allAudiosNonVerbal);

  const isSmashText =
    smashTextsCount >= 1 && nonSpamTextsCount === 0 && !hasGenuineKeyword && !hasSalesSpeech;
  const isBlacklisted = waId && BLACKLIST.includes(waId);

  // ≥2 audios sin contenido de ropa deportiva / venta (ruido o habla irrelevante)
  const isNonSalesAudioFlood =
    audiosCount >= 2 &&
    salesAudioCount === 0 &&
    nonPrefillTextCount === 0 &&
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
    spamReason =
      "2+ audios sin contexto de ropa deportiva / uniformes — no lead.";
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

  if (!isSpam && !hasGenuineKeyword && !hasSalesSpeech) {
    const onlyPrefill =
      inboundMessages.length > 0 &&
      inboundMessages.every((m) => {
        const type = String(m.message_type || m.type || "").toLowerCase();
        if (
          type === "audio" ||
          type === "image" ||
          type === "video" ||
          type === "sticker" ||
          type === "document"
        ) {
          return false;
        }
        const text = getMessageText(m);
        return !text || isAdsPrefillGreeting(text);
      });
    if (onlyPrefill) isPrefillOnly = true;
  }

  return {
    isSpam,
    isPrefillOnly,
    spamReason,
    hasGenuineKeyword,
    hasSalesSpeech,
  };
}

const SpamTriage = {
  BLACKLIST,
  GENUINE_KEYWORDS,
  fold,
  getMessageText,
  getTranscript,
  classifyTranscript,
  isSalesSpeech,
  isAdsPrefillGreeting,
  isKeyboardSmash,
  classifyInboundSpam,
};

if (typeof module === "object" && module.exports) {
  module.exports = SpamTriage;
}
