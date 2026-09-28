#!/usr/bin/env node
/**
 * Catch-up 2026-08-25 (ya corrió). NO reejecutar el fan-out a staff.
 *
 * Incidente: el digest de pendientes se mandó a Paola Y a Javier. Eso viola
 * “un cliente = un asesor”. Nicolás Giraldo (pidió asesor) no debió ir al
 * que no lo tiene asignado. Las tareas repetidas hacen que te llamen.
 *
 * Catch-up futuro: un aviso por cliente, solo al `Asignado a` de su crm.lead.
 * Nunca un lote idéntico a 573213988464 y 573103362484.
 *
 *   node kapso/scripts/catchup_unanswered_2026-08-25.js
 *   → sale 1 (script histórico; no envía).
 */
console.error(
  "catchup_unanswered_2026-08-25 ya se ejecutó y violó un-asesor-por-cliente. No reenviar. Ver .cursor/rules/one-advisor-per-client.mdc"
);
process.exit(1);
