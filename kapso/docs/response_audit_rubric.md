# Rubrica — auditoría de respuestas Kapso (carril cliente)

Cómo leer `node kapso/scripts/audit_customer_responses.js`. El script no cambia el grafo; solo clasifica hilos WhatsApp de los últimos N días contra el prompt vendedor v10.

## Buckets

| Bucket | Semántica | Acción típica |
|--------|-----------|----------------|
| `bien` / `bien_espera_cliente` | Contestó sin flags v10 | Nada, o Compose humano si ya hay interés |
| `respondio_mal` | Hubo respuesta, pero rompe reglas | Revisar flags; parche de prompt/KB si se repite |
| `sin_responder` | Último inbound comercial sin outbound (>3 min) | Prioridad: Compose o bug de ejecución |
| `sin_responder_post_handoff` | Cliente escribió tras handoff y nadie contestó | Inbox humano: el bot *no* debe hablar, el asesor sí |
| `silencio_correcto_ads` | Prefill Meta «Hola, quiero cotizar uniformes de» | Correcto: ignore |
| `sin_responder_saludo` | Solo saludo, sin reply | Ver si el debounce/spam lo silenció de más |
| `exploratorio` | Poco contenido | No chase |
| `humano_only` | Solo outbound de WhatsApp Business App | Fuera del agente |

Staff (Javier, Paola, Sebastián, Diego) se omite del carril cliente.

## Flags «respondió mal» (v10)

| Flag | Regla |
|------|--------|
| `escape_consultar_faq` | «déjeme consultar» sobre FAQ de la tabla (descuento, dirección, envíos, tallas…) |
| `narra_tools` | «voy a buscar / ver la herramienta» |
| `markdown_asteriscos` | `**negrita**` (se ve literal en WhatsApp) |
| `cta_insistente` | ¿Avanzamos? ¿Confirmamos? ¿Le queda alguna duda? |
| `saludo_marca` | «Hola, Life Deportes…» |
| `upsell_tela` | Dumonti/Hidrotec sin que el cliente lo pida |
| `precio_no_pedido` | `$` sin que pidieran precio/valor/cuánto |
| `cotizo_deporte_fuera_de_linea` | Precio en ciclismo/natación/etc. |
| `confundio_camiseta_vs_uniforme` | Cliente dijo camiseta; bot cotizó uniforme completo |
| `faq_parcial` / `faq_sin_responder` | Varias FAQ en un mensaje; no contestó todas |
| `cierre_solo_telefonos_sin_notify_copy` | Aceptó y el bot solo pasó 310/321 sin copy de cierre/abono |

## Silencio correcto vs hueco

Prefill Ads solo → saludo neutro `ads_greet` (06–22) y wait. Spam real → `ignore`/`end_quiet`. Callar un «hola quiero 12 uniformes de fútbol» con deporte/qty sigue siendo hueco.

Debounce ~30 s: varios inbound seguidos cuentan como un turno. El grace de «sin responder» es 3 minutos.

## Privacidad

El JSON/MD en `scratch/` y artifacts llevan nombre de pila + últimos 4 dígitos + texto recortado. No versionar esos dumps. Ver `kapso/learning/PRIVACY.md`.
