import sys
sys.stdout.reconfigure(encoding='utf-8')
import re
import os
import time
from playwright.sync_api import sync_playwright

def _cargar_env():
    env_vars = {}
    try:
        with open('.env', 'r') as f:
            for linea in f:
                linea = linea.strip()
                if linea and not linea.startswith('#'):
                    if '=' in linea:
                        key, val = linea.split('=', 1)
                        env_vars[key.strip()] = val.strip()
    except Exception:
        pass
    return env_vars

def importar_a_lichess(pgn, reintentos=1):
    """
    Automatiza la subida del PGN a Lichess vía Web imitando el comportamiento humano.
    Usa la cookie de sesión guardada previamente para evitar captchas.
    """
    print("\n[Lichess] Abriendo Lichess en el navegador (invisible)...")
    
    env_vars = _cargar_env()
    lichess_cookie = env_vars.get("LICHESS_COOKIE")
    
    if not lichess_cookie:
        print("[Error] No se ha encontrado LICHESS_COOKIE en tu archivo .env.")
        print("Por favor, ejecuta primero: python login_manual.py")
        return None, None, None
    
    from browser_utils import iniciar_navegador
    
    class CookieInvalidaException(Exception):
        pass
        
    try:
        with sync_playwright() as p:
            browser = iniciar_navegador(p, headless=True)
                    
            # Inyectamos la cookie directamente al contexto
            context = browser.new_context()
            context.add_cookies([{
                "name": "lila2",
                "value": lichess_cookie,
                "domain": "lichess.org",
                "path": "/"
            }])
            page = context.new_page()
            
            print("[Lichess] Navegando a la pagina de importacion...")
            page.goto("https://lichess.org/paste")
            page.wait_for_timeout(2000)
            
            # Validar si estamos logueados o si la cookie ha caducado
            if page.locator('#user_tag').count() == 0:
                raise CookieInvalidaException()
                
            # Eliminamos el banner de cookies del DOM
            page.evaluate("""
                const banners = document.querySelectorAll('.cc-window, .consent-overlay, [id*="cookie"]');
                banners.forEach(b => b.remove());
            """)
            
            # Escribimos el primer trozo como humano para engañar al sistema anti-bot de Lichess que desactiva el boton
            page.locator('textarea[name="pgn"]').press_sequentially(pgn[:20], delay=50)
            page.locator('textarea[name="pgn"]').fill(pgn)
            page.wait_for_timeout(500)
            
            # Forzar activar el checkbox de analisis (universal, sin depender del idioma)
            try:
                page.evaluate('document.querySelectorAll("input[type=checkbox]").forEach(cb => cb.checked = true)')
                # Tambien intentamos con el locator por si acaso
                page.locator('input[type="checkbox"]').last.check(force=True)
                print("[Lichess] Checkbox de analisis de Stockfish marcado con exito.")
            except Exception as e:
                print(f"[Aviso] Fallo al marcar el checkbox de analisis: {e}")
                
            page.wait_for_timeout(500)
            
            # Clic en Importar (forzamos activar el boton por si acaso Lichess lo bloquea)
            page.evaluate('document.querySelector("button.submit").disabled = false')
            page.locator('button.submit').click(force=True)
            
            print("[Lichess] Partida importada. Esperando redireccion...")
            
            try:
                page.wait_for_url(lambda url: "paste" not in url, timeout=15000)
            except:
                print("[Error] Lichess no redirigio despues de importar. Posible bloqueo anti-bot.")
                browser.close()
                return None, None, None
                
            url_lichess = page.url
            id_partida = url_lichess.split('/')[-1]
            if "black" in id_partida or "white" in id_partida:
                id_partida = url_lichess.split('/')[-2]
                
            print(f"[Ok] Partida cargada! URL: {url_lichess}")
            
            print("[Lichess] Esperando a que el analisis en el servidor termine...")
            
            pgn_generado = None
            
            # Polling ultra robusto mediante API en lugar de DOM (evita que las descargas de archivo rompan la lectura)
            for i in range(30):
                print(f"\r   Analizando en servidor... (intento {i+1}/30)", end="", flush=True)
                page.wait_for_timeout(2000)
                try:
                    # Usamos el contexto de Playwright para hacer una peticion GET HTTP a la API de exportacion
                    # Esto mantiene tus cookies y evita el problema de las descargas en el navegador
                    response = page.request.get(f"https://lichess.org/game/export/{id_partida}?evals=true&clocks=false", headers={'Accept': 'application/x-chess-pgn'})
                    if response.ok:
                        pgn_texto = response.text()
                        if "[%eval" in pgn_texto or "Blunder" in pgn_texto or "Mistake" in pgn_texto or "Inaccuracy" in pgn_texto:
                            print("\n[Ok] Analisis completado y PGN anotado extraido exitosamente!")
                            pgn_generado = pgn_texto
                            break
                except Exception as e:
                    pass
                    
            if not pgn_generado:
                print("\n[Aviso] No se pudieron obtener las anotaciones a tiempo.")
                
            _borrar_partida(page, id_partida)
            browser.close()
            return id_partida, url_lichess, pgn_generado
    
    except CookieInvalidaException:
        print("\n[Error] Lichess no te reconoce. ¡Tu sesion (cookie) parece ser invalida o estar caducada!")
        from login_manual import verificar_y_configurar_sesion
        print("[Info] Relanzando configurador de sesion de Lichess...")
        if verificar_y_configurar_sesion(forzar=True) and reintentos > 0:
            print("\n[Info] Reintentando la importacion con la nueva sesion...")
            return importar_a_lichess(pgn, reintentos=reintentos-1)
        return None, None, None

def _borrar_partida(page, id_partida):
    print("[Lichess] Borrando la partida importada para limpiar la cuenta...")
    try:
        # Lichess permite borrar directamente desde la pagina de la partida si somos el dueño
        page.goto(f"https://lichess.org/{id_partida}")
        page.wait_for_timeout(1000)
        
        # Paso 1: Clic en el boton de borrar que abre el popup personalizado
        delete_button = page.locator(f'form.delete[action="/{id_partida}/delete"] button[type="submit"]')
        
        if delete_button.count() > 0:
            delete_button.first.click(timeout=5000, force=True)
            page.wait_for_timeout(500) # Esperar a que el popup se anime
            
            # Paso 2: Clic en el boton de confirmacion dentro del popup
            confirm_button = page.locator('.dialog-content button.ok')
            if confirm_button.count() > 0:
                confirm_button.first.click(timeout=3000, force=True)
                page.wait_for_timeout(1000) # Dar tiempo a la peticion ajax
                print("[Ok] Partida borrada exitosamente.")
            else:
                print("[Aviso] Se pulso borrar pero no aparecio el popup de confirmacion.")
        else:
            print("[Aviso] No se encontro el formulario de borrar para esta partida.")
    except Exception as e:
        print(f"[Aviso] Fallo al intentar borrar la partida: {e}")
