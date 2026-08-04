#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  isShopPhotoRequest,
  preferPublishedCatalogMatch,
  buildProductPageUrl,
  buildProductImageUrl,
  compactShopPayload,
} from "../functions/lib/odoo_shop_media.js";

assert.equal(isShopPhotoRequest("me envias fotos del uniforme de futbol", {}), true);
assert.equal(isShopPhotoRequest("quiero cotizar 10 camisetas", {}), false);
assert.equal(isShopPhotoRequest("", { include_shop_media: true }), true);

const catalog = {
  products: [
    { odoo_id: 999, name: "No publicado", is_published: false, list_price_cop: 1 },
    { odoo_id: 115, name: "Uniforme Futbol", is_published: true, list_price_cop: 2 },
  ],
};
const exactOnly = preferPublishedCatalogMatch(
  {
    found: true,
    odoo_template_id: 999,
    match_name: "No publicado",
    alternatives: [{ odoo_id: 115, name: "Uniforme Futbol" }],
    parsed: { quantity: 10 },
  },
  catalog,
  true
);
assert.equal(exactOnly.odoo_template_id, 999);
assert.equal(exactOnly.match_name, "No publicado");
assert.equal(exactOnly.published_match_switched, false);
assert.equal(exactOnly.catalog_published, false);

assert.equal(
  buildProductPageUrl("https://lifedeportes.odoo.com", "/shop/uniforme-115"),
  "https://lifedeportes.odoo.com/shop/uniforme-115"
);
assert.equal(
  buildProductImageUrl("https://lifedeportes.odoo.com", 115),
  "https://lifedeportes.odoo.com/web/image/product.template/115/image_512"
);
assert.equal(compactShopPayload(null), null);

console.log("odoo shop media tests OK");
