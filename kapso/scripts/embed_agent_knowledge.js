#!/usr/bin/env node
/**
 * Embebe system_prompt + flow_agent_knowledge_bases en workflow v10.
 *
 * Uso:
 *   node kapso/scripts/embed_agent_knowledge.js
 *   node kapso/scripts/embed_agent_knowledge.js --agent vendedor
 *   node kapso/scripts/embed_agent_knowledge.js --agent staff
 */
const fs = require("fs");
const path = require("path");

const base = path.join(__dirname, "..");
const wfPath = path.join(base, "workflow_lifedeportes_sales_inbound_v10.json");

/** @type {Record<string, { name: string, description: string, file: string }>} */
const KB_CATALOG = {
  kapso_whatsapp_patterns: {
    name: "kapso_whatsapp_patterns",
    description:
      "Audio transcrito, ask_about_file, enter_waiting, handoff. Consultar ante media, voz o duda de tools.",
    file: "knowledge/kapso_whatsapp_patterns_v1.md",
  },
  life_reglas_comerciales: {
    name: "life_reglas_comerciales",
    description:
      "FAQ políticas claras: descuento sin volumen, rompevientos 68, petos 69, deportes fuera (ciclismo/natación…), catálogo /shop, dirección Engativá, abono 50%, envíos por cobrar, logos Nike/Adidas, pantaloneta no pantalón, dry-fit default. Mínimo 6, tiempos 15 días, tono. Consultar ante esas preguntas — responder ya, no posponer.",
    file: "knowledge/life_reglas_comerciales_v1.md",
  },
  life_reglas_staff: {
    name: "life_reglas_staff",
    description:
      "Extract staff: SO solo draft, CRM→HAZ PRESUPUESTO, mín. 6, deportes sí/no, rompevientos 68/petos 69, sin vars en WA. No FAQ larga de cliente.",
    file: "knowledge/life_reglas_staff_v1.md",
  },
  life_catalogo_precios: {
    name: "life_catalogo_precios",
    description:
      "Precios COP, telas dry-fit/Dumonti/Hidrotec (sin upsell), rompevientos 68, peto 69, catálogo shop, extras. Usar al cotizar o confirmar producto.",
    file: "knowledge/life_catalogo_precios_v1.md",
  },
  life_catalog_staff_match: {
    name: "life_catalog_staff_match",
    description:
      "Mapeo lenguaje operaria/cliente a producto Odoo, variantes, uso de buscar_producto_odoo para staff.",
    file: "knowledge/life_catalog_staff_match_v1.md",
  },
  life_lenguaje_cliente_productos: {
    name: "life_lenguaje_cliente_productos",
    description:
      "Frases WhatsApp: camiseta=sola dry-fit, uniforme=completo, rompevientos→68, peto→69, descuento/dirección/catálogo/pago, deportes fuera, pantaloneta≠pantalón, logos marca ropa.",
    file: "knowledge/life_lenguaje_cliente_productos_v1.md",
  },
  life_variantes_odoo: {
    name: "life_variantes_odoo",
    description:
      "Tabla variantes Odoo jul 2026: voleibol 31 (Corta 12200-12203, licra), fútbol 115, manga corta vs china.",
    file: "knowledge/life_variantes_odoo_v1.md",
  },
  life_flujo_audio_foto: {
    name: "life_flujo_audio_foto",
    description:
      "Audio Kapso Transcript + foto ask_about_file: flujo combinado, match cuello/manga/polo, siempre responder en texto, buscar_producto_odoo.",
    file: "knowledge/life_flujo_audio_foto_v1.md",
  },
  life_tienda_fotos: {
    name: "life_tienda_fotos",
    description:
      "Fotos y links tienda Odoo publicada: buscar_producto_odoo con include_shop_media, send_media, shop.page_url e image_url.",
    file: "knowledge/life_tienda_fotos_v1.md",
  },
  life_horarios_ventas: {
    name: "life_horarios_ventas",
    description:
      "Horario comercial agente vendedor: in_hours vs off_hours, copy bienvenida/cierre, handoff mismo día vs siguiente día hábil, pedir humano.",
    file: "knowledge/life_horarios_ventas_v1.md",
  },
  life_lista_pedido_staff: {
    name: "life_lista_pedido_staff",
    description:
      "Lista pedido staff: clasificar→parse Excel/texto/imagen→registrar (staging)→fusionar. PRESEAS, Formato Life, family-day. Upload Odoo = grafo tras complete_task. Consultar al parsear lista o adjuntos.",
    file: "knowledge/life_lista_pedido_staff_v1.md",
  },
  life_correccion_pedido_staff: {
    name: "life_correccion_pedido_staff",
    description:
      "Retoma/corregir SO por número S0…: buscar_pedido_odoo, sincronizar, corregir_pedido_odoo o complete_task sale_order mismo id. No alta CRM nueva.",
    file: "knowledge/life_correccion_pedido_staff_v1.md",
  },
  life_retomar_oportunidad_crm: {
    name: "life_retomar_oportunidad_crm",
    description:
      "Opp creada a mano en Canal Ventas: buscar_oportunidad_odoo → parse/adjuntos → complete_task opportunity_only (reusa lead) → HAZ PRESUPUESTO. No duplicar CRM.",
    file: "knowledge/life_retomar_oportunidad_crm_v1.md",
  },
  life_nomina_attlog: {
    name: "life_nomina_attlog",
    description:
      "Nómina attlog ZKTeco: SUBIR NOMINA, parse_nomina_attlog, CONFIRMO NOMINA, PIN=barcode Odoo.",
    file: "knowledge/life_nomina_attlog_v1.md",
  },
};

function loadOrderDetailFunctionIds() {
  try {
    const reg = JSON.parse(
      fs.readFileSync(path.join(base, "docs/order_detail_function_ids.json"), "utf8")
    );
    return reg;
  } catch {
    return null;
  }
}

const ORDER_DETAIL_TOOL_DEFS = [
  {
    name: "clasificar_adjuntos_pedido",
    key: "clasificar_adjuntos_pedido",
    function_name: "clasificar-adjuntos-pedido",
    description:
      "Clasifica adjuntos WhatsApp del hilo (lista Excel, imagen lista, referencia diseño). Devuelve suggested_tools.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "parsear_lista_excel_pedido",
    key: "parsear_lista_excel_pedido",
    function_name: "parsear-lista-excel-pedido",
    description:
      "Descarga y parsea Excel FORMATO PEDIDO LIFE → order_draft.detail.rows y adjunto detail_list.",
    input_schema: {
      type: "object",
      properties: {
        file_url: { type: "string" },
        filename: { type: "string" },
        merge_mode: { type: "string", enum: ["replace", "append"] },
      },
    },
  },
  {
    name: "parsear_lista_texto_pedido",
    key: "parsear_lista_texto_pedido",
    function_name: "parsear-lista-texto-pedido",
    description: "Parsea texto pegado o JSON de visión → order_draft.detail.rows.",
    input_schema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string" },
        source: { type: "string" },
        merge_mode: { type: "string", enum: ["replace", "append"] },
      },
    },
  },
  {
    name: "parsear_lista_imagen_pedido",
    key: "parsear_lista_imagen_pedido",
    function_name: "parsear-lista-imagen-pedido",
    description:
      "Tras ask_about_file: normaliza vision_text a filas. Sin vision_text devuelve pregunta fija.",
    input_schema: {
      type: "object",
      properties: {
        file_url: { type: "string" },
        vision_text: { type: "string" },
        merge_mode: { type: "string", enum: ["replace", "append"] },
      },
    },
  },
  {
    name: "parsear_lista_pdf_pedido",
    key: "parsear_lista_pdf_pedido",
    function_name: "parsear-lista-pdf-pedido",
    description:
      "Organiza lista FORMATO PEDIDO LIFE en PDF (texto embebido). Si el PDF es solo imagen: ask_about_file + vision_text.",
    input_schema: {
      type: "object",
      properties: {
        file_url: { type: "string", description: "URL Kapso/WhatsApp del PDF" },
        filename: { type: "string" },
        vision_text: {
          type: "string",
          description: "Salida ask_about_file si el PDF no tiene texto",
        },
        merge_mode: { type: "string", enum: ["replace", "append"] },
      },
    },
  },
  {
    name: "registrar_adjuntos_pedido",
    key: "registrar_adjuntos_pedido",
    function_name: "registrar-adjuntos-pedido",
    description: "Registra adjuntos en order_draft.attachments (staging Kapso). Upload a Chatter Odoo = grafo tras complete_task.",
    input_schema: {
      type: "object",
      properties: {
        attachments: { type: "array", items: { type: "object" } },
      },
    },
  },
  {
    name: "fusionar_borrador_lista",
    key: "fusionar_borrador_lista",
    function_name: "fusionar-borrador-lista",
    description:
      "Normaliza/fusiona el borrador canónico. Para formatos desconocidos pasa people[]; para parsers legacy puede pasar rows[].",
    input_schema: {
      type: "object",
      properties: {
        merge_mode: { type: "string", enum: ["replace", "append"] },
        source: { type: "string", enum: ["agent_normalized", "text", "excel", "media", "flow"] },
        rows: { type: "array", items: { type: "object" } },
        people: {
          type: "array",
          items: {
            type: "object",
            required: ["person_id", "identity", "components"],
            properties: {
              person_id: { type: "string" },
              identity: { type: "object" },
              components: { type: "array", items: { type: "object" } },
              comments: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  },
];

const ORDER_CORRECTION_TOOL_DEFS = [
  {
    name: "buscar_oportunidad_odoo",
    key: "buscar_oportunidad_odoo",
    function_name: "buscar-oportunidad-odoo",
    description:
      "Busca/retoma oportunidad CRM en Canal Ventas o Asistente Kapso por nombre, teléfono o id (ej. CHINO, ACEROS, 3581). Usar ANTES de completar una opp creada a mano. Deja vars.lead.id.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre equipo/cliente" },
        phone: { type: "string", description: "Teléfono WA" },
        lead_id: { type: "number", description: "Id CRM" },
        query: { type: "string", description: "Texto libre del hilo" },
      },
    },
  },
  {
    name: "crear_presupuesto_odoo",
    key: "crear_presupuesto_odoo",
    function_name: "crear-presupuesto-odoo",
    description:
      "Crea/actualiza presupuesto SO borrador desde una oportunidad CRM (nombre o id). Copia adjuntos, líneas si hay order_draft, mueve a Proposition y organiza lista. Usar cuando staff diga HAZ PRESUPUESTO / crear presupuesto de X / pasar a presupuesto. No confirma el SO.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Cliente/equipo (ej. Emmanuelle, Daniel Tovar)" },
        lead_id: { type: "number", description: "Id oportunidad CRM" },
        query: { type: "string", description: "Texto libre del hilo" },
        phone: { type: "string" },
        move_to_proposition: {
          type: "boolean",
          description: "Default true — mueve CRM a Proposition",
        },
      },
    },
  },
  {
    name: "enviar_formulario_excel",
    key: "enviar_formulario_excel",
    function_name: "enviar-formulario-excel",
    description:
      "Envía el Formulario Life (.xlsx) de lista/tallas al WhatsApp del CLIENTE. Usar con ENVIAR EXCEL DETALLE / «envíale el excel/formato a {cliente}». Si no hay teléfono, buscar_oportunidad_odoo antes y pasar customer_phone.",
    input_schema: {
      type: "object",
      properties: {
        customer_phone: {
          type: "string",
          description: "Teléfono WA del cliente (obligatorio en staff si no está en vars)",
        },
        caption: { type: "string", description: "Caption opcional del documento" },
        query: { type: "string", description: "Texto del pedido staff" },
      },
    },
  },
  {
    name: "enviar_retomar_pedido",
    key: "enviar_retomar_pedido",
    function_name: "enviar-retomar-pedido",
    description:
      "Envía el template Meta retomar_pedido_v2 al WhatsApp del CLIENTE (fuera de ventana 24h). Usar con ENVIAR RETOMAR / «manda retoma a {cliente}». Si no hay teléfono, buscar_oportunidad_odoo antes.",
    input_schema: {
      type: "object",
      properties: {
        customer_phone: {
          type: "string",
          description: "Teléfono WA del cliente",
        },
        query: { type: "string", description: "Texto del pedido staff" },
      },
    },
  },
  {
    name: "buscar_pedido_odoo",
    key: "buscar_pedido_odoo",
    function_name: "buscar-pedido-odoo",
    description: "Busca presupuesto/pedido por número (ej. 2714 o S02714). Devuelve id, etapa y si es editable. Usar antes de corregir o retomar.",
    input_schema: {
      type: "object",
      properties: {
        order_number: {
          type: "string",
          description: "Opcional si ya está en vars o en el mensaje del hilo",
        },
        customer_phone: { type: "string", description: "Opcional, solo para desambiguar" },
        customer_name: { type: "string", description: "Opcional, solo para desambiguar" },
      },
    },
  },
  {
    name: "corregir_pedido_odoo",
    key: "corregir_pedido_odoo",
    function_name: "corregir-pedido-odoo",
    description:
      "Actualiza lista/nota del presupuesto (sale.order) + adjuntos (SO y tarea). Usar al retomar/corregir un S0… existente.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "number" },
        change_type: {
          type: "string",
          enum: ["cliente", "error_interno", "error_diseno"],
        },
        change_summary: { type: "string" },
        list_mode: {
          type: "string",
          enum: ["full", "patch", "attachments_only"],
          description: "full=Excel completo, patch=solo cambios, attachments_only=solo fotos/archivos",
        },
      },
    },
  },
  {
    name: "sincronizar_pedido_odoo",
    key: "sync_order_draft_from_odoo",
    function_name: "sync-order-draft-from-odoo",
    description:
      "Pull Kapso←Odoo: reconstruye order_draft desde líneas SO + Formulario Life. Usar tras editar en Odoo o al retomar un pedido.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "number" },
        order_name: { type: "string" },
      },
    },
  },
];

const INTERPRET_QUOTE_TOOL = {
  name: "interpretar_intencion_cotizacion",
  description:
    "Tras texto/transcript/foto: parsea intención (camiseta vs uniforme, fase, cantidad). Devuelve buscar_producto_odoo_input si listo. Llamar ANTES de buscar_producto_odoo cuando hay audio o imagen.",
  function_name: "interpret-quote-intent",
  input_schema: {
    type: "object",
    properties: {
      message_text: { type: "string", description: "Texto escrito del cliente" },
      transcript: { type: "string", description: "Transcript Kapso del audio" },
      raw_message: { type: "string", description: "Mensaje completo (extrae Transcript)" },
      photo_description: { type: "string", description: "Salida ask_about_file" },
      visual_hints: { type: "array", items: { type: "string" } },
      quantity: { type: "number" },
    },
  },
};

function loadInterpretFunctionId() {
  try {
    const reg = JSON.parse(
      fs.readFileSync(path.join(base, "service_registry.json"), "utf8")
    );
    return reg?.odoo_catalog?.interpret_quote_intent?.kapso_function_id || null;
  } catch {
    return null;
  }
}

const VENDEDOR_SEARCH_TOOL = {
  name: "buscar_producto_odoo",
  description:
    "OBLIGATORIO en Fase 3 antes de enviar precio final. Resuelve producto Odoo desde lenguaje natural. Con include_shop_media:true devuelve page_url e image_url de productos PUBLICADOS en tienda (Odoo shop).",
  function_id: "4503ca5c-7114-4442-bada-112be3ddf67e",
  function_name: "odoo-search-product-price",
  input_schema: {
    type: "object",
    required: ["product_text"],
    properties: {
      product_text: {
        type: "string",
        description: "Lo que dice el cliente: ej. uniforme de futbol, 10 camisetas dry fit",
      },
      quantity: { type: "number", description: "Cantidad de unidades (mín. 6)" },
      include_shop_media: {
        type: "boolean",
        description:
          "true cuando pida fotos, imágenes, catálogo o link tienda — devuelve shop.page_url e shop.image_url",
      },
      shop_request: {
        type: "string",
        enum: ["photos"],
        description: "Alias de include_shop_media para pedidos de fotos",
      },
      sport: {
        type: "string",
        enum: ["futbol", "baloncesto", "voleibol", "atletismo"],
        description: "Deporte si ya se conoce",
      },
      garment_type: {
        type: "string",
        enum: [
          "uniforme_completo",
          "camiseta_sola",
          "pantaloneta",
          "medias",
          "arquero",
          "sudadera_conjunto",
          "gorra",
          "bandera",
        ],
      },
      collar: {
        type: "string",
        description: "polo_sin_botones, polo_con_botones, cuello_v, cuello_redondo, cuello_sport",
      },
      sleeves: {
        type: "string",
        description: "manga_corta, manga_larga, manga_sisa, ranglan",
      },
      material: { type: "string", description: "dry_fit, dumonti, hidrotec, lluvia" },
      photo_description: { type: "string", description: "Lo visto en foto referencia" },
      visual_hints: { type: "array", items: { type: "string" } },
    },
  },
};

const VENDEDOR_HISTORY_TOOLS = [
  {
    name: "consultar_tarjeta_pedido",
    description: "Consulta la tarjeta de producción/diseño (estado, etapa y avance). Sin order_name lista tarjetas activas. Con order_name (S01234) detalle; sin tarjeta = no existe.",
    function_id: "2fb9ca35-31f7-4b3a-84c7-8c03dc0a1775",
    function_name: "get-customer-card-scoped-odoo",
    input_schema: {
      type: "object",
      properties: {
        order_name: { type: "string", description: "Número de pedido ej. S01234" },
        order_id: { type: "number", description: "ID del pedido" },
        task_id: { type: "number", description: "ID tarjeta project.task" },
      },
    },
  },
  {
    name: "consultar_referencias_diseno",
    description: "Pedidos anteriores hechos: referencias de diseño o archivo de impresión en tarjetas finalizadas.",
    function_id: "d889689a-c8bc-4183-a4ec-a793a5268b64",
    function_name: "get-customer-design-references-scoped-odoo",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Máximo referencias 1-15" },
      },
    },
  },
];

const VENDEDOR_NOTIFY_TOOL = {
  name: "notificar_interes_ventas",
  description:
    "OBLIGATORIO cuando el cliente acepta cotización o muestra interés claro (abono/sí adelante). Avisa a líneas comerciales por WhatsApp/webhook. NO es handoff. Luego enter_waiting.",
  function_name: "notify-sales-interest",
  input_schema: {
    type: "object",
    properties: {
      product_text: { type: "string", description: "Producto cotizado principal" },
      quantity: { type: "number" },
      unit_cop: { type: "number" },
      total_cop: { type: "number" },
      customer_phone: { type: "string", description: "WA del cliente si se conoce" },
      note: { type: "string", description: "Nota corta opcional" },
      notes: { type: "string", description: "Notas del pedido vivo (colegio, personalización)" },
      lines: {
        type: "array",
        description: "Si cotizó varias opciones (uniforme + camiseta), pásalas todas",
        items: {
          type: "object",
          properties: {
            product_text: { type: "string" },
            quantity: { type: "number" },
            unit_cop: { type: "number" },
            total_cop: { type: "number" },
          },
        },
      },
      variants: {
        type: "object",
        description: "{material, collar, sleeves, sport}",
      },
    },
  },
};

const VENDEDOR_FORMULARIO_TOOL = {
  name: "enviar_formulario_excel",
  description:
    "Envía el Formulario Life (.xlsx) a ESTE chat cuando el cliente pregunta cómo mandar la lista, tallas, nombres o pide el formato/excel. Luego mensaje corto + enter_waiting.",
  function_name: "enviar-formulario-excel",
  input_schema: {
    type: "object",
    properties: {
      caption: { type: "string", description: "Caption opcional" },
    },
  },
};

function loadEnviarFormularioFunctionId() {
  try {
    const ids = JSON.parse(
      fs.readFileSync(path.join(base, "docs/order_detail_function_ids.json"), "utf8")
    );
    if (ids.enviar_formulario_excel) return ids.enviar_formulario_excel;
  } catch {
    /* ignore */
  }
  try {
    const reg = JSON.parse(fs.readFileSync(path.join(base, "service_registry.json"), "utf8"));
    return (
      reg?.order_detail?.enviar_formulario_excel?.kapso_function_id ||
      reg?.assets?.formulario_detalle_pedido_xlsx?.kapso_function_id ||
      null
    );
  } catch {
    return null;
  }
}

function loadNotifySalesFunctionId() {
  try {
    const reg = JSON.parse(
      fs.readFileSync(path.join(base, "service_registry.json"), "utf8")
    );
    return (
      reg?.functions?.notify_sales_interest?.kapso_function_id ||
      reg?.customer_lane?.notify_sales_interest_id ||
      null
    );
  } catch {
    return null;
  }
}

/** @type {Record<string, object>} */
function loadUnifiedStaffFunctionIds() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(base, "docs/unified_staff_function_ids.json"), "utf8")
    );
  } catch {
    return null;
  }
}

const UNIFIED_STAFF_EXTRA_TOOL_DEFS = [
  {
    name: "parse_nomina_attlog",
    key: "parse_nomina_attlog",
    function_name: "parse-nomina-attlog",
    description:
      "Parsea attlog.dat del reloj ZKTeco → vars.nomina.draft + summary_text. PIN = barcode Odoo.",
    input_schema: {
      type: "object",
      properties: {
        file_url: { type: "string" },
        filename: { type: "string" },
      },
    },
  },
  {
    name: "confirmar_nomina",
    key: "confirmar_nomina",
    function_name: "confirmar-nomina",
    description:
      "Tras CONFIRMO NOMINA: encola nómina (NOM-…) sin escribir HR. Requiere vars.nomina.draft.",
    input_schema: {
      type: "object",
      properties: {
        confirmed: { type: "boolean" },
        confirm_text: { type: "string" },
      },
    },
  },
  {
    name: "crear_compra_odoo",
    key: "crear_compra_odoo",
    function_name: "crear-compra-odoo",
    description:
      "Crea purchase.order borrador. Requiere CONFIRMO COMPRA (confirmed=true) + proveedor + líneas.",
    input_schema: {
      type: "object",
      properties: {
        confirmed: { type: "boolean" },
        confirm_text: { type: "string" },
        partner_name: { type: "string" },
        partner_id: { type: "number" },
        notes: { type: "string" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product_text: { type: "string" },
              product_id: { type: "number" },
              quantity: { type: "number" },
              price_unit: { type: "number" },
            },
          },
        },
      },
    },
  },
  {
    name: "prepare_inbox_upload",
    key: "prepare_inbox_upload",
    function_name: "prepare-inbox-upload",
    description:
      "Semilla silent desde vars.quote (Jump/paquete vendedor) antes de complete_task de pedido.",
    input_schema: { type: "object", properties: {} },
  },
  // medir_fidelidad_pedido / verificar_servicio: ops-only — no van en UNIFIED_STAFF_EXTRA ni keep set.
];

/** Ops/KPI staff: retirados del toolset (2026-06). El carril staff vive en Hermes local. */
const STAFF_OPS_ONLY_TOOLS = ["verificar_servicio", "medir_fidelidad_pedido"];

const AGENTS = {
  vendedor: {
    nodeId: "agent_orquestador_1745500003000",
    promptFile: "prompts/agent_vendedor_v11_deepseek.md",
    displayName: "Agent: Vendedor y Soporte Life",
    knowledgeKeys: [
      "kapso_whatsapp_patterns",
      "life_horarios_ventas",
      "life_reglas_comerciales",
      "life_catalogo_precios",
      "life_lenguaje_cliente_productos",
      "life_flujo_audio_foto",
      "life_tienda_fotos",
    ],
    maxTokens: 2800,
    maxIterations: 16,
    patchSearchTool: true,
    patchHistoryTools: true,
    preferWaiting: true,
    /** Intent: no complete_task en cliente. Kapso a veces lo inyecta igual → prompt hard-ban. */
    stripDefaultTools: ["complete_task"],
  },
  // `staff`: RETIRADO 2026-09-16 — ver RETIRED_AGENTS (el carril staff vive en Hermes local).
};

/** Agentes retirados: el deploy los salta sin fallar (ver RETIRED_REASON). */
const RETIRED_AGENTS = {
  staff:
    "carril staff movido a Hermes local (staff-hermes-forwarder); nodo agent_1780762885818 retirado del grafo 2026-09-16",
};

function loadKnowledge(keys) {
  return keys.map((key) => {
    const def = KB_CATALOG[key];
    if (!def) throw new Error(`Unknown KB key: ${key}`);
    const text = fs.readFileSync(path.join(base, def.file), "utf8").trim();
    if (text.length < 100) throw new Error(`KB too short: ${def.file}`);
    return {
      name: def.name,
      description: def.description,
      knowledge_base_text: text,
    };
  });
}

function applyAgent(wf, agentKey) {
  const cfg = AGENTS[agentKey];
  const node = wf.nodes.find((n) => n.id === cfg.nodeId);
  if (!node) throw new Error(`Node not found: ${cfg.nodeId}`);

  const prompt = fs.readFileSync(path.join(base, cfg.promptFile), "utf8").trim();
  node.data.config.system_prompt = prompt;
  node.data.config.max_tokens = cfg.maxTokens;
  node.data.config.max_iterations = cfg.maxIterations;
  node.data.config.flow_agent_knowledge_bases = loadKnowledge(cfg.knowledgeKeys);
  node.data.display_name = cfg.displayName;

  if (cfg.patchOrderDetailTools) {
    const ids = loadOrderDetailFunctionIds();
    const tools = node.data.config.flow_agent_function_tools || [];
    const keep = new Set([
      "buscar_producto_odoo",
      "previsualizar_borrador_cotizacion",
    ]);
    const kept = tools.filter((t) => keep.has(t.name));
    if (ids) {
      const orderTools = ORDER_DETAIL_TOOL_DEFS.map((def) => ({
        ...def,
        function_id: ids[def.key],
      })).filter((t) => t.function_id);
      const correctionTools = ORDER_CORRECTION_TOOL_DEFS.map((def) => ({
        ...def,
        function_id: ids[def.key],
      })).filter((t) => t.function_id);
      node.data.config.flow_agent_function_tools = [...kept, ...orderTools, ...correctionTools];
    }
  }

  if (cfg.patchUnifiedStaffTools) {
    const uids = loadUnifiedStaffFunctionIds();
    const tools = node.data.config.flow_agent_function_tools || [];
    const withoutExtra = tools.filter(
      (t) => !UNIFIED_STAFF_EXTRA_TOOL_DEFS.some((d) => d.name === t.name)
    );
    if (uids) {
      const extra = UNIFIED_STAFF_EXTRA_TOOL_DEFS.map((def) => ({
        ...def,
        function_id: uids[def.key],
      })).filter((t) => t.function_id);
      node.data.config.flow_agent_function_tools = [...withoutExtra, ...extra];
    }
  }

  if (cfg.excludeFunctionTools?.length) {
    const ban = new Set(cfg.excludeFunctionTools);
    const tools = node.data.config.flow_agent_function_tools || [];
    node.data.config.flow_agent_function_tools = tools.filter((t) => !ban.has(t.name));
  }

  if (cfg.patchSearchTool) {
    const tools = node.data.config.flow_agent_function_tools || [];
    const idx = tools.findIndex((t) => t.name === "buscar_producto_odoo");
    if (idx >= 0) tools[idx] = { ...tools[idx], ...VENDEDOR_SEARCH_TOOL };
    else tools.push(VENDEDOR_SEARCH_TOOL);
    const interpretId = loadInterpretFunctionId();
    if (interpretId) {
      const iIdx = tools.findIndex((t) => t.name === "interpretar_intencion_cotizacion");
      const interpretTool = { ...INTERPRET_QUOTE_TOOL, function_id: interpretId };
      if (iIdx >= 0) tools[iIdx] = { ...tools[iIdx], ...interpretTool };
      else tools.push(interpretTool);
    }
    node.data.config.flow_agent_function_tools = tools;
  }

  if (cfg.patchHistoryTools) {
    const tools = node.data.config.flow_agent_function_tools || [];
    for (const hTool of VENDEDOR_HISTORY_TOOLS) {
      const idx = tools.findIndex((t) => t.name === hTool.name);
      if (idx >= 0) tools[idx] = hTool;
      else tools.push(hTool);
    }
    const notifyId = loadNotifySalesFunctionId();
    if (notifyId) {
      const notifyTool = { ...VENDEDOR_NOTIFY_TOOL, function_id: notifyId };
      const nIdx = tools.findIndex((t) => t.name === "notificar_interes_ventas");
      if (nIdx >= 0) tools[nIdx] = notifyTool;
      else tools.push(notifyTool);
    }
    const formId = loadEnviarFormularioFunctionId();
    if (formId) {
      const formTool = { ...VENDEDOR_FORMULARIO_TOOL, function_id: formId };
      const fIdx = tools.findIndex((t) => t.name === "enviar_formulario_excel");
      if (fIdx >= 0) tools[fIdx] = formTool;
      else tools.push(formTool);
    }
    node.data.config.flow_agent_function_tools = tools;
  }

  if (cfg.stripDefaultTools?.length) {
    const defaults = node.data.config.enabled_default_tools || [];
    const strip = new Set(cfg.stripDefaultTools);
    node.data.config.enabled_default_tools = defaults.filter((t) => !strip.has(t));
  }

  if (cfg.preferCompleteTask) {
    const defaults = node.data.config.enabled_default_tools || [];
    node.data.config.enabled_default_tools = defaults.filter((t) => t !== "enter_waiting");
    if (!node.data.config.enabled_default_tools.includes("complete_task")) {
      node.data.config.enabled_default_tools.push("complete_task");
    }
  }

  if (cfg.preferWaiting) {
    const defaults = node.data.config.enabled_default_tools || [];
    node.data.config.enabled_default_tools = defaults.filter((t) => t !== "complete_task");
    if (!node.data.config.enabled_default_tools.includes("enter_waiting")) {
      node.data.config.enabled_default_tools.push("enter_waiting");
    }
  }

  const kbChars = node.data.config.flow_agent_knowledge_bases.reduce(
    (s, k) => s + k.knowledge_base_text.length,
    0
  );
  console.log(
    `  ${agentKey}: prompt ${prompt.length} chars, KB ${cfg.knowledgeKeys.length} blocks (${kbChars} chars)`
  );
  return { promptLen: prompt.length, kbCount: cfg.knowledgeKeys.length, kbChars };
}

function main() {
  const only = process.argv.includes("--agent")
    ? process.argv[process.argv.indexOf("--agent") + 1]
    : null;

  const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));
  const targets = only ? [only] : Object.keys(AGENTS);

  for (const key of targets) {
    if (RETIRED_AGENTS[key]) {
      console.log(`[skip] ${key}: retirado — ${RETIRED_AGENTS[key]}`);
      continue;
    }
    if (!AGENTS[key]) {
      console.error(`Unknown agent: ${key}. Use: ${Object.keys(AGENTS).join(", ")}`);
      process.exit(1);
    }
    applyAgent(wf, key);
  }

  fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");
  console.log("Wrote", wfPath);
}

main();

module.exports = {
  KB_CATALOG,
  AGENTS,
  RETIRED_AGENTS,
  loadKnowledge,
  applyAgent,
  VENDEDOR_SEARCH_TOOL,
  INTERPRET_QUOTE_TOOL,
  loadInterpretFunctionId,
};
