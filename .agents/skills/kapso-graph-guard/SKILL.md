---
name: kapso-graph-guard
description: >-
  Valida y publica grafos Kapso Life Deportes sin nodos huérfanos ni functions
  archivadas. Usar antes de update-graph, al editar workflow_lifedeportes*.json,
  o cuando el usuario pida subir/publicar/sincronizar el grafo Kapso.
---

# Kapso Graph Guard — Life Deportes

## Cuándo usar

- Antes de **cualquier** `update-graph.js` al workflow `lifedeportes_sales_inbound`
- Al agregar nodos, decides o edges al carril staff o cliente
- Cuando el grafo “crece” sin razón o reaparecen functions viejas

## Reglas (no negociables)

1. **Un mensaje = re-trigger desde Start** (cliente). Staff write = línea única documentada en `kapso/docs/staff_graph_v10.md`.
2. **No dejar nodos sin edge entrante** salvo whitelist cliente (`staff_only_mode`).
3. **No duplicar** `source + label` en edges (causa rutas ambiguas).
4. **No cablear** functions archivadas: `detect-staff-upload-command`, `route-staff-entry`, `route-staff-post`, `route-staff-registration`.
5. **Cliente:** no tocar prompts/topología vendedor/histórico salvo pedido explícito.
6. **Staff:** un Agent Staff (`agent_1780762885818`) para pedido/nómina/compra vía tools. No crear agentes por dominio. Jump → mismo agente.
7. **UI Kapso manda en topología** — siempre `get-graph` → validar → `update-graph` con `lock_version`.

## Workflow obligatorio antes de subir

```bash
cd lifedeportes/kapso
export $(grep -v '^#' ../.env | xargs)   # KAPSO_API_* si aplica

# Preferido: deploy unificado
bash scripts/deploy_unified_staff.sh

# O manual:
node scripts/validate-graph-lifedeportes.js workflow_lifedeportes_sales_inbound_v10.json
```

Si `validate-graph-lifedeportes.js` falla: **no subir**. Corregir o regenerar con `build_graph_v10_pruned.js`.

## Cómo editar sin ensuciar

| Quiero… | Hacer… | No hacer… |
|---------|--------|-----------|
| Cambiar prompt staff/vendedor + KB | `embed_agent_knowledge.js` | Concatenar catálogo al prompt |
| Añadir paso staff | 1 function + 1 edge lineal | Decide extra + loop |
| Retirar flujo | Quitar nodo **y** edges **y** archivar function | Dejar nodo muerto en JSON |
| Staff-only pruebas | `staff_only_mode.js` | Borrar nodos cliente |

## Archivos de verdad

| Archivo | Rol |
|---------|-----|
| `workflow_lifedeportes_sales_inbound_v10.json` | Grafo activo local |
| `kapso/docs/staff_graph_v10.md` | Mapa staff |
| `service_registry.json` | Functions permitidas |
| `kapso/functions/_archive/` | Fuera del grafo |

## Checklist agente (copiar mentalmente)

- [ ] ¿Leí `staff_graph_v10.md` / `graph_architecture.md`?
- [ ] ¿Corrí `validate-graph-lifedeportes.js` (exit 0)?
- [ ] ¿Hay nodos huérfanos o edges duplicados?
- [ ] ¿Functions archivadas fuera del JSON?
- [ ] ¿`get-graph` lock_version antes de PATCH?
- [ ] ¿Cliente intacto si no lo pidieron?

## Referencias

- `kapso/docs/graph_architecture.md`
- `.agents/skills/automate-whatsapp/references/graph-contract.md`
- `kapso/docs/kapso_voice_media_standard.md`
- `kapso/prompts/_snippet_voice_media_kapso.md`
