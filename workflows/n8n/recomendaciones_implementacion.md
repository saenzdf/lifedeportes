# RECOMENDACIONES DE IMPLEMENTACIÓN - SISTEMA LIFE DEPORTES

## RESUMEN EJECUTIVO

El sistema Life Deportes presenta varios problemas de coherencia en sus prompts que pueden afectar la efectividad del agente. Se han identificado **4 áreas críticas** que requieren atención inmediata:

### 🔴 PROBLEMAS CRÍTICOS

1. **Agente Clasificador**: Falta definición clara de cuándo activar `identificar-contacto`
2. **Flujo de Ventas**: Precios hardcodeados que no se alinean con la herramienta `productos-life`
3. **Creación de Sale Order**: Formato JSON incorrecto para API de Odoo
4. **Manejo de Errores**: Ausencia de protocolos de error en todos los agentes

---

## CAMBIOS PRIORITARIOS A IMPLEMENTAR

### 1. **IMPLEMENTAR INMEDIATAMENTE** - Agente Clasificador

**Cambio requerido**: Añadir regla explícita para `identificar-contacto`

```diff
+ 2. **identificar-contacto**: 
+    - CUANDO el usuario confirme el Total del pedido
+    - Frases como "está listo", "eso es todo", "confirmamos"
+    - LISTO para crear la cotización
```

**Impacto**: Evita que usuarios que quieren confirmar pedido sean mal clasificados

### 2. **IMPLEMENTAR INMEDIATAMENTE** - Flujo de Ventas

**Cambio requerido**: Eliminar precios hardcodeados

```diff
- CIERRE DE VENTA:
- Cuando el usuario diga "eso es todo" o "está listo", muéstrale el resumen limpio con el total y pregunta: "¿Confirmamos el pedido con estos datos?"
-
- product_name /\tPrecio_base
- Conjunto Chaqueta y Pantalón cortavientos /\t100.000,00
- [Lista completa de precios...]
```

**Cambio a implementar**: Usar únicamente datos de `productos-life`

**Impacto**: Asegura precios actualizados y evita inconsistencias

### 3. **IMPLEMENTAR INMEDIATAMENTE** - Creación Sale Order

**Cambio requerido**: Corregir formato JSON

```diff
- "Cuando llames a la herramienta create-sale-order, en el campo order_line, envíame un JSON simple así: [{"product_id": 123, "qty": 10}, {"product_id": 456, "qty": 5}]."

+ **Formato correcto para order_line:**
+ [
+     {"product_id": 123, "qty": 10},
+     {"product_id": 456, "qty": 5}
+ ]
+ 
+ **VALIDACIÓN CRÍTICA:** Antes de crear la cotización, verifica que todos los product_id existan en Odoo
```

**Impacto**: Previene errores en la creación de cotizaciones

---

## MEJORAS SECUNDARIAS

### 4. **MEJORAS DE EXPERIENCIA DE USUARIO**

- Añadir ejemplos específicos para casos ambiguos en el clasificador
- Implementar mensajes de confirmación más claros
- Mejorar manejo de errores con mensajes específicos

### 5. **VALIDACIONES DE SEGURIDAD**

- Validar que product_id existan antes de crear sale orders
- Verificar disponibilidad de productos en tiempo real
- Implementar timeouts para herramientas que pueden fallar

---

## PLAN DE IMPLEMENTACIÓN SUGERIDO

### FASE 1: Correcciones Críticas (1-2 días)
1. ✅ Actualizar agente clasificador con regla `identificar-contacto`
2. ✅ Eliminar precios hardcodeados del flujo de ventas
3. ✅ Corregir formato JSON en agente creación sale order

### FASE 2: Mejoras de Robustez (3-5 días)
1. ✅ Implementar validaciones de product_id
2. ✅ Añadir manejo de errores en todos los agentes
3. ✅ Mejorar mensajes de confirmación

### FASE 3: Optimizaciones (1 semana)
1. ✅ Añadir casos de prueba para cada flujo
2. ✅ Implementar logging detallado
3. ✅ Optimizar tiempo de respuesta de herramientas

---

## MÉTRICAS DE ÉXITO

Después de implementar los cambios, se debe monitorear:

1. **Tasa de clasificación correcta**: >95%
2. **Errores en creación de cotizaciones**: <2%
3. **Satisfacción del usuario**: Medir con encuestas
4. **Tiempo promedio de cierre de venta**: Reducir 20%

---

## ARCHIVOS MODIFICADOS

- `Agente Life/prompts_mejorados.md`: Contiene las versiones mejoradas de todos los prompts
- `Agente Life/recomendaciones_implementacion.md`: Este documento con el plan de acción

---

**Nota**: Los cambios propuestos mantienen la funcionalidad existente pero mejoran significativamente la coherencia y robustez del sistema.