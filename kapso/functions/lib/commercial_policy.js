/**
 * Políticas comerciales fijas Life (vendedor).
 * Fuente alineada con prompt FAQ + KB life_reglas_comerciales.
 * Usado por product_match_engine y quote_intent_parser (y bundles Kapso).
 */

export const SPORTS_ALLOWED_ES = "fútbol, baloncesto, voleibol y atletismo";

/** Términos normalizados (sin tildes) de deportes que NO fabricamos. */
export const SPORT_DECLINED_TERMS = [
  "natacion",
  "swimming",
  "ciclismo",
  "cycling",
  "beisbol",
  "baseball",
  "hockey",
  "patinaje",
  "motocross",
  "motociclismo",
  "equitacion",
  "porras",
  "cheer",
  "rugby",
  "tenis",
  "padel",
  "paddle",
  "waterpolo",
  "handball",
  "balonmano",
];

export const FIXED_REPLIES = {
  descuento:
    "Somos fabricantes: el precio ya es el mínimo de catálogo; no manejamos rebaja adicional por cantidad.",
  direccion:
    "Estamos en la Cl. 66a #98a 12, barrio Los Álamos, Engativá, Bogotá. Puede ver el mapa aquí: https://maps.google.com/?cid=12304529363039725410",
  catalogo: "Puede ver el catálogo en https://lifedeportes.odoo.com/shop",
  pago:
    "Abono del 50% para iniciar y el 50% restante para hacer el envío (o al pasar a recogerlo en fábrica). La cuenta o medio exacto se lo indica el asesor al confirmar el pedido.",
  contra_entrega:
    "No manejamos pago contra entrega del pedido: se abona el 50% para iniciar la elaboración y el 50% restante para hacer el envío (o al recoger en fábrica).",
  envios:
    "Sí, tenemos envíos nacionales por cobrar: despachamos por transportadora y el valor del flete se paga al recibir.",
  logo_marca_ropa:
    "No podemos copiar logos comerciales de marcas de ropa deportiva (por ejemplo Nike, Adidas, Puma, Saeta o FSS), para no hacer copias piratas. Las camisetas pueden ser muy parecidas en diseño, y sí sublimamos el logo o escudo de su empresa, de su equipo, de un país u otros gráficos propios que nos envíen.",
  uniforme_incluye:
    "El uniforme incluye camiseta y pantaloneta (en fútbol base también medias).",
};

export function sportLabelEs(detected) {
  const d = String(detected || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^declined:/, "");
  const map = {
    natacion: "natación",
    swimming: "natación",
    ciclismo: "ciclismo",
    cycling: "ciclismo",
    beisbol: "béisbol",
    baseball: "béisbol",
    hockey: "hockey",
    patinaje: "patinaje",
    motocross: "motocross",
    motociclismo: "motociclismo",
    equitacion: "equitación",
    porras: "porras",
    cheer: "porras",
    rugby: "rugby",
    tenis: "tenis",
    padel: "pádel",
    paddle: "pádel",
    waterpolo: "waterpolo",
    handball: "balonmano",
    balonmano: "balonmano",
  };
  return map[d] || d || "ese deporte";
}

export function declinedSportReply(sportDetected) {
  const label = sportLabelEs(sportDetected);
  return `Por ahora no fabricamos uniformes de ${label}. Trabajamos ${SPORTS_ALLOWED_ES}.`;
}

/**
 * FAQ no-producto: el agente debe responder con frase fija y NO llamar buscar_producto_odoo.
 * @param {string} text
 * @returns {{ intent: string, customer_reply_es: string, do_not_search: true } | null}
 */
export function detectFaqPolicyIntent(text) {
  const t = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;

  // Descuento / mayooreo (antes que "cantidad" genérico de pedido)
  if (
    /\b(descuento|rebaja|rebajar|mayooreo|mayorista)\b/.test(t) ||
    /\bpor\s+(cantidad|volumen)\b/.test(t) ||
    /\b(si\s+(pido|llevo|compro)\s+\d+|por\s+\d+\s*(unidades?|uniformes?))\b/.test(t) &&
      /\b(descuento|rebaja|mas\s+barato|mejor\s+precio)\b/.test(t)
  ) {
    return {
      intent: "descuento",
      customer_reply_es: FIXED_REPLIES.descuento,
      do_not_search: true,
    };
  }

  if (
    /\b(donde\s+estan|donde\s+queda|ubicacion|direccion|punto\s+fisico|me\s+dirijo|me\s+acerco|visita(r)?\s+la\s+fabrica)\b/.test(
      t
    )
  ) {
    return {
      intent: "direccion",
      customer_reply_es: FIXED_REPLIES.direccion,
      do_not_search: true,
    };
  }

  if (
    /\b(catalogo|ver\s+productos|link\s+(de\s+)?(la\s+)?tienda|manda(r)?\s+el\s+catalogo|pagina\s+web\s+de\s+productos)\b/.test(
      t
    )
  ) {
    return {
      intent: "catalogo",
      customer_reply_es: FIXED_REPLIES.catalogo,
      do_not_search: true,
    };
  }

  if (
    /\b(como\s+pago|medios?\s+de\s+pago|transferencia|nequi|cuenta\s+bancaria|a\s+que\s+cuenta)\b/.test(
      t
    ) ||
    (/\babono\b/.test(t) && /\b(como|cual|porcentaje|50\s*%|cincuenta)\b/.test(t))
  ) {
    return {
      intent: "pago",
      customer_reply_es: FIXED_REPLIES.pago,
      do_not_search: true,
    };
  }

  if (
    /\benvios?\s+nacionales?\b/.test(t) ||
    /\bhace(n)?\s+envios?\b/.test(t) ||
    (/\b(envio|envios|despacho|transportadora|flete)\b/.test(t) &&
      /\b(nacional|colombia|medellin|cali|barranquilla|fuera\s+de\s+bogota)\b/.test(t))
  ) {
    return {
      intent: "envios",
      customer_reply_es: FIXED_REPLIES.envios,
      do_not_search: true,
    };
  }

  if (
    /\b(logo|escudo)\b/.test(t) &&
    /\b(nike|adidas|puma|saeta|fss)\b/.test(t)
  ) {
    return {
      intent: "logo_marca_ropa",
      customer_reply_es: FIXED_REPLIES.logo_marca_ropa,
      do_not_search: true,
    };
  }

  if (
    /\b(que\s+incluye|incluye\s+el\s+uniforme|trae\s+pantalon|trae\s+pantaloneta|que\s+trae\s+el\s+uniforme)\b/.test(
      t
    )
  ) {
    return {
      intent: "uniforme_incluye",
      customer_reply_es: FIXED_REPLIES.uniforme_incluye,
      do_not_search: true,
    };
  }

  return null;
}
