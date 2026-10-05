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
    Automatiza la subida del PGN a Lichess vía Web 
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
            browser = iniciar_navegador(p, headless=False)
                    
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
            
            # Escribimos el primer trozo para asegurar que se activa el boton de submit
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
            
            # Clic en Importar
            page.evaluate('document.querySelector("button.submit").disabled = false')
            page.locator('button.submit').click(force=True)
            
            print("[Lichess] Partida importada. Esperando redireccion...")
            
            try:
                page.wait_for_url(lambda url: "paste" not in url, timeout=15000)
            except:
                print("[Error] Lichess no redirigio despues de importar.")
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
            for i in range(50):
                print(f"\r   Analizando en servidor... (intento {i+1}/50)", end="", flush=True)
                page.wait_for_timeout(2000)
                try:
                    # Usamos el contexto de Playwright para hacer una peticion GET HTTP a la API de exportacion
                    # Esto mantiene tus cookies y evita el problema de las descargas en el navegador
                    response = page.request.get(f"https://lichess.org/game/export/{id_partida}?evals=true&clocks=false&literate=true", headers={'Accept': 'application/x-chess-pgn'})
                    if response.ok:
                        pgn_texto = response.text()
                        if "[%eval" in pgn_texto or "Blunder" in pgn_texto or "Mistake" in pgn_texto or "Inaccuracy" in pgn_texto:
                            print("\n[Ok] Analisis completado")
                            pgn_generado = pgn_texto
                            break
                except Exception as e:
                    pass
                    
            stats = {}
            if pgn_generado:
                print("   Extrayendo estadísticas y calculando métricas adicionales...", end="", flush=True)
                
                # 1. Calcular Brillantes, Excelentes, Buenas, Libro internamente leyendo los [%eval] del PGN
                import re
                def calcular_stats_custom(pgn):
                    custom = {'white': {'Brillantes': 0, 'Excelentes': 0, 'Buenas': 0, 'De libro': 0}, 
                              'black': {'Brillantes': 0, 'Excelentes': 0, 'Buenas': 0, 'De libro': 0}}
                    
                    import urllib.request
                    import json
                    eco_set = set()
                    try:
                        req = urllib.request.Request('https://raw.githubusercontent.com/victorigp/Lichess_Detailed_Moves_2/main/data/eco.json')
                        resp = urllib.request.urlopen(req, timeout=5)
                        eco_codes = json.loads(resp.read().decode('utf-8'))
                        for eco in eco_codes:
                            eco_set.add(eco.get('moves', '').strip().lower())
                    except:
                        pass

                    body = re.sub(r'\[.*?\]\r?\n', '', pgn).strip()
                    # 1. Eliminar variaciones (anidadas)
                    temp = body
                    while '(' in temp:
                        temp = re.sub(r'\([^()]*\)', '', temp)
                    body_no_vars = temp
                    
                    # 2. Extraer evaluaciones y eliminar el resto del texto en los comentarios
                    def replace_comment(match):
                        m = re.search(r'\[%eval\s+([^\]]+)\]', match.group(0))
                        if m: return f" [%eval {m.group(1)}] "
                        return " "
                    
                    body_clean = re.sub(r'\{[^}]*\}', replace_comment, body_no_vars)
                    
                    # 3. Obtener raw_moves sin los tags de evaluación
                    body_moves_only = re.sub(r'\[%eval\s+[^\]]*\]', '', body_clean)
                    raw_moves = [m for m in body_moves_only.split() if m and not re.match(r'^\d+\.+', m) and not m.startswith('$') and m not in ('1-0', '0-1', '1/2-1/2', '*')]
                    
                    is_book_array = [False] * len(raw_moves)
                    for i in range(1, len(raw_moves) + 1):
                        seq = ""
                        for idx, m in enumerate(raw_moves[:i]):
                            clean_m = re.sub(r'[!?#+]', '', m)
                            if idx % 2 == 0: seq += f"{idx//2 + 1}. {clean_m} "
                            else: seq += f"{clean_m} "
                        seq = seq.strip().lower()
                        
                        if seq in eco_set:
                            if not raw_moves[i-1].endswith('?'):
                                c = 'white' if (i - 1) % 2 == 0 else 'black'
                                custom[c]['De libro'] += 1
                                is_book_array[i-1] = True

                    tokens = re.findall(r'(\d+\.\.\.|\d+\.|[a-zA-Z0-9\+\#\-\=\?\!]+|\[%eval\s+[^\]]*\])', body_clean)
                    current_color = 'white'
                    prev_eval = 0.0
                    last_move_was_bad = False
                    move_index = -1
                    
                    for token in tokens:
                        if re.match(r'^\d+\.$', token):
                            current_color = 'white'
                        elif re.match(r'^\d+\.\.\.$', token):
                            current_color = 'black'
                        elif token.startswith('[%eval'):
                            match = re.search(r'\[%eval\s+([^\]]+)\]', token)
                            if match:
                                val_str = match.group(1).strip()
                                if val_str.startswith('#'):
                                    val = 100.0 if not val_str.startswith('#-') else -100.0
                                else:
                                    try: val = float(val_str)
                                    except: val = 0.0
                                delta = val - prev_eval
                                
                                is_book = False
                                is_checkmate = False
                                if move_index >= 0 and move_index < len(raw_moves):
                                    is_book = is_book_array[move_index]
                                    is_checkmate = raw_moves[move_index].endswith('#')
                                    
                                if not last_move_was_bad and not is_book and not is_checkmate:
                                    if current_color == 'white':
                                        if delta >= 2.0: custom['white']['Brillantes'] += 1
                                        elif delta >= 1.0: custom['white']['Excelentes'] += 1
                                        elif delta >= 0.6: custom['white']['Buenas'] += 1
                                    else:
                                        if delta <= -2.0: custom['black']['Brillantes'] += 1
                                        elif delta <= -1.0: custom['black']['Excelentes'] += 1
                                        elif delta <= -0.6: custom['black']['Buenas'] += 1
                                        
                                if current_color == 'white': current_color = 'black'
                                else: current_color = 'white'
                                prev_eval = val
                        else:
                            if token not in ('1-0', '0-1', '1/2-1/2', '*'):
                                move_index += 1
                            if token.endswith('?') or token.endswith('??') or token.endswith('?!'):
                                last_move_was_bad = True
                            else:
                                last_move_was_bad = False
                    return custom
                
                custom_stats = calcular_stats_custom(pgn_generado)

                try:
                    # Forzar tamaño de escritorio para que Lichess no oculte las pestañas en layout móvil
                    page.set_viewport_size({"width": 1920, "height": 1080})
                    page.reload()
                    page.wait_for_timeout(3000)
                    try:
                        # Hacer clic en la pestaña "Computer analysis" (Análisis de ordenador)
                        page.evaluate("""() => {
                            if(document.querySelector('.advice-summary')) return;
                            const actTab = document.querySelector('[data-act="analysis"]');
                            if(actTab) { actTab.click(); return; }
                            for(let el of document.querySelectorAll('div, span, button, a')) {
                                const t = el.innerText ? el.innerText.toLowerCase() : '';
                                if((t.includes('ordenador') || t.includes('computer')) && (el.className.includes('tab') || el.className.includes('select'))) {
                                    el.click();
                                    break;
                                }
                            }
                        }""")
                        page.wait_for_selector(".advice-summary", timeout=10000)
                    except Exception:
                        pass
                    
                    stats = page.evaluate("""() => {
                        const s = { white: {}, black: {} };
                        const players = ['white', 'black'];
                        const summaries = document.querySelectorAll('.advice-summary__side');
                        summaries.forEach((summary, index) => {
                            if(index > 1) return;
                            const pStats = s[players[index]];
                            const extractMatch = (keyword, key) => {
                                for(let strong of summary.querySelectorAll('strong')) {
                                    if(strong.parentElement) {
                                        const text = strong.parentElement.innerText.toLowerCase();
                                        if(keyword === 'precisi' && text.includes('impre')) continue;
                                        if(text.includes(keyword)) {
                                            pStats[key] = strong.innerText.trim();
                                            return;
                                        }
                                    }
                                }
                            };
                            extractMatch('brillante', 'Brillantes');
                            extractMatch('excelente', 'Excelentes');
                            extractMatch('buenas', 'Buenas');
                            extractMatch('libro', 'De libro');
                            extractMatch('imprecisi', 'Imprecisiones');
                            extractMatch('grave', 'Graves');
                            extractMatch('centipeon', 'Centipeones');
                            extractMatch('precisi', 'Precision');
                            extractMatch('apertura', 'Apertura');
                            extractMatch('medio juego', 'MedioJuego');
                            extractMatch('mediojuego', 'MedioJuego');
                            extractMatch('final', 'Final');
                            
                            for(let strong of summary.querySelectorAll('strong')) {
                                if(strong.parentElement) {
                                    const text = strong.parentElement.innerText.toLowerCase();
                                    if((text.includes('error') || text.includes('errores')) && !text.includes('grave')) {
                                        pStats['Errores'] = strong.innerText.trim();
                                        break;
                                    }
                                }
                            }
                        });
                        return s;
                    }""")
                    
                    # Fallback robusto a la API si el DOM estaba vacío o falló la precisión
                    if not stats.get('white') or 'Precision' not in stats['white']:
                        res = page.request.get(f"https://lichess.org/game/export/{id_partida}?accuracy=true", headers={'Accept': 'application/json'})
                        if res.ok:
                            data = res.json()
                            for color in ['white', 'black']:
                                analysis = data.get('players', {}).get(color, {}).get('analysis', {})
                                if analysis:
                                    stats.setdefault(color, {})
                                    if 'inaccuracy' in analysis: stats[color]['Imprecisiones'] = str(analysis['inaccuracy'])
                                    if 'mistake' in analysis: stats[color]['Errores'] = str(analysis['mistake'])
                                    if 'blunder' in analysis: stats[color]['Graves'] = str(analysis['blunder'])
                                    if 'acpl' in analysis: stats[color]['Centipeones'] = str(analysis['acpl'])
                                    if 'accuracy' in analysis: stats[color]['Precision'] = f"{analysis['accuracy']}%"
                                    
                except Exception as e:
                    print(f"[Aviso] No se pudieron extraer las estadisticas de la pagina: {e}")

            # Reconstruir las stats para garantizar un orden estético y forzar la inclusión
            final_stats = {}
            for color in ['white', 'black']:
                final_stats[color] = {}
                # 1. Añadir las custom primero
                if custom_stats.get(color):
                    for k in ['Brillantes', 'Excelentes', 'Buenas', 'De libro']:
                        if k in custom_stats[color]:
                            final_stats[color][k] = str(custom_stats[color][k])
                            
                # 2. Añadir las nativas (si existen)
                if stats.get(color):
                    for k in ['Precision', 'Imprecisiones', 'Errores', 'Graves', 'Centipeones', 'Apertura', 'MedioJuego', 'Final']:
                        if k in stats[color]:
                            final_stats[color][k] = stats[color][k]
            
            stats = final_stats

            print("\n[Ok] PGN anotado extraido exitosamente!")
            _borrar_partida(page, id_partida)
            browser.close()
            return id_partida, url_lichess, pgn_generado, stats
    
    except CookieInvalidaException:
        print("\n[Error] Lichess no te reconoce. ¡Tu sesion (cookie) parece ser invalida o estar caducada!")
        from login_manual import verificar_y_configurar_sesion
        print("[Info] Relanzando configurador de sesion de Lichess...")
        if verificar_y_configurar_sesion(forzar=True) and reintentos > 0:
            print("\n[Info] Reintentando la importacion con la nueva sesion...")
            return importar_a_lichess(pgn, reintentos=reintentos-1)
        return None, None, None, None

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

