/**
 * Lista FORMATO PEDIDO LIFE en PDF (texto embebido, típicamente export del Excel).
 * Extrae strings de streams FlateDecode y reconstruye filas nombre/talla/número.
 * PDF solo-imagen → needs_ocr (ask_about_file / visión).
 */

import { compact, toDetailRow } from "./order_detail_shared.js";
import { inflateSync, unzlibSync } from "./fflate_browser.js";

function trimPdfStreamTail(u8) {
  // PDF often appends \n or \r\n after Flate bytes and before endstream.
  let end = u8.length;
  while (end > 0 && (u8[end - 1] === 0x0a || u8[end - 1] === 0x0d || u8[end - 1] === 0x20)) {
    end -= 1;
  }
  return end === u8.length ? u8 : u8.subarray(0, end);
}

/**
 * Binary ↔ string without TextDecoder("latin1").
 * In CF Workers / Kapso, "latin1" is windows-1252 and remaps 0x80–0x9F
 * (e.g. 0x9C → U+0153 → &0xff = 83), which corrupts PDF Flate streams.
 */
function bytesToBinaryString(u8) {
  const CHUNK = 0x8000;
  let out = "";
  for (let i = 0; i < u8.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CHUNK, u8.length)));
  }
  return out;
}

function binaryStringToBytes(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function inflateWithFflate(u8) {
  const input = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  const trimmed = trimPdfStreamTail(input);
  let lastErr = null;
  for (const buf of [trimmed, input]) {
    try {
      return { ok: true, bytes: unzlibSync(buf) };
    } catch (e) {
      lastErr = e;
    }
    try {
      return { ok: true, bytes: inflateSync(buf) };
    } catch (e) {
      lastErr = e;
    }
    if (buf.length > 6 && buf[0] === 0x78) {
      try {
        return { ok: true, bytes: inflateSync(buf.subarray(2)) };
      } catch (e) {
        lastErr = e;
      }
    }
  }
  return { ok: false, error: String(lastErr?.message || lastErr || "fflate_fail").slice(0, 120) };
}

async function tryDecompressionStream(u8, format) {
  const ds = new DecompressionStream(format);
  const stream = new Blob([u8]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateBytes(raw) {
  const input = raw instanceof Uint8Array ? raw : new Uint8Array(raw);

  // Pure JS (works in Kapso CF Workers + Node) — preferred
  const viaFflate = inflateWithFflate(input);
  if (viaFflate.ok) return viaFflate.bytes;

  // Prefer Node zlib only on real Node
  const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);
  if (isNode) {
    try {
      const zlib = await import("node:zlib");
      const trimmed = trimPdfStreamTail(input);
      for (const buf of [trimmed, input]) {
        try {
          return zlib.inflateSync(buf);
        } catch {
          try {
            return zlib.inflateRawSync(buf);
          } catch {
            /* next */
          }
        }
      }
    } catch {
      /* fall through */
    }
  }

  // Fallback: DecompressionStream (trim trailing PDF EOL)
  if (typeof DecompressionStream !== "undefined") {
    const trimmed = trimPdfStreamTail(input);
    const candidates = [];
    for (const buf of [trimmed, input]) {
      candidates.push(["deflate", buf]);
      if (buf.length > 6 && buf[0] === 0x78) {
        candidates.push(["deflate-raw", buf.subarray(2)]);
        candidates.push(["deflate-raw", buf.subarray(2, buf.length - 4)]);
      } else {
        candidates.push(["deflate-raw", buf]);
      }
    }
    for (const [format, buf] of candidates) {
      try {
        return await tryDecompressionStream(buf, format);
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

function extractLiteralStrings(content) {
  const out = [];
  const reLit = /\((?:\\.|[^\\)])*\)/g;
  let m;
  while ((m = reLit.exec(content))) {
    let s = m[0]
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (s) out.push(s);
  }
  return out;
}

/** Une fragmentos PDF tipo S|AR|A → SARA */
export async function extractPdfEmbeddedText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const latin = bytesToBinaryString(u8);
  const frags = [];
  const reStream = /stream\r?\n([\s\S]*?)endstream/g;
  let sm;
  let streamsFound = 0;
  let inflateOk = 0;
  let firstInflateErr = null;
  let firstHead = null;
  while ((sm = reStream.exec(latin))) {
    streamsFound += 1;
    const raw = binaryStringToBytes(sm[1]);
    if (!firstHead) firstHead = Array.from(raw.slice(0, 4));
    const inflated = await inflateBytes(raw);
    if (!inflated) {
      if (!firstInflateErr) {
        const via = inflateWithFflate(raw);
        firstInflateErr = via.error || "inflate_null";
      }
      continue;
    }
    inflateOk += 1;
    const content = bytesToBinaryString(
      inflated instanceof Uint8Array ? inflated : new Uint8Array(inflated)
    );
    // Fuentes / binario: suelen tener NUL; el contenido de página tiene Tj/TJ + literales.
    if (content.includes("\u0000") && !/\(NOMBRE|\(TALLA|\(Camiseta|\([A-ZÁÉÍÓÚÑ]{3,}/.test(content)) {
      continue;
    }
    if (!/\bTj\b|\bTJ\b/.test(content)) continue;
    const lits = extractLiteralStrings(content);
    if (lits.length < 8) continue;
    frags.push(...lits);
  }
  const joined = frags.join("");
  const hasUsefulText =
    /NOMBRE|TALLA|UNIFORME|Camiseta|BALONCESTO|FUTBOL/i.test(joined) &&
    /\d[A-ZÁÉÍÓÚÑ]/i.test(joined);
  return {
    joined,
    fragmentCount: frags.length,
    hasUsefulText,
    debug: {
      streamsFound,
      inflateOk,
      firstInflateErr,
      firstHead,
      typeofUnzlib: typeof unzlibSync,
      typeofInflate: typeof inflateSync,
      hasBuffer: typeof Buffer !== "undefined",
      hasDS: typeof DecompressionStream !== "undefined",
    },
  };
}

function splitNameTallaNumero(mid) {
  const s = compact(mid);
  if (!s) return null;

  // 14 (S) / 12 (M)
  let m = s.match(/^(.*?)(\d{1,2}\s*\([A-Za-z]+\))(\d{1,3})$/);
  if (m && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(m[1])) {
    return {
      nombre: compact(m[1]),
      talla: compact(m[2]).toUpperCase().replace(/\s+/g, ""),
      numero: m[3],
    };
  }

  // Letter sizes (XL before L/S)
  m = s.match(/^(.*?)(2XL|3XL|4XL|XL|XS|S|M|L)(\d{1,3})$/i);
  if (m && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(m[1])) {
    return {
      nombre: compact(m[1]),
      talla: m[2].toUpperCase(),
      numero: m[3],
    };
  }

  // Numeric talla 2 digits + dorsal
  m = s.match(/^(.*[A-Za-zÁÉÍÓÚÑáéíóúñ.])(\d{2})(\d{1,3})$/);
  if (m) {
    return { nombre: compact(m[1]), talla: m[2], numero: m[3] };
  }

  // Numeric talla 1 digit
  m = s.match(/^(.*[A-Za-zÁÉÍÓÚÑáéíóúñ.])(\d)(\d{1,3})$/);
  if (m) {
    return { nombre: compact(m[1]), talla: m[2], numero: m[3] };
  }

  return null;
}

/**
 * Parsea texto reconstruido FORMATO PEDIDO LIFE (PDF export).
 * @returns {{ ok: boolean, rows: object[], layout: string, meta: object, message?: string }}
 */
export function parseFormatoLifePdfText(joinedText) {
  const joined = String(joinedText || "");
  if (!joined || joined.length < 40) {
    return {
      ok: false,
      rows: [],
      layout: "pdf_empty",
      meta: {},
      error: "no_text",
      message: "PDF sin texto útil; usar ask_about_file (visión/OCR).",
    };
  }

  const disciplinaMatch = joined.match(
    /\b(BALONCESTO|FUTBOL|FÚTBOL|VOLEIBOL|VOLEY|ATLETISMO)\b/i
  );
  const disciplina = disciplinaMatch ? disciplinaMatch[1].toUpperCase() : null;
  const mediaColor = /\bBLANCO\b/i.test(joined)
    ? "BLANCO"
    : /\bNEGRO\b/i.test(joined)
      ? "NEGRO"
      : null;

  const camisetaIdx = joined.search(/Camiseta/i);
  const body =
    camisetaIdx >= 0 ? joined.slice(camisetaIdx + "Camiseta".length) : joined;
  // Cortar cola de género / arquero headers
  const cut = body.search(/GENERO|Uniforme\s*ARQUERO|COMENTARIO/i);
  const playerZone = cut > 0 ? body.slice(0, cut) : body;

  const rowRe = /(\d{1,2})([\s\S]*?)ESQUELETO\s*X/gi;
  const rows = [];
  let m;
  while ((m = rowRe.exec(playerZone))) {
    const idx = m[1];
    const mid = m[2];
    const split = splitNameTallaNumero(mid);
    if (!split?.nombre) continue;
    const camiseta = true; // columna Camiseta marcada con X en este layout
    rows.push(
      toDetailRow({
        nombre_uniforme: split.nombre,
        talla: split.talla,
        numero: split.numero,
        grupo: null,
        camiseta,
        uniforme: !camiseta,
        comentario: [
          "ESQUELETO",
          disciplina ? `disciplina ${disciplina}` : null,
          mediaColor ? `media ${mediaColor}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        product_text: camiseta
          ? "Camiseta deportiva dry-fit"
          : disciplina
            ? `Uniforme de ${disciplina}`
            : "Uniforme",
        category: camiseta ? "camiseta" : "uniforme",
        garment_type: camiseta ? "camiseta" : "uniforme",
        raw_text: `${idx} ${split.nombre} ${split.talla} ${split.numero}`,
      })
    );
  }

  // Fallback: filas sin token ESQUELETO (otros exports)
  if (!rows.length) {
    const altRe =
      /(\d{1,2})([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-z0-9. ]{1,40}?)(?=\d{1,2}[A-ZÁÉÍÓÚÑ]|$)/g;
    // too loose — skip
  }

  if (!rows.length) {
    return {
      ok: false,
      rows: [],
      layout: "pdf_unparsed",
      meta: { disciplina, mediaColor },
      error: "formato_no_reconocido",
      message:
        "PDF con texto pero no FORMATO LIFE reconocible. Usar ask_about_file o Excel.",
    };
  }

  return {
    ok: true,
    rows,
    layout: "formato_life_pdf_v1",
    meta: {
      disciplina,
      media_color: mediaColor,
      print_style: "ESQUELETO",
      source: "pdf_embedded_text",
    },
    sheetName: "PDF",
  };
}

/**
 * @param {Uint8Array} bytes
 * @param {string} filename
 */
export async function parseLifePdfListBytes(bytes, filename = "lista.pdf") {
  const name = compact(filename) || "lista.pdf";
  if (!/\.pdf$/i.test(name) && bytes?.[0] !== 0x25) {
    // %PDF
    const head = new TextDecoder("latin1").decode(bytes.slice(0, 5));
    if (head !== "%PDF-") {
      return {
        ok: false,
        rows: [],
        error: "not_pdf",
        message: "El archivo no es PDF.",
      };
    }
  }

  const extracted = await extractPdfEmbeddedText(bytes);
  if (!extracted.hasUsefulText) {
    return {
      ok: false,
      rows: [],
      layout: "pdf_image_only",
      error: "needs_ocr",
      needs_ocr: true,
      message:
        "PDF sin capa de texto (solo imagen). En staff: ask_about_file con la pregunta fija de lista, luego parsear_lista_pdf_pedido / imagen.",
      fragmentCount: extracted.fragmentCount,
      extract_debug: extracted.debug || null,
    };
  }

  const parsed = parseFormatoLifePdfText(extracted.joined);
  return {
    ...parsed,
    filename: name,
    fragmentCount: extracted.fragmentCount,
  };
}

export const FIXED_PDF_LIST_QUESTION =
  "Este archivo es una lista de pedido Life (FORMATO PEDIDO LIFE en PDF). Extrae SOLO un JSON array de objetos con keys: numero, nombre, talla, manga, genero (masculino|femenino), arquero (true|false). Incluye todas las filas. Sin markdown ni texto extra.";
