#!/usr/bin/env node
/* Tests locales: teléfono en texto, skip staff, sticky asesor, sin wa.me falso. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(
  path.join(__dirname, "..", "functions", "on_contact_shared.js"),
  "utf8"
);

function extract(fnName) {
  const start = src.indexOf(`function ${fnName}`);
  if (start < 0) throw new Error(`missing ${fnName}`);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${fnName}`);
}

const sandbox = {};
vm.createContext(sandbox);
for (const name of [
  "compact",
  "digits",
  "parseAsesor",
  "cleanPersonName",
  "pickStickyLead",
  "isStaffOrBusinessPhone",
  "extractPhoneFromText",
  "extractContacts",
  "buildWaMeLink",
]) {
  vm.runInContext(extract(name), sandbox);
}

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log("PASS", name);
  } else {
    fail++;
    console.log("FAIL", name);
  }
}

const sandra = sandbox.extractPhoneFromText({
  type: "text",
  text: { body: "3000000008" },
});
check("text 10-digit mobile", sandra && sandra.phone === "3000000008");
check("text origin", sandra && sandra.origin === "text");

const e164 = sandbox.extractPhoneFromText({
  type: "text",
  text: { body: "3000000008" },
});
check("text e164", e164 && e164.phone === "3000000008");

check(
  "ignore greeting",
  sandbox.extractPhoneFromText({ type: "text", text: { body: "Buenos días" } }) === null
);

check(
  "ignore staff paola as text",
  sandbox.extractPhoneFromText({ type: "text", text: { body: "3213988464" } }) === null
);

const card = sandbox.extractContacts({
  type: "contacts",
  contacts: [
    {
      name: { formatted_name: "Sandra Milena" },
      phones: [{ wa_id: "3000000008", phone: "3000000008" }],
    },
  ],
});
check("contacts formatted_name", card && card.name === "Sandra Milena");
check("contacts phone", card && card.phone === "3000000008");

check(
  "no fake wa.me on short digits",
  sandbox.buildWaMeLink("302389") === null
);
check(
  "wa.me only real e164",
  sandbox.buildWaMeLink("3000000008") ===
    "https://wa.me/3000000008?text=" +
      encodeURIComponent("Hola, le escribo de Life Deportes para confirmar su pedido.")
);

const sticky = sandbox.pickStickyLead([
  {
    id: 3786,
    active: true,
    description: "<!-- kapso:conv=NEW -->\n<p><b>Asignado a: Javier</b></p>",
  },
  {
    id: 3775,
    active: false,
    description: "<!-- kapso:conv=OLD -->\n<p><b>Asignado a: Paola</b></p>",
  },
]);
check("sticky oldest advisor", sticky.asesor === "Paola");
check("write target is active lead", sticky.lead && sticky.lead.id === 3786);
check("sticky source is archived", sticky.sticky && sticky.sticky.id === 3775);

check("staff skip paola", sandbox.isStaffOrBusinessPhone("573213988464") === true);
check("staff skip business", sandbox.isStaffOrBusinessPhone("3000000066") === true);
check("client phone not staff", sandbox.isStaffOrBusinessPhone("3000000008") === false);

console.log(fail ? `\nFAILED ${fail}/${pass + fail}` : `\nOK ${pass}`);
process.exit(fail ? 1 : 0);
