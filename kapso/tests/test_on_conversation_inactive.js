#!/usr/bin/env node
/**
 * node kapso/tests/test_on_conversation_inactive.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const src = fs.readFileSync(
  path.join(__dirname, "..", "functions", "on_conversation_inactive.js"),
  "utf8"
);
const code = src.replace(/\n\{ handler \};\s*$/, "\n");
const ctx = { console, Set, URL, URLSearchParams, Response, fetch: async () => ({}) };
vm.createContext(ctx);
vm.runInContext(
  `${code}\nthis.__extract = extractConversation;\nthis.__should = shouldEndWaiting;\nthis.__staff = isStaffPhone;`,
  ctx
);

let pass = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
  } catch (err) {
    console.error("FAIL", name, err.message);
    process.exitCode = 1;
  }
}

check("v2 payload conversation.id", () => {
  const out = ctx.__extract({
    conversation: { id: "conv-1", phone_number: "573001112233" },
    inactivity: { minutes: 180 },
  });
  assert.strictEqual(out.conversationId, "conv-1");
  assert.strictEqual(out.phone, "573001112233");
});

check("staff phone skip", () => {
  assert.strictEqual(ctx.__staff("573213988464"), true);
  assert.strictEqual(ctx.__staff("573001112233"), false);
});

check("vendor waiting daytime → end", () => {
  const exec = {
    status: "waiting",
    current_step: { identifier: "agent_orquestador_1745500003000" },
  };
  const day = new Date("2026-08-25T15:00:00.000Z");
  assert.strictEqual(ctx.__should(exec, "573001112233", day), true);
});

check("vendor waiting night → keep", () => {
  const exec = {
    status: "waiting",
    current_step: { identifier: "agent_orquestador_1745500003000" },
  };
  const night = new Date("2026-08-26T01:00:00.000Z");
  assert.strictEqual(ctx.__should(exec, "573001112233", night), false);
});

check("staff agent waiting → keep", () => {
  const exec = {
    status: "waiting",
    current_step: { identifier: "agent_1780762885818" },
  };
  const day = new Date("2026-08-25T15:00:00.000Z");
  assert.strictEqual(ctx.__should(exec, "573213988464", day), false);
});

check("zombie waiting no step daytime → end", () => {
  const exec = { status: "waiting", current_step: null };
  const day = new Date("2026-08-25T15:00:00.000Z");
  assert.strictEqual(ctx.__should(exec, "573001112233", day), true);
});

if (process.exitCode) process.exit(1);
console.log(`test_on_conversation_inactive ok ${pass}`);
