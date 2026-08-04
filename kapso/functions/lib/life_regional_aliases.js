/**
 * Sinónimos regionales / coloquiales Life (CO) → boost de match semántico.
 * No inventa producto: solo suma score si el texto del cliente incluye la frase
 * y el producto candidato es de la categoría/familia indicada.
 */
export const LIFE_REGIONAL_ALIASES = [
  // camiseta sola
  { phrases: ["camiseta", "camisa", "franela", "polo seco", "dry fit sola"], category: "camiseta", boost: 12 },
  { phrases: ["solo la camiseta", "solo camisetas", "camiseta suelta", "sin pantaloneta"], category: "camiseta", boost: 18 },
  // uniforme
  { phrases: ["uniforme", "kit", "equipacion", "equipación", "completo"], category: "uniforme", boost: 12 },
  { phrases: ["indumentaria", "ropa del equipo", "la muda"], category: "uniforme", boost: 10 },
  // fútbol
  { phrases: ["futbol", "fútbol", "soccer", "pichi", "pichy"], sport: "futbol", boost: 8 },
  // arquero
  { phrases: ["arquero", "portero", "golero", "keeper"], nameIncludes: ["arquero"], boost: 16 },
  // sudadera / buzo
  { phrases: ["buzo", "buso", "hoodie", "sudadera", "conjunto frio", "conjunto frío"], nameIncludes: ["sudadera", "buzo", "buso"], boost: 14 },
  // chaqueta
  { phrases: ["rompe viento", "rompevientos", "impermeable", "chompa", "chaqueta lluvia"], nameIncludes: ["chaqueta", "rompe"], boost: 12 },
  // medias
  { phrases: ["medias", "calcetas", "calcetines", "socks"], category: "medias", boost: 10 },
  // pantaloneta
  { phrases: ["pantaloneta", "short", "shortcito", "bermuda deporte"], category: "pantaloneta", boost: 10 },
];

export function regionalAliasBoost(product, combinedText, normalizeTextFn) {
  const norm = normalizeTextFn || ((v) => String(v || "").toLowerCase());
  const t = norm(combinedText);
  const name = norm(product?.name || "");
  const category = String(product?.category || "").toLowerCase();
  let boost = 0;
  for (const rule of LIFE_REGIONAL_ALIASES) {
    const hit = (rule.phrases || []).some((p) => t.includes(norm(p)));
    if (!hit) continue;
    if (rule.category && category !== rule.category) continue;
    if (rule.nameIncludes && !rule.nameIncludes.some((n) => name.includes(norm(n)))) continue;
    if (rule.sport && !(product?.name && norm(product.name).includes(norm(rule.sport)))) {
      // sport soft: still allow small boost via phrase if category matches uniforme
      if (category !== "uniforme") continue;
    }
    boost += Number(rule.boost || 0);
  }
  return boost;
}
