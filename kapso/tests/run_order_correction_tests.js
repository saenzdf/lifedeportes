#!/usr/bin/env node
/** Tests corrección pedidos staff (número corto, patch, etapas, sesión). */
import assert from "node:assert/strict";
import {
  isStageEditable,
  buildCorrectionChatterHtml,
  bareOrderNumber,
  bareOrderNumberFromName,
  orderNameCandidates,
  odooOrDomain,
  patchDetailRows,
  parseDetailRowsFromNoteHtml,
  detectProductMixChanges,
  summarizeListDiff,
  rowProductBucket,
  extractOrderNumberFromText,
  extractCustomerNameFromText,
  waMessageText,
  resolveStaffOrderSearchInput,
} from "../functions/lib/odoo_order_correction.js";
import {
  clearOrderSessionVars,
  detectOrderSessionSwitch,
  isLikelyListPatchMessage,
  namesLikelyDifferent,
  orderSessionMismatch,
  readOrderSession,
  buildOrderSession,
} from "../functions/lib/staff_order_session.js";

function testProductMix() {
  const oldRows = [
    { nombre: "A", talla: "M", manga: "corta" },
    { nombre: "B", talla: "L", manga: "corta" },
  ];
  const newRows = [
    { nombre: "A", talla: "M", manga: "larga" },
    { nombre: "B", talla: "L", manga: "corta" },
  ];
  assert.equal(detectProductMixChanges(oldRows, newRows), true);
  const onlyTalla = [
    { nombre: "A", talla: "L", manga: "corta" },
    { nombre: "B", talla: "L", manga: "corta" },
  ];
  assert.equal(detectProductMixChanges(oldRows, onlyTalla), false);
  assert.equal(rowProductBucket({ nombre: "X", manga: "larga" }), "manga_larga");
  assert.match(summarizeListDiff(oldRows, onlyTalla), /talla|nombre|fila/i);
}

function testStageLock() {
  assert.equal(isStageEditable("Coordinación Diseño"), true);
  assert.equal(isStageEditable("A imprimir"), false);
  assert.equal(isStageEditable("Fabricación"), false);
}

function testBareNumber() {
  assert.equal(bareOrderNumber("2564"), "2564");
  assert.equal(bareOrderNumber("02564"), "2564");
  assert.equal(bareOrderNumber("S02564"), "2564");
  assert.equal(bareOrderNumberFromName("S02564"), "2564");
  assert.deepEqual(orderNameCandidates("2564"), ["S02564", "S2564"]);
  assert.deepEqual(odooOrDomain([["name", "=", "A"], ["name", "=", "B"]]), [
    "|",
    ["name", "=", "A"],
    ["name", "=", "B"],
  ]);
  assert.deepEqual(odooOrDomain([["name", "=", "A"]]), [["name", "=", "A"]]);
}

function testThreadResolve() {
  assert.equal(extractOrderNumberFromText("corregir pedido 2564"), "2564");
  assert.equal(extractOrderNumberFromText("actualizar pedido 2564"), "2564");
  assert.equal(extractOrderNumberFromText("modificar 2564"), "2564");
  assert.equal(extractOrderNumberFromText("S02564 lista nueva"), "2564");
  const r = resolveStaffOrderSearchInput({
    execution_context: {
      vars: {
        order_correction: { target_order_id: 99, target_order_name: "S02564" },
      },
    },
    whatsapp_context: { messages: [] },
  });
  assert.equal(r.already_resolved, true);
  assert.equal(r.order_id, 99);
  const fromMsg = resolveStaffOrderSearchInput({
    execution_context: { vars: {} },
    whatsapp_context: {
      messages: [{ direction: "inbound", content: "actualizar pedido 1234" }],
    },
  });
  assert.equal(fromMsg.order_number, "1234");
  assert.equal(fromMsg.source, "whatsapp_thread");

  const fromWaCloud = resolveStaffOrderSearchInput({
    execution_context: { vars: {} },
    whatsapp_context: {
      messages: [
        {
          direction: "inbound",
          text: { body: "actualizar pedido 2564 Daniel Beltran" },
        },
      ],
    },
  });
  assert.equal(fromWaCloud.order_number, "2564");
  assert.equal(fromWaCloud.customer_name, "Daniel Beltran");
  assert.equal(fromWaCloud.source, "whatsapp_thread");

  assert.equal(waMessageText({ text: { body: "hola" } }), "hola");
  assert.equal(extractCustomerNameFromText("pedido de Daniel Beltran"), "Daniel Beltran");
}

function testOrderSessionIsolation() {
  assert.equal(namesLikelyDifferent("FREDY BRAM", "DANIEL TOVAR"), true);
  assert.equal(namesLikelyDifferent("FREDY BRAM", "Fredy Bram"), false);
  assert.equal(isLikelyListPatchMessage("ODALINDA ES UNIFORME FEMENINO"), true);
  assert.equal(isLikelyListPatchMessage("Retoma este pedido *2789] FREDY BRAM*"), false);

  const fredySession = buildOrderSession({
    orderId: 2787,
    orderName: "S02789",
    displayName: "FREDY BRAM",
  });
  assert.equal(fredySession.order_id, 2787);

  const patchKeep = detectOrderSessionSwitch({
    session: fredySession,
    messageText: "ODALINDA ES UNIFORME FEMENINO",
  });
  assert.equal(patchKeep.switch, false);
  assert.equal(patchKeep.reason, "list_patch");

  const switchNum = detectOrderSessionSwitch({
    session: fredySession,
    incomingOrderName: "S02800",
    incomingDisplayName: "DANIEL TOVAR",
    messageText: "Retoma pedido S02800 DANIEL TOVAR",
  });
  assert.equal(switchNum.switch, true);
  assert.equal(switchNum.reason, "order_number");

  const switchNameAmbiguous = detectOrderSessionSwitch({
    session: fredySession,
    messageText: "ahora el pedido de Daniel Tovar",
  });
  assert.equal(switchNameAmbiguous.switch, true);
  assert.equal(switchNameAmbiguous.ambiguous, true);

  const cleared = clearOrderSessionVars();
  assert.equal(cleared.order_draft.detail.rows.length, 0);
  assert.equal(cleared.order_session, null);

  const mismatch = orderSessionMismatch(
    {
      order_session: fredySession,
      order_draft: { detail: { rows: [{ nombre: "ODALINDA" }] } },
    },
    9999
  );
  assert.equal(mismatch.status, "order_session_mismatch");

  const sameOk = orderSessionMismatch(
    { order_session: fredySession, order_draft: { detail: { rows: [] } } },
    2787
  );
  assert.equal(sameOk, null);

  const switched = resolveStaffOrderSearchInput({
    execution_context: {
      vars: {
        order_session: fredySession,
        order_correction: { target_order_id: 2787, target_order_name: "S02789" },
        order: { id: 2787, name: "S02789" },
        order_draft: { detail: { rows: [{ nombre: "ODALINDA" }] } },
      },
    },
    whatsapp_context: {
      messages: [
        {
          direction: "inbound",
          text: { body: "Retoma este pedido S02800 DANIEL TOVAR" },
        },
      ],
    },
  });
  assert.equal(switched.session_switch, true);
  assert.equal(switched.already_resolved, false);
  assert.equal(switched.order_number, "2800");

  const stay = resolveStaffOrderSearchInput({
    execution_context: {
      vars: {
        order_session: fredySession,
        order_correction: { target_order_id: 2787, target_order_name: "S02789" },
      },
    },
    whatsapp_context: {
      messages: [{ direction: "inbound", text: { body: "ODALINDA ES UNIFORME FEMENINO" } }],
    },
  });
  assert.equal(stay.already_resolved, true);
  assert.equal(stay.order_id, 2787);

  assert.equal(readOrderSession({ order_session: fredySession }).order_id, 2787);
}

function testPatchRows() {
  const existing = [
    { numero: "10", nombre: "Juan", talla: "M", rol: "" },
    { numero: "7", nombre: "Ana", talla: "S", rol: "" },
  ];
  const patched = patchDetailRows(existing, [{ nombre: "Juan", talla: "L" }]);
  assert.equal(patched.find((r) => r.nombre === "Juan").talla, "L");
  assert.equal(patched.length, 2);
}

function testParseHtml() {
  const html = `<table><tbody>
    <tr><td>10</td><td>Juan</td><td>M</td><td></td></tr>
    <tr><td>7</td><td>Ana</td><td>S</td><td>arquero</td></tr>
  </tbody></table>`;
  const rows = parseDetailRowsFromNoteHtml(html);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].nombre, "Juan");
}

function testChatter() {
  const html = buildCorrectionChatterHtml({
    changeType: "error_diseno",
    changeSummary: "Dorsal 10 → 7",
    staffLabel: "Paola",
    orderName: "S02564",
    rowCount: 12,
    productMixChanged: false,
    revisionNumber: 3,
  });
  assert.match(html, /sin cambios/i);
  assert.match(html, /V0003/);
}

testStageLock();
testBareNumber();
testThreadResolve();
testPatchRows();
testParseHtml();
testProductMix();
testChatter();
testOrderSessionIsolation();
console.log("OK order correction tests");
