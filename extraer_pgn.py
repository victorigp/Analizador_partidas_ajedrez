import sys
import re
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

def extraer_pgn_chesscom(url):
    print(f"Abriendo navegador para: {url}")
    
    from browser_utils import iniciar_navegador
    with sync_playwright() as p:
        browser = iniciar_navegador(p, headless=True)
        page = browser.new_page()
        page.goto(url)
        
        # Esperamos a que cargue el tablero y los movimientos
        print("Esperando a que cargue la página...")
        page.wait_for_timeout(3000) # 3 segundos para asegurar que el JS renderiza
        
        # Cerrar banner de cookies si existe
        try:
            page.locator('text="I Accept"').click(timeout=2000)
            page.wait_for_timeout(500)
        except:
            pass
            
        # Cerrar modal de "Black Won" / "Game Over"
        try:
            page.keyboard.press("Escape")
            page.locator('button[aria-label="Close"]').click(timeout=1000)
        except:
            pass
            
        # Intentar obtener el PGN directamente de la página (a veces funciona)
        texto_pagina = page.evaluate("document.body.innerText")
        patron_pgn = re.search(r'\[Event ".*?"\].*?(?:1-0|0-1|1/2-1/2|\*)', texto_pagina, re.DOTALL)
        
        if patron_pgn:
            print("\n[Ok] PGN Encontrado con Playwright en el texto!\n")
            print(patron_pgn.group(0))
            pgn = patron_pgn.group(0)
        else:
            print("[Aviso] Buscando en el boton de compartir...")
            try:
                # Clic forzado en el botón de compartir ignorando otros elementos encima
                page.locator('button[aria-label="Share"]').click(force=True, timeout=3000)
                page.locator('text=PGN').click(timeout=2000)
                # Extraer el texto del textarea de PGN
                pgn = page.locator('div.share-menu-tab-pgn-textarea textarea, textarea.share-menu-tab-pgn-textarea, textarea').first.input_value()
                print("\n[Ok] PGN Extraido desde la ventana de compartir!\n")
                print(pgn)
            except Exception as e:
                print("[Error] Tampoco se pudo extraer desde la interfaz de compartir.")
                pgn = None
                
        browser.close()
        return pgn

if __name__ == "__main__":
    # Prueba rápida cuando se ejecuta este archivo directamente
    url_ejemplo = "https://www.chess.com/game/computer/2253545720"
    print(f"Ejecutando prueba independiente con: {url_ejemplo}")
    extraer_pgn_chesscom(url_ejemplo)
