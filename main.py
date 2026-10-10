import sys
import builtins
import os
import threading
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

# Habilitar secuencias ANSI en la consola de Windows
os.system("")

# Guardamos las funciones originales
original_print = builtins.print
original_input = builtins.input

web_logs = []
is_web_mode = False
web_input_event = threading.Event()
web_input_value = ""

class StatusHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/status':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"logs": web_logs}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
            
    def do_POST(self):
        global web_input_value
        if self.path == '/input':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                web_input_value = data.get('input', '')
                web_input_event.set()
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
            except Exception:
                self.send_response(400)
                self.end_headers()
        elif self.path == '/exit':
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            import os
            os._exit(0)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass

def start_server():
    try:
        server = HTTPServer(('localhost', 8765), StatusHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
    except Exception:
        pass

# Iniciar servidor en background
start_server()

def custom_print(*args, **kwargs):
    # Guardar texto original para web
    if args and isinstance(args[0], str):
        web_logs.append(str(args[0]))
        
    # Solo aplicamos colores al texto sin afectar los argumentos adicionales de print (ej. end="")
    if args and isinstance(args[0], str):
        text = str(args[0])
        # Errores y Avisos en Rojo
        if "[Error]" in text or "[Aviso]" in text or "[Advertencia]" in text or "[Parada]" in text:
            args = (f"\033[91m{text}\033[0m",) + args[1:]
        # Opciones de menu en Verde
        elif "1. Utilizar otro modelo de IA" in text or "2. Salir" in text or "¿Qué deseas hacer?" in text:
            args = (f"\033[92m{text}\033[0m",) + args[1:]
    original_print(*args, **kwargs)

def custom_input(prompt=""):
    global is_web_mode, web_input_value
    if is_web_mode:
        web_logs.append(f"[WEB_INPUT_REQUIRED] {prompt}")
        original_print(f"\033[93m[Web Mode] Esperando input interactivo desde la web: {prompt}\033[0m")
        web_input_event.clear()
        web_input_event.wait()
        val = web_input_value
        web_logs.append(val + "\n")
        return val
    # Todos los prompts donde el usuario deba introducir algo serán Verdes
    return original_input(f"\033[92m{prompt}\033[0m")

builtins.print = custom_print
builtins.input = custom_input

sys.stdout.reconfigure(encoding='utf-8')
from extraer_pgn import extraer_pgn_chesscom

def main():
    print("=" * 50)
    print(" ANALIZADOR DE PARTIDAS")
    print("=" * 50)
    print()

    url = ""
    if len(sys.argv) > 1:
        url = sys.argv[1]
        # Limpiar el prefijo del protocolo si viene del navegador
        if url.startswith("ajedrez://"):
            url = url[len("ajedrez://"):]
            # A veces los navegadores añaden una barra al final
            if url.endswith("/"):
                url = url[:-1]
                
            # A veces los navegadores al procesar un doble protocolo (ajedrez://https://)
            # se comen los dos puntos y dejan https//. Lo arreglamos:
            if url.startswith("https//"):
                url = "https://" + url[7:]
            elif url.startswith("http//"):
                url = "http://" + url[6:]
    else:
        portapapeles = ""
        try:
            import tkinter as tk
            root = tk.Tk()
            root.withdraw()
            portapapeles = root.clipboard_get().strip()
            root.update()
            root.destroy()
        except Exception as e:
            pass
            
        if "chess.com/game" in portapapeles:
            import re
            match = re.search(r'(?:https?[:/]+)?(?:www\.)?chess\.com/game/\S+', portapapeles)
            if match:
                url_limpia = match.group(0)
                # Arreglar protocolos deformados o inexistentes
                if url_limpia.startswith("https//"):
                    url_limpia = "https://" + url_limpia[7:]
                elif url_limpia.startswith("http//"):
                    url_limpia = "http://" + url_limpia[6:]
                elif not url_limpia.startswith("http"):
                    url_limpia = "https://" + url_limpia
                    
                print(f"\n[Info] ¡Partida detectada en el portapapeles! Iniciando análisis automático...")
                print(f"URL: {url_limpia}")
                url = url_limpia
        if not url:
            url = input("\nIntroduce la URL de la partida de Chess.com: ").strip()
            
    if url:
        import re
        match = re.search(r'(?:https?[:/]+)?(?:www\.)?chess\.com/game/\S+', url)
        if match:
            url = match.group(0)
            if url.startswith("https//"):
                url = "https://" + url[7:]
            elif url.startswith("http//"):
                url = "http://" + url[6:]
            elif not url.startswith("http"):
                url = "https://" + url
                
    if not url or "chess.com/game" not in url:
        print("\n[Error] URL inválida. Debe ser un enlace a una partida de Chess.com.")
        return
        
    # Extraer payload si existe
    if "?payload=" in url or "&payload=" in url:
        global is_web_mode
        is_web_mode = True
        
        import urllib.parse
        import base64
        import json
        
        parsed_url = urllib.parse.urlparse(url)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        if 'payload' in query_params:
            try:
                payload_b64 = query_params['payload'][0]
                payload_json = base64.b64decode(payload_b64).decode('utf-8')
                config_data = json.loads(payload_json)
                
                # Actualizar el archivo .env
                env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
                env_lines = []
                if os.path.exists(env_path):
                    with open(env_path, "r", encoding="utf-8") as f:
                        env_lines = f.readlines()
                
                # Para cada clave, la reemplazamos si existe o la añadimos
                keys_actualizadas = []
                for key, value in config_data.items():
                    if value is None or value == "":
                        continue # No sobreescribir con valores vacíos
                    
                    keys_actualizadas.append(key)
                    key_found = False
                    for i, line in enumerate(env_lines):
                        if line.startswith(f"{key}=") or line.startswith(f"#{key}="):
                            env_lines[i] = f"{key}={value}\n"
                            key_found = True
                            break
                    if not key_found:
                        env_lines.append(f"{key}={value}\n")
                        
                with open(env_path, "w", encoding="utf-8") as f:
                    f.writelines(env_lines)
            except Exception as e:
                import traceback
                print(f"\n[Error] No se pudo procesar la configuración. Detalles: {e}")
                traceback.print_exc()

    # Limpiar parametros de la URL (ej: ?move=0)
    url = url.split("?")[0]

    from login_manual import verificar_y_configurar_sesion
    is_web_mode = len(sys.argv) > 1
    if not verificar_y_configurar_sesion(is_web_mode=is_web_mode):
        print("\n[Parada] Por favor, configura tu sesión de Lichess antes de continuar.")
        return

    # Inicializar Resultados.txt vacío al arrancar el script
    with open("Resultados.txt", "w", encoding="utf-8") as f:
        f.write("Iniciando analisis para: " + url + "\n\n")

    # PASO 1: Extraccion
    print("\n--- PASO 1: Extraccion del PGN ---")
    while True:
        pgn = extraer_pgn_chesscom(url)
        if not pgn:
            print("[Error] Fallo en la extraccion del PGN.")
            opcion = input("¿Deseas reintentar la extracción? (S/N): ").strip().lower()
            if opcion == 's':
                print("\nReintentando...")
                continue
            else:
                return
        break
        
    # Añadir Paso 1 en Resultados.txt
    with open("Resultados.txt", "a", encoding="utf-8") as f:
        f.write("==================================================\n")
        f.write("PGN ORIGINAL (CHESS.COM)\n")
        f.write("==================================================\n")
        f.write(pgn)
        f.write("\n\n")
    
    # PASO 2: Análisis Local
    print("\n--- PASO 2: Análisis Local con Stockfish ---")
    from local_analysis import analyze_pgn
    pgn_anotado = analyze_pgn(pgn)
    stats = None # Las estadísticas de Lichess ya no se usan
    
    if not pgn_anotado:
        print("[Error] Fallo en el analisis local.")
        return
        
    print("\n[PGN Anotado generado con exito]")
    
    # Añadir Paso 2 en Resultados.txt
    with open("Resultados.txt", "a", encoding="utf-8") as f:
        f.write("==================================================\n")
        f.write("PGN ANOTADO (LICHESS.ORG)\n")
        f.write("==================================================\n")
        f.write(pgn_anotado)
        f.write("\n\n")
    
    # PASO 3: IA de Google
    print("\n--- PASO 3: Analisis de IA de Google ---")

    print(f"\n[Info] Si tienes instalado el script opcional de Tampermonkey, el estudio de Lichess con la partida se abrirá en tu navegador habitual directamente.")

    from analisis_ia import analizar_pgn_con_ia
    explicacion = analizar_pgn_con_ia(pgn, pgn_anotado, stats)
    
    # Añadir Paso 3 en Resultados.txt
    if not explicacion or "Ocurrio un error" in explicacion or "Cancelado por el usuario" in explicacion or "requiere un API Key" in explicacion:
        print(f"\n[Aviso] Se aborta la creacion del estudio debido a un problema con la IA.")
        print(f"[Detalle] {explicacion}")
        return
        
    with open("Resultados.txt", "a", encoding="utf-8") as f:
        f.write("==================================================\n")
        f.write("ANALISIS DE IA (GOOGLE GEMINI)\n")
        f.write("==================================================\n")
        f.write(explicacion)
            
    print("\n==================================================")
    print("REPORTE DE LA IA")
    print("==================================================")
    print(explicacion)
    
    # PASO 4: Crear Estudio
    print("\n--- PASO 4: Creacion de Estudio en Lichess ---")
    import crear_estudio
    crear_estudio.crear_estudio_desde_txt()
    
if __name__ == "__main__":
    main()
