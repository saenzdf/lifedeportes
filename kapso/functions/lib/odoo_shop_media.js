/**
 * Tienda Odoo — URLs públicas e imágenes para buscar_producto_odoo.
 */

export function shopPublicBase(env) {
  return String(env.ODOO_SHOP_PUBLIC_URL || env.ODOO_URL || "")
    .replace(/\/$/, "");
}

export function buildProductPageUrl(base, websiteUrl) {
  if (!base) return null;
  if (!websiteUrl) return `${base}/shop`;
  if (/^https?:\/\//i.test(websiteUrl)) return websiteUrl;
  return `${base}${websiteUrl.startsWith("/") ? "" : "/"}${websiteUrl}`;
}

export function buildProductImageUrl(base, templateId) {
  if (!base || !templateId) return null;
  return `${base}/web/image/product.template/${templateId}/image_512`;
}

export function isShopPhotoRequest(text, input = {}) {
  if (input.include_shop_media === true || input.shop_request === "photos") return true;
  const t = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t.trim()) return false;
  return /\b(fotos?|imagenes?|imagen|referencia visual|ver (el )?producto|catalogo|tienda en linea|link de la tienda|pagina web|pagina del producto)\b/.test(
    t
  );
}

export function preferPublishedCatalogMatch(local, catalog, preferPublished = false) {
  if (!local?.found || !preferPublished) return local;
  const products = catalog?.products || [];
  const exact = products.find((p) => p.odoo_id === local.odoo_template_id);
  return {
    ...local,
    catalog_published: Boolean(exact?.is_published),
    published_match_switched: false,
  };
}

export async function odooRpc(env, params) {
  const resp = await fetch(`${env.ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params }),
  });
  const json = await resp.json();
  if (json?.error) throw new Error(json.error?.message || "Odoo RPC error");
  return json.result;
}

async function odooUid(env) {
  const uid = await odooRpc(env, {
    service: "common",
    method: "authenticate",
    args: [env.ODOO_DB, env.ODOO_USERNAME, env.ODOO_PASSWORD, {}],
  });
  return uid || null;
}

export function mapShopRow(env, row) {
  if (!row?.id) return null;
  const base = shopPublicBase(env);
  return {
    id: row.id,
    name: row.name,
    unit_cop: Math.round(Number(row.list_price || 0)),
    is_published: Boolean(row.is_published),
    website_url: row.website_url || null,
    description_sale: row.description_sale || null,
    shop_page_url: buildProductPageUrl(base, row.website_url),
    shop_image_url: buildProductImageUrl(base, row.id),
    shop_home_url: base ? `${base}/shop` : null,
  };
}

export async function fetchOdooTemplateLive(env, templateId, fallbackName) {
  try {
    if (!env.ODOO_URL) return null;
    const uid = await odooUid(env);
    if (!uid) return null;
    const rows = await odooRpc(env, {
      service: "object",
      method: "execute_kw",
      args: [
        env.ODOO_DB,
        uid,
        env.ODOO_PASSWORD,
        "product.template",
        "search_read",
        [[["id", "=", templateId], ["sale_ok", "=", true]]],
        {
          fields: [
            "id",
            "name",
            "list_price",
            "is_published",
            "website_url",
            "description_sale",
            "website_sequence",
          ],
          limit: 1,
        },
      ],
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.id) return null;
    const mapped = mapShopRow(env, row);
    if (fallbackName && !mapped.name) mapped.name = fallbackName;
    return mapped;
  } catch {
    return null;
  }
}

export async function searchPublishedShopProducts(env, { query = "", limit = 6 } = {}) {
  try {
    if (!env.ODOO_URL) return [];
    const uid = await odooUid(env);
    if (!uid) return [];
    const domain = [
      ["sale_ok", "=", true],
      ["is_published", "=", true],
    ];
    const q = String(query || "").trim();
    if (q && !/^(fotos?|imagenes?|catalogo|tienda)$/i.test(q)) {
      domain.push(["name", "ilike", q]);
    }
    const rows = await odooRpc(env, {
      service: "object",
      method: "execute_kw",
      args: [
        env.ODOO_DB,
        uid,
        env.ODOO_PASSWORD,
        "product.template",
        "search_read",
        [domain],
        {
          fields: ["id", "name", "list_price", "is_published", "website_url", "description_sale"],
          limit: Math.min(Math.max(limit, 1), 12),
          order: "website_sequence asc, name asc",
        },
      ],
    });
    return (Array.isArray(rows) ? rows : []).map((row) => mapShopRow(env, row)).filter(Boolean);
  } catch {
    return [];
  }
}

function normLite(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function fetchVariantExtras(env, templateId) {
  try {
    if (!env.ODOO_URL || !templateId) return [];
    const uid = await odooUid(env);
    if (!uid) return [];
    const rows = await odooRpc(env, {
      service: "object",
      method: "execute_kw",
      args: [
        env.ODOO_DB,
        uid,
        env.ODOO_PASSWORD,
        "product.template.attribute.value",
        "search_read",
        [[["product_tmpl_id", "=", templateId], ["price_extra", ">", 0]]],
        { fields: ["name", "attribute_id", "price_extra"], limit: 40 },
      ],
    });
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      name: r.name,
      attribute: Array.isArray(r.attribute_id) ? r.attribute_id[1] : null,
      extra_cop: Math.round(Number(r.price_extra || 0)),
    }));
  } catch {
    return [];
  }
}

/**
 * Cruza atributos con price_extra de Odoo contra la intención parseada
 * (collar/sleeves/material/shortType) y devuelve solo los sobrecostos pedidos.
 */
export function matchRequestedExtras(extras, parsed = {}) {
  if (!Array.isArray(extras) || !extras.length) return [];
  const picked = [];
  const find = (nameRe, attrRe = null) =>
    extras.find(
      (e) =>
        nameRe.test(normLite(e.name)) && (!attrRe || attrRe.test(normLite(e.attribute)))
    );

  const rules = [
    [parsed.withLining === "con_forro", () => find(/con\s*forro/, /forro/)],
    [parsed.sleeves === "manga_larga", () => find(/^larga$/, /manga/)],
    [parsed.collar === "cuello_sport", () => find(/sport|personalizado/, /cuello/)],
    [parsed.material === "dumonti", () => find(/dumonti/, /tela/)],
    [parsed.shortType === "impermeable", () => find(/impermeable/, /pantalon/)],
    [parsed.shortType === "bolsillos", () => find(/bolsillos/, /pantalon/)],
    [parsed.shortType === "lycra", () => find(/licra|lycra/, /pantalon/)],
  ];
  for (const [wanted, get] of rules) {
    if (!wanted) continue;
    const hit = get();
    if (hit && !picked.includes(hit)) picked.push(hit);
  }
  return picked;
}

export function compactShopPayload(shop) {
  if (!shop) return null;
  return {
    odoo_template_id: shop.id,
    name: shop.name,
    is_published: shop.is_published,
    page_url: shop.shop_page_url,
    image_url: shop.shop_image_url,
    shop_home_url: shop.shop_home_url,
    description_sale: shop.description_sale,
    unit_cop: shop.unit_cop || null,
  };
}
