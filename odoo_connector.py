import os
import re
import socket
import urllib.parse
import xmlrpc.client
from dotenv import load_dotenv
from mcp_firewall import MCPFirewall

# Cargar variables de entorno desde .env localmente
load_dotenv()

# Credenciales Odoo — requiere .env; desarrollo local apunta a instancia test.
LIFE_DEPORTES_CONFIG = {
    "url": os.getenv("ODOO_URL") or os.getenv("ODOO_LIFEDEPORTES_URL"),
    "db": os.getenv("ODOO_DB") or os.getenv("ODOO_LIFEDEPORTES_DB"),
    "username": os.getenv("ODOO_USERNAME") or os.getenv("ODOO_LIFEDEPORTES_USERNAME"),
    "password": os.getenv("ODOO_PASSWORD") or os.getenv("ODOO_LIFEDEPORTES_PASSWORD"),
    "timeout": int(os.getenv("ODOO_TIMEOUT", "15")),
    "verify_ssl": os.getenv("ODOO_VERIFY_SSL", "1").lower() in ["1", "true", "yes"]
}

class OdooClient:
    """Implementación nativa de cliente XML-RPC para Odoo."""
    def __init__(self, url, db, username, password, timeout=15, verify_ssl=True):
        if not re.match(r'^https?://', url): url = f"https://{url}"
        self.url = url.rstrip('/')
        self.db, self.username, self.password = db, username, password
        self.timeout, self.verify_ssl = timeout, verify_ssl
        self.uid = None
        
        # Setup XML-RPC proxies
        is_https = self.url.startswith('https://')
        self._common = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/common")
        self._models = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/object")
        self._authenticate()

    def _authenticate(self):
        try:
            print(f"🔌 Conectando a {self.url}...")
            self.uid = self._common.authenticate(self.db, self.username, self.password, {})
            if not self.uid:
                raise ValueError("Autenticación fallida: Usuario o contraseña incorrectos.")
            print(f"✅ Autenticado en Odoo (uid={self.uid})")
        except Exception as e:
            raise ConnectionError(f"Error al conectar con Odoo: {e}")

    def execute_method(self, model, method, *args, **kwargs):
        return self._models.execute_kw(self.db, self.uid, self.password, model, method, args, kwargs)

_client = None
_firewall = MCPFirewall()

def get_client():
    """Singleton del cliente Odoo para no reconectarse en cada llamada."""
    global _client
    if _client is None:
        missing = [k for k, v in LIFE_DEPORTES_CONFIG.items() if k in ("url", "db", "username", "password") and not v]
        if missing:
            raise EnvironmentError(
                "Faltan credenciales Odoo en .env (ODOO_LIFEDEPORTES_* / ODOO_*). "
                "Desarrollo local debe usar la instancia test."
            )
        _client = OdooClient(**LIFE_DEPORTES_CONFIG)
    return _client

def mcp_odoo_executor(method, model, kwargs):
    """
    Ejecutor real de MCP con Firewall integrado.
    Reemplaza la función simulada del agent_orchestrator.
    """
    # ═══ FIREWALL ═══
    allowed, reason = _firewall.validate_mcp_call(method, model, kwargs)
    if not allowed:
        print(f"🛡️ [FIREWALL] BLOQUEADO: {reason}")
        return {"success": False, "error": reason}
    
    client = get_client()
    print(f"✅ [MCP REAL] {method} > {model}")
    
    try:
        if method == 'search_read':
            domain = kwargs.get('domain', [])
            fields = kwargs.get('fields', [])
            limit = kwargs.get('limit', 10)
            # Bypass de odoo_mcp.search_read (tiene bug con offset en Odoo v19)
            # Usamos xmlrpc directo con los kwargs correctos de Odoo
            import xmlrpc.client
            models_proxy = xmlrpc.client.ServerProxy(f"{client.url}/xmlrpc/2/object")
            kw = {}
            if fields:
                kw['fields'] = fields
            if limit:
                kw['limit'] = limit
            result = models_proxy.execute_kw(
                client.db, client.uid, client.password,
                model, 'search_read', [domain], kw
            )
            return {"success": True, "result": result}
        
        elif method == 'read':
            ids = kwargs.get('ids', [])
            fields = kwargs.get('fields', None)
            result = client.read_records(model, ids, fields=fields)
            return {"success": True, "result": result}
        
        elif method == 'create':
            vals = kwargs.get('vals', {})
            result = client.execute_method(model, 'create', [vals])
            return {"success": True, "result": result}
        
        elif method == 'write':
            ids = kwargs.get('ids', [])
            vals = kwargs.get('vals', {})
            result = client.execute_method(model, 'write', ids, vals)
            return {"success": True, "result": result}
        
        elif method == 'execute_kw':
            kw_method = kwargs.get('method', '')
            args = kwargs.get('args', [])
            result = client.execute_method(model, kw_method, *args)
            return {"success": True, "result": result}
        
        else:
            return {"success": False, "error": f"Método '{method}' no implementado"}
    
    except Exception as e:
        print(f"❌ [MCP ERROR] {e}")
        return {"success": False, "error": str(e)}


# Test rápido si se ejecuta directamente
if __name__ == "__main__":
    print("=== Test de conexión a Odoo Life Deportes ===")
    result = mcp_odoo_executor('search_read', 'product.template', {
        'domain': [['sale_ok', '=', True]],
        'fields': ['name', 'list_price'],
        'limit': 5
    })
    print(f"Productos encontrados: {len(result.get('result', []))}")
    for p in result.get('result', []):
        print(f"  - {p['name']}: ${p['list_price']}")
