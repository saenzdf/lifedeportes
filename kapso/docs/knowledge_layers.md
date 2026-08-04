# Arquitectura de conocimiento — Kapso Life Deportes

Cómo dejar de inflar el `system_prompt` y usar **capas** alineadas con Kapso.

---

## Problema hoy

`agent_vendedor_v3.md` ≈ **14 KB** (~240 líneas). Casi todo va embebido en `system_prompt` del grafo.

| Bloque | ~% del archivo | ¿Cambia seguido? | ¿Mismo en varios agentes? |
|--------|----------------|------------------|---------------------------|
| Rol + estrategia venta gradual | 15% | Poco | Solo vendedor |
| Modelo del grafo + tools | 20% | Poco | **Sí** (vendedor, histórico, staff) |
| Reglas duras (mínimo 6, deportes, tiempos) | 15% | Poco | **Sí** (vendedor + staff) |
| Flujo fases 1–3 + frase cierre | 15% | Poco | Solo vendedor |
| Límites de autoridad | 5% | Poco | Parcial |
| Voz / archivos Kapso | 10% | Poco | **Sí** (todos) |
| **Catálogo + precios + lenguaje cliente** | **30%** | Medio (Odoo) | **Sí** (vendedor + staff) |

El prompt es largo porque **mezcla** comportamiento del agente, patrones Kapso, reglas de negocio y catálogo estático en un solo string que se paga **en cada turno**.

---

## Qué ofrece Kapso (estándar)

En el nodo **agent**, además de `system_prompt`:

```json
"flow_agent_knowledge_bases": [
  {
    "name": "life_catalogo_precios",
    "description": "Precios y nombres de productos Life. Usar al cotizar o confirmar producto.",
    "knowledge_base_text": "..."
  }
]
```

- Contenido **inline** en el grafo (API: `WorkflowNodeAgentKnowledgeBase`).
- Kapso genera **embeddings** y el agente hace **búsqueda semántica** cuando necesita datos (no todo el texto en cada mensaje).
- Varios KB por agente, cada uno con `name` + `description` (el modelo elige cuál consultar).
- Patrón recomendado en docs: textos largos (políticas, catálogo, FAQs) → KB; instrucciones de comportamiento → prompt corto.

**No existe** hoy en vuestra cuenta un “KB global del proyecto” reutilizable por API: la reutilización es **un archivo en el repo** que un script embebe en varios nodos.

---

## Capas recomendadas (de general a específico)

```
┌─────────────────────────────────────────────────────────┐
│  A. Kapso / WhatsApp (general, multi-proyecto)          │
│     voz, archivos, enter_waiting, handoff, vars         │
├─────────────────────────────────────────────────────────┤
│  B. Life negocio (compartido vendedor + staff)          │
│     deportes, mínimo 6, tiempos, tono, empresa          │
├─────────────────────────────────────────────────────────┤
│  C. Life catálogo (compartido, precios + variantes)     │
│     + function buscar_producto_odoo (match dinámico)    │
├─────────────────────────────────────────────────────────┤
│  D. Playbook por agente (específico)                    │
│     vendedor gradual | staff ingreso | histórico        │
└─────────────────────────────────────────────────────────┘
```

| Capa | Dónde vive | Quién lo usa |
|------|------------|--------------|
| **A** Kapso patterns | `kapso/knowledge/kapso_whatsapp_patterns_v1.md` → KB en cada agente | Todos |
| **B** Reglas Life | `kapso/knowledge/life_reglas_comerciales_v1.md` → KB | Vendedor, staff |
| **C** Catálogo | `kapso/knowledge/life_catalogo_precios_v1.md` + `life_catalog_semantic_v1.json` en function | Vendedor, staff |
| **D** Playbook | `system_prompt` corto (~80–120 líneas máx.) | Un agente |

**Desarrollo** (no runtime): skills Cursor (`kapso-graph-guard`, `kapso_voice_media_standard`) y `graph_architecture.md`.

---

## Qué queda en `system_prompt` (corto)

Solo lo que debe estar **siempre** en contexto:

1. Rol en una frase.
2. Modelo del grafo (1 párrafo): Start cada mensaje, `enter_waiting`, sin `complete_task` en cliente.
3. **Cuándo** usar cada tool (una línea por tool).
4. Playbook del agente (vendedor: fases; staff: confirmar → `complete_task`).
5. Referencia explícita: “Para precios y productos usa KB `life_catalogo_precios`. Para reglas comerciales KB `life_reglas_comerciales`. Para audio/archivos KB `kapso_whatsapp_patterns`.”

**No** repetir listas de precios ni tablas de variantes en el prompt si están en KB o en `buscar_producto_odoo`.

---

## Cómo crear los KB (workflow Life)

### 1. Archivos fuente en repo

```
kapso/knowledge/
  kapso_whatsapp_patterns_v1.md    # Capa A (desde _snippet_voice_media_kapso.md)
  life_reglas_comerciales_v1.md    # Capa B (de sección 1 vendedor + empresa)
  life_catalogo_precios_v1.md        # Capa C (sección 5 vendedor o catalog_for_agent.md)
```

### 2. Script de embed (como `embed_prompts_staff_v10.js`)

```bash
node kapso/scripts/embed_agent_knowledge.js --agent vendedor
node kapso/scripts/embed_agent_knowledge.js --agent staff
```

El script:

- Lee `prompts/agent_vendedor_v4_slim.md` → `system_prompt`
- Lee los `.md` de `knowledge/` → `flow_agent_knowledge_bases[]`
- Escribe el JSON del grafo
- Valida con `validate-graph-lifedeportes.js`

### 3. Formato JSON en el nodo agent

```json
"flow_agent_knowledge_bases": [
  {
    "name": "kapso_whatsapp_patterns",
    "description": "Transcripción de audio, ask_about_file, enter_waiting. Consultar ante media o duda de tools.",
    "knowledge_base_text": "..."
  },
  {
    "name": "life_reglas_comerciales",
    "description": "Mínimo 6 u., deportes permitidos, tiempos entrega, frase de cierre, tono.",
    "knowledge_base_text": "..."
  },
  {
    "name": "life_catalogo_precios",
    "description": "Nombres Odoo, precios COP, traducción lenguaje cliente, módulos camiseta/uniforme.",
    "knowledge_base_text": "..."
  }
]
```

`description` es crítica: guía al agente **cuándo** buscar en ese KB.

### 4. Staff hoy

Staff ya embebe catálogo en el **prompt** (`knowledge_staff_catalog_v1.md`). El siguiente paso natural es **moverlo a `flow_agent_knowledge_bases`** y acortar el prompt — mismo contenido, mejor costo/latencia.

---

## ¿KB “general Kapso” aparte del proyecto Life?

**Sí, pero como convención de repo**, no como objeto mágico en Kapso:

| Tipo | Ubicación | Propósito |
|------|-----------|-----------|
| Kapso + WhatsApp | `.agents/skills/...` o `kapso/knowledge/kapso_*.md` | Patrones estándar (voz, KB, grafo) |
| Life negocio | `kapso/knowledge/life_*.md` | Reglas que no cambian entre agentes |
| Por agente | `kapso/prompts/agent_*_slim.md` | Solo playbook |

Si mañana hay otro cliente en Kapso, copias **solo la capa A**; las capas B–D son Life.

---

## Catálogo: KB vs function

| Enfoque | Cuándo |
|---------|--------|
| **KB** `life_catalogo_precios` | Precios “desde”, nombres para cliente, lenguaje colombiano |
| **Function** `buscar_producto_odoo` | Match fuzzy, variantes, alternativas, precio live Odoo |

El prompt/KB no debe duplicar la lógica de match — ya está en `product_match_engine.js`. El KB dice *qué vendemos*; la function resuelve *cuál línea Odoo*.

**Media (audio/foto):** Kapso transcribe + `ask_about_file` para visión; function **`interpretar_intencion_cotizacion`** centraliza parseo (camiseta/uniforme, fase, payload buscar). Ver `kapso/docs/agent_tools_media_pipeline.md`.

---

## Ventajas vs prompt monolítico

| | Prompt largo (hoy) | Capas + KB |
|--|-------------------|------------|
| Tokens por turno | Alto (todo siempre) | Menor (prompt + retrieval) |
| Mantener precios | Re-embed prompt completo | Editar un `.md` |
| Compartir voz/archivos | Copiar en 3 prompts | Un `kapso_whatsapp_patterns_v1.md` |
| Riesgo | Modelo ignora reglas al final del prompt | KB por tema, descripción clara |
| Debug | Difícil ver qué leyó | Nombre del KB en logs / tool kb_retrieval |

**Riesgo KB:** si el agente no consulta el KB, puede inventar precios. Mitigación: prompt obliga `buscar_producto_odoo` en Fase 3 y dice “no cotizar sin KB o tool”.

---

## Plan de migración sugerido (sin romper prod)

1. ~~**Extraer** archivos `kapso/knowledge/*.md` desde vendedor v3~~ ✅
2. ~~**Crear** `agent_vendedor_v4_slim.md`~~ ✅
3. ~~**Script** `embed_agent_knowledge.js`~~ ✅ — tests: `node kapso/tests/run_agent_knowledge_tests.js`
4. **Probar** en Kapso Test: cotización, audio, deporte rechazado.
5. **Publicar** con `kapso-graph-guard` (validar → get-graph → update-graph).
6. Repetir para histórico (KB A+B; playbook mínimo).

---

## Resumen ejecutivo

- **Sí conviene** pensar en KB Kapso — no un blob único, sino **varios KB temáticos** + prompt corto.
- El prompt de ventas es largo porque incluye **catálogo completo + reglas + patrones Kapso + playbook**; solo el playbook y el routing de tools deben quedar en `system_prompt`.
- Lo “general” se hace con **archivos compartidos en repo** y el mismo array `flow_agent_knowledge_bases` en cada agente que lo necesite.
- Life ya empezó por staff (catálogo en markdown); el paso siguiente es usar **`flow_agent_knowledge_bases`** en el JSON en lugar de concatenar al prompt.

Referencias: [Agent node](https://docs.kapso.ai/docs/flows/step-types/agent-node), [Workflow API – KnowledgeBase](https://docs.kapso.ai/api/platform/v1/functions/workflows/create-workflow), `kapso/docs/kapso_voice_media_standard.md`, `kapso/catalog/README.md`.
