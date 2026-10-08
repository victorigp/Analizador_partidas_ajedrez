import os
import sys
from playwright.sync_api import sync_playwright
from browser_utils import _get_default_browser_path

def _cargar_env():
    env_vars = {}
    if os.path.exists('.env'):
        with open('.env', 'r') as f:
            for linea in f:
                linea = linea.strip()
                if linea and not linea.startswith('#') and '=' in linea:
                    key, val = linea.split('=', 1)
                    env_vars[key.strip()] = val.strip()
    return env_vars

def obtener_ruta_perfil(executable_path):
    path_lower = executable_path.lower()
    local_app_data = os.environ.get('LOCALAPPDATA')
    if not local_app_data:
        return None, None
        
    if "brave" in path_lower:
        return os.path.join(local_app_data, "BraveSoftware", "Brave-Browser", "User Data"), "Brave"
    elif "chrome" in path_lower:
        return os.path.join(local_app_data, "Google", "Chrome", "User Data"), "Google Chrome"
    elif "msedge" in path_lower or "edge" in path_lower:
        return os.path.join(local_app_data, "Microsoft", "Edge", "User Data"), "Microsoft Edge"
        
    return None, None

def guardar_cookie_env(cookie_val):
    env_lines = []
    if os.path.exists(".env"):
        with open(".env", "r") as f:
            env_lines = f.readlines()
            
    with open(".env", "w") as f:
        encontrado = False
        for linea in env_lines:
            if linea.startswith("LICHESS_COOKIE="):
                f.write(f"LICHESS_COOKIE={cookie_val}\n")
                encontrado = True
            else:
                f.write(linea)
        if not encontrado:
            if env_lines and not env_lines[-1].endswith('\n'):
                f.write("\n")
            f.write(f"LICHESS_COOKIE={cookie_val}\n")

def verificar_y_configurar_sesion(forzar=False):
    """
    Verifica si existe la cookie en el .env.
    Si no existe o si forzar=True, ofrece un menu guiado para extraerla automaticamente
    o instruir sobre la extraccion manual.
    """
    if not forzar:
        env_vars = _cargar_env()
        cookie = env_vars.get("LICHESS_COOKIE")
        # Validacion rapida (la cookie lila2 suele ser bastante larga)
        if cookie and len(cookie) > 20:
            return True

    print("\n==================================================")
    print("🔑 CONFIGURACION DE SESION LICHESS")
    print("==================================================")
    print("Para crear el estudio en Lichess,")
    print("necesitamos tu cookie de sesion ('lila2').")
    print("\nPuedes configurar esto de dos formas:")
    print(" 1) Manualmente: Usando la Configuración del botón en Chess.com si has instalado el script de Tampermonkey, o editando el archivo .env")
    print(" 2) Automaticamente: El script puede extraerla de tu navegador (requiere cerrarlo un momento).")
    print("==================================================")
    
    opcion = input("\n¿Quieres intentar extraerla automaticamente de tu navegador? (S/N): ").strip().lower()
    
    if opcion == 's':
        executable_path = _get_default_browser_path()
        if not executable_path:
            print("[Error] No se pudo detectar tu navegador por defecto.")
        else:
            user_data_dir, browser_name = obtener_ruta_perfil(executable_path)
            if not user_data_dir:
                print("[Error] Navegador no soportado para extraccion automatica.")
            else:
                print(f"\nDetectado: {browser_name}.")
                while True:
                    print(f"⚠️ IMPORTANTE: Cierra POR COMPLETO {browser_name} ahora mismo.")
                    print("(Si se queda abierto en segundo plano, este proceso fallara).")
                    
                    input("Pulsa ENTER cuando lo hayas cerrado TOTALMENTE...")
                    
                    print("\nExtrayendo cookie de tu perfil local...")
                    with sync_playwright() as p:
                        try:
                            context = p.chromium.launch_persistent_context(
                                user_data_dir=user_data_dir,
                                executable_path=executable_path,
                                headless=True,
                                args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
                                timeout=60000
                            )
                            cookies = context.cookies("https://lichess.org")
                            lila2_cookie = next((c for c in cookies if c['name'] == 'lila2'), None)
                            
                            if lila2_cookie:
                                guardar_cookie_env(lila2_cookie['value'])
                                print("\n[Ok] ¡Cookie extraida con exito y guardada en tu archivo .env!")
                                context.close()
                                return True
                            else:
                                print("\n[Error] No se encontro la sesion de Lichess en tu navegador.")
                                context.close()
                                break
                        except Exception as e:
                            print(f"\n[Error] No se pudo acceder al perfil. Detalles: {e}")
                            print("Sugerencia: El navegador puede tardar unos segundos en cerrarse completamente en segundo plano, o el tiempo de espera fue corto para un perfil pesado.")
                            reintento = input("¿Deseas intentarlo de nuevo? (S/N): ").strip().lower()
                            if reintento != 's':
                                break
                
    print("\n[Info] Configuración manual requerida:")
    print("1. Abre Lichess.org en tu navegador y asegúrate de haber iniciado sesion.")
    print("2. Pulsa F12 -> Ve a Application (o Aplicación) -> Cookies -> https://lichess.org")
    print("3. Busca la cookie 'lila2', copia su valor.")
    print("4. Puedes guardarla de dos formas:")
    print("   - Opcion A (Recomendada): Si has instalado el script de Tampermonkey, pega ese valor directamente en la ventana de Configuración (la rueda dentada) del botón de Analizar de Chess.com.")
    print("   - Opcion B: Abre tu archivo .env y añade/modifica la linea: LICHESS_COOKIE=tu_valor_copiado")
    print("5. Vuelve a intentar analizar la partida.")
    return False

if __name__ == "__main__":
    # Si se ejecuta directamente, forzamos la renovacion/configuracion interactiva
    verificar_y_configurar_sesion(forzar=True)
