/**
 * Extrae filas de lista desde imagen (o PDF raster) vía Gemini multimodal.
 * Secrets: GEMINI_API_KEY, opcional GEMINI_MODEL (default gemini-2.5-flash).
 */

import { compact } from "./order_detail_shared.js";

export const FIXED_LIST_VISION_QUESTION =
  "Este archivo es una lista de pedido Life (nombres, tallas, dorsales). Extrae SOLO un JSON array de objetos con keys: numero, nombre, talla, manga, genero (masculino|femenino), arquero (true|false), camiseta (true|false), uniforme (true|false), cantidad (number). Incluye todas las filas. Sin markdown ni texto extra.";

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function extractJsonArray(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : raw;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const arr = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function toDetailRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const numero = compact(raw.numero || raw.number || raw.dorsal || "");
  const nombre = compact(raw.nombre || raw.name || "");
  const talla = compact(raw.talla || raw.size || "");
  if (!nombre && !numero && !talla) return null;
  let grupo = compact(raw.genero || raw.grupo || raw.gender || "").toLowerCase();
  if (/fem|mujer/.test(grupo)) grupo = "femenino";
  else if (/masc|hombre/.test(grupo)) grupo = "masculino";
  else grupo = grupo || "general";
  const arquero = Boolean(raw.arquero);
  const camiseta = Boolean(raw.camiseta);
  const uniforme = raw.uniforme === false ? false : Boolean(raw.uniforme) || (!camiseta && !arquero);
  return {
    person_id: null,
    numero,
    nombre: nombre || (arquero ? (numero ? `Arquero #${numero}` : "Arquero") : ""),
    talla,
    grupo,
    rol: arquero ? "Arquero" : camiseta ? "Camiseta" : "Uniforme",
    manga: compact(raw.manga || "") || "Corta",
    cantidad: Math.max(1, Number(raw.cantidad || raw.quantity || 1) || 1),
    manga_parts: null,
    arquero,
    camiseta,
    uniforme: uniforme || (!camiseta && !Boolean(raw.pantaloneta)),
    pantaloneta: Boolean(raw.pantaloneta),
    comentario: compact(raw.comentario || ""),
    product_choice_hint: null,
    registro: null,
    nombre_vacio_impresion: false,
    impresion_delantera: null,
    impresion_trasera: null,
    product_line_key: null,
    product_text: null,
    garment_type: null,
    category: null,
    variant_notes: null,
  };
}

/**
 * @param {Uint8Array} bytes
 * @param {{ mime?: string, filename?: string, apiKey?: string, model?: string, question?: string }} opts
 */
export async function parseListaImageWithGemini(bytes, opts = {}) {
  const apiKey = compact(opts.apiKey || "");
  if (!apiKey) {
    return {
      ok: false,
      needs_vision: true,
      error: "missing_gemini_key",
      message: "Falta GEMINI_API_KEY para interpretar imagen/PDF raster.",
      rows: [],
    };
  }
  if (!bytes?.length) {
    return { ok: false, error: "empty_bytes", rows: [] };
  }
  // Cap ~3.5MB base64 payload
  if (bytes.length > 3_500_000) {
    return {
      ok: false,
      error: "image_too_large",
      message: "Imagen demasiado grande (>3.5MB). Sube Excel o comprime la foto.",
      rows: [],
    };
  }

  const mime =
    compact(opts.mime) ||
    (/\.png$/i.test(opts.filename || "") ? "image/png" : "image/jpeg");
  const model = compact(opts.model) || "gemini-2.5-flash";
  const question = compact(opts.question) || FIXED_LIST_VISION_QUESTION;
  const b64 = bytesToBase64(bytes);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: question },
            { inline_data: { mime_type: mime, data: b64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: "gemini_http",
      message: String(json?.error?.message || res.status).slice(0, 300),
      rows: [],
    };
  }
  const text = (json?.candidates || [])
    .map((c) => (c?.content?.parts || []).map((p) => p.text || "").join(""))
    .join("\n");
  const arr = extractJsonArray(text);
  if (!arr?.length) {
    return {
      ok: false,
      error: "vision_no_rows",
      message: "Gemini no devolvió filas de lista legibles.",
      rows: [],
      raw_preview: String(text || "").slice(0, 400),
    };
  }
  const rows = arr.map(toDetailRow).filter(Boolean);
  if (!rows.length) {
    return { ok: false, error: "vision_rows_empty", rows: [], message: "Filas vacías tras normalizar." };
  }
  return {
    ok: true,
    layout: "vision_gemini_v1",
    filename: opts.filename || "lista-imagen",
    rows,
    sheetName: "",
    grid: null,
  };
}
