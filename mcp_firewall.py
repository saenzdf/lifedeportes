"""
FIREWALL DE SEGURIDAD MCP
Controla qué operaciones puede realizar el agente sobre Odoo.
Bloquea cualquier intento fuera de la whitelist.
"""
import json
import re

# ═══════════════ WHITELIST DE OPERACIONES PERMITIDAS ═══════════════
# Formato: modelo -> [métodos permitidos]
ALLOWED_OPERATIONS = {
    "product.template":  ["search_read"],
    "product.product":   ["search_read"],
    "res.partner":       ["search_read", "create"],
    "crm.lead":          ["search_read", "create"],
    "sale.order":        ["search_read", "read", "create", "execute_kw"],
    "sale.order.line":   ["search_read", "read", "create"],
    "ir.attachment":     ["search_read", "read", "create"],
    "project.task":      ["search_read", "read", "write"],
}

# Métodos de execute_kw permitidos (para action_confirm, etc.)
ALLOWED_EXECUTE_KW = {
    "sale.order": ["action_confirm"],
}

# ═══════════════ SANITIZACIÓN DE INPUTS ═══════════════
INJECTION_PATTERNS = [
    r"ignora\s+(tus\s+)?instrucciones",
    r"olvida\s+(tu\s+)?prompt",
    r"act[uú]a\s+como",
    r"eres\s+ahora",
    r"nuevo\s+rol",
    r"system\s*prompt",
    r"jailbreak",
    r"DAN\s+mode",
    r"developer\s+mode",
    r"ignore\s+(all\s+)?previous",
    r"forget\s+(your\s+)?instructions",
    r"pretend\s+you\s+are",
    r"execute\s+sql",
    r"DROP\s+TABLE",
    r"DELETE\s+FROM",
    r"UPDATE\s+.*SET",
    r"--\s*admin",
    r"sudo\s+",
    r"rm\s+-rf",
    r"unlink",   # Odoo delete
    r"write.*ir\.rule",   # Intentar cambiar reglas de acceso
]

# Máximo de llamadas MCP por conversación (rate limit)
MAX_MCP_CALLS_PER_SESSION = 30

class MCPFirewall:
    def __init__(self):
        self.call_count = 0
    
    def sanitize_input(self, text):
        """
        Revisa el texto del usuario buscando patrones de inyección.
        Retorna (is_safe, cleaned_text).
        """
        if not text:
            return True, text
            
        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                print(f"🛡️ [FIREWALL] Patrón de inyección detectado: '{pattern}' en mensaje del cliente.")
                # En lugar de bloquear, limpiamos el mensaje
                cleaned = re.sub(pattern, "[contenido filtrado]", text, flags=re.IGNORECASE)
                return False, cleaned
        
        return True, text
    
    def validate_mcp_call(self, method, model, kwargs):
        """
        Valida que la llamada MCP esté dentro de la whitelist.
        Retorna (is_allowed, reason).
        """
        # Rate limiting
        self.call_count += 1
        if self.call_count > MAX_MCP_CALLS_PER_SESSION:
            return False, f"Límite de {MAX_MCP_CALLS_PER_SESSION} llamadas MCP alcanzado."
        
        # Verificar modelo
        if model not in ALLOWED_OPERATIONS:
            return False, f"Modelo '{model}' no está en la whitelist."
        
        # Verificar método
        allowed_methods = ALLOWED_OPERATIONS[model]
        if method not in allowed_methods:
            return False, f"Método '{method}' no permitido para '{model}'. Permitidos: {allowed_methods}"
        
        # Verificar execute_kw (métodos específicos de Odoo)
        if method == "execute_kw":
            kw_method = kwargs.get("method", "")
            allowed_kw = ALLOWED_EXECUTE_KW.get(model, [])
            if kw_method not in allowed_kw:
                return False, f"execute_kw '{kw_method}' no permitido para '{model}'."
        
        return True, "OK"
    
    def validate_llm_output(self, text):
        """
        Verifica que la respuesta del LLM no contenga contenido peligroso.
        """
        if not text:
            return True, text
            
        dangerous = [
            r"subprocess\.run",
            r"os\.system",
            r"eval\(",
            r"exec\(",
            r"__import__",
        ]
        
        for pattern in dangerous:
            if re.search(pattern, text, re.IGNORECASE):
                print(f"🛡️ [FIREWALL] Respuesta del LLM contiene patrón peligroso: {pattern}")
                return False, "Lo siento, no puedo procesar esa solicitud. ¿En qué más te puedo ayudar con uniformes?"
        
        return True, text

    def reset(self):
        """Reinicia el contador de llamadas (al iniciar nueva sesión)."""
        self.call_count = 0
