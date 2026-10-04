import sys
sys.stdout.reconfigure(encoding='utf-8')
from extraer_pgn import extraer_pgn_chesscom

def main():
    print("=" * 50)
    print("ANALIZADOR DE PARTIDAS")
    print("=" * 50)
    print()
    from login_manual import verificar_y_configurar_sesion
    if not verificar_y_configurar_sesion():
        print("\n[Parada] Por favor, configura tu sesión de Lichess antes de continuar.")
        return
        
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
        
    # Limpiar parametros de la URL (ej: ?move=0)
    url = url.split("?")[0]

    # Inicializar Resultados.txt vacío al arrancar el script
    with open("Resultados.txt", "w", encoding="utf-8") as f:
        f.write("Iniciando analisis para: " + url + "\n\n")

    # PASO 1: Extraccion
    print("\n--- PASO 1: Extraccion del PGN ---")
    pgn = extraer_pgn_chesscom(url)
    if not pgn:
        print("[Error] Fallo en la extraccion del PGN.")
        return
        
    # Añadir Paso 1 en Resultados.txt
    with open("Resultados.txt", "a", encoding="utf-8") as f:
        f.write("==================================================\n")
        f.write("PGN ORIGINAL (CHESS.COM)\n")
        f.write("==================================================\n")
        f.write(pgn)
        f.write("\n\n")
    
    # PASO 2: Importacion a Lichess
    print("\n--- PASO 2: Importacion a Lichess ---")
    from lichess_api import importar_a_lichess
    game_id, url_lichess, pgn_anotado = importar_a_lichess(pgn)
    
    if not pgn_anotado:
        print("[Error] Fallo en el analisis de Lichess.")
        return
        
    print("\n[PGN Anotado recuperado con exito]")
    
    # Añadir Paso 2 en Resultados.txt
    with open("Resultados.txt", "a", encoding="utf-8") as f:
        f.write("==================================================\n")
        f.write("PGN ANOTADO (LICHESS.ORG)\n")
        f.write("==================================================\n")
        f.write(pgn_anotado)
        f.write("\n\n")
    
    # PASO 3: IA de Google
    print("\n--- PASO 3: Analisis de IA de Google ---")
    from analisis_ia import analizar_pgn_con_ia
    explicacion = analizar_pgn_con_ia(pgn, pgn_anotado)
    
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
