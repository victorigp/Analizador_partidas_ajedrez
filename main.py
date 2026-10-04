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
            print(f"\n[Info] ¡Partida detectada en el portapapeles! Iniciando análisis automático...")
            print(f"URL: {portapapeles}")
            url = portapapeles
                
        if not url:
            url = input("\nIntroduce la URL de la partida de Chess.com: ").strip()
            
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
