# -*- coding: utf-8 -*-
import os
import sys
import json
import subprocess

def check_account_health(bin_path, store_path, name):
    print(f"\n=========================================")
    print(f" Verificando estado canal de {name.upper()}")
    print(f"=========================================")
    
    if not os.path.exists(store_path):
        print(f"[-] No se encontró la carpeta de base de datos en: {store_path}")
        print(f"[!] Se requiere vincular el canal por primera vez usando: scripts\\auth_{name}.ps1")
        return False
        
    try:
        # Run wacli doctor --json
        cmd = [bin_path, "doctor", "--json", "--store", store_path]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        try:
            payload = json.loads(result.stdout)
        except Exception:
            print("[-] Error parseando la respuesta del diagnóstico local.")
            return False
            
        if not payload.get("success"):
            print(f"[-] Error devuelto por wacli doctor: {payload.get('error')}")
            return False
            
        data = payload.get("data", {})
        authenticated = data.get("authenticated", False)
        connected = data.get("connected", False)
        conn_state = data.get("connection_state", "disconnected")
        lock_held = data.get("lock_held", False)
        
        print(f"[*] Almacen: {data.get('store_dir')}")
        print(f"[*] Bloqueado por otro proceso: {'SI' if lock_held else 'NO'}")
        print(f"[*] Autenticado (Vinculado): {'SI' if authenticated else 'NO'}")
        print(f"[*] Conectado a WhatsApp: {'SI' if connected else 'NO'}")
        print(f"[*] Estado de conexion: {conn_state}")
        
        # Give exact scanning guide if disconnected/unauthenticated
        if not authenticated:
            print(f"\n[!] ALERTA: La cuenta de {name.upper()} NO esta vinculada.")
            print(f"-> Solucion: Ejecuta el script de vinculacion para escanear el QR:")
            print(f"   PowerShell -ExecutionPolicy Bypass -File scripts\\auth_{name}.ps1")
            return False
        elif conn_state == "locked_by_other_process":
            print(f"\n[!] ALERTA: La base de datos de {name.upper()} esta bloqueada por otro proceso.")
            print(f"-> Solucion: Cierra cualquier otra ventana de PowerShell u proceso que ejecute 'wacli sync'.")
            return False
        elif not connected:
            print(f"\n[i] Info: La cuenta de {name.upper()} esta vinculada, pero actualmente inactiva (desconectada).")
            print(f"-> Se reconectara automaticamente bajo demanda o al iniciar una sincronizacion.")
            
        return True
    except Exception as e:
        print(f"[-] Fallo ejecutando el comando de diagnostico: {e}")
        return False

def main():
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    bin_path = os.path.join(project_root, "bin", "wacli.exe")
    
    if not os.path.exists(bin_path):
        print(f"[-] Error critico: No se encontro el binario wacli.exe en: {bin_path}")
        sys.exit(1)
        
    store_javier = os.path.join(project_root, "stores", "javier")
    store_paola = os.path.join(project_root, "stores", "paola")
    
    health_javier = check_account_health(bin_path, store_javier, "javier")
    health_paola = check_account_health(bin_path, store_paola, "paola")
    
    print("\n=========================================")
    print(" Resumen de Diagnostico Final")
    print("=========================================")
    print(f"Canal Javier: {'FUNCIONAL' if health_javier else 'REQUIERE ATENCION'}")
    print(f"Canal Paola:  {'FUNCIONAL' if health_paola else 'REQUIERE ATENCION'}")
    print("=========================================\n")

if __name__ == "__main__":
    main()
