import sys
import re
import json
import urllib.request
import chess
import chess.pgn
from playwright.sync_api import sync_playwright

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++="
PROMO_PIECES = "qnrbkp"

def _index_to_square(index):
    file = index % 8
    rank = (index // 8) + 1
    return chr(ord('a') + file) + str(rank)

def movelist_a_pgn(movelist_str, headers=None, initial_fen=None):
    if not movelist_str or len(movelist_str) < 2:
        return None

    game = chess.pgn.Game()
    if initial_fen and initial_fen != chess.STARTING_FEN:
        try:
            board = chess.Board(initial_fen)
            game.setup(board)
        except Exception:
            board = chess.Board()
    else:
        board = chess.Board()

    if headers and isinstance(headers, dict):
        for k, v in headers.items():
            if v is not None:
                game.headers[str(k)] = str(v)

    node = game
    for i in range(0, len(movelist_str), 2):
        if i + 1 >= len(movelist_str):
            break
        c1 = movelist_str[i]
        c2 = movelist_str[i + 1]
        if c1 not in ALPHABET or c2 not in ALPHABET:
            break
        code1 = ALPHABET.index(c1)
        code2 = ALPHABET.index(c2)
        promo = ""

        # Manejo de coronaciones (segundo indice > 63)
        if code2 > 63:
            promo_idx = (code2 - 64) // 3
            promo = PROMO_PIECES[promo_idx] if promo_idx < len(PROMO_PIECES) else "q"
            offset = ((code2 - 1) % 3) - 1
            direction = -8 if code1 < 16 else 8
            code2 = code1 + direction + offset

        from_sq = _index_to_square(code1)
        to_sq = _index_to_square(code2)
        uci = f"{from_sq}{to_sq}{promo}"

        try:
            move = chess.Move.from_uci(uci)
            if move not in board.legal_moves:
                break
            board.push(move)
            node = node.add_variation(move)
        except Exception:
            break

    if len(game.variations) == 0 and len(movelist_str) >= 2:
        return None

    exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
    return game.accept(exporter)

def extraer_pgn_api(url):
    # 1. Comprobar si la propia página contiene los datos del juego incrustados (ej. /games/view/)
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
        )
        with urllib.request.urlopen(req, timeout=6) as response:
            if response.status == 200:
                html = response.read().decode("utf-8", errors="ignore")
                match = re.search(r'JSON\.parse\("(\{.+?\})"\)', html)
                if match:
                    try:
                        raw = match.group(1).encode('utf-8').decode('unicode_escape')
                        data = json.loads(raw)
                        game = data.get("game", data)
                        movelist = game.get("moveList")
                        if movelist:
                            headers = game.get("pgnHeaders")
                            initial_fen = game.get("initialFen") or game.get("initialSetup") or game.get("fen")
                            pgn = movelist_a_pgn(movelist, headers=headers, initial_fen=initial_fen)
                            if pgn and len(pgn.strip()) > 0:
                                return pgn
                    except Exception:
                        pass
    except Exception:
        pass

    # 2. Si no viene en el HTML, buscar por game_id en los endpoints de callback
    m = re.search(r'/(\d{6,})(?:[/?#]|$)', url)
    if not m:
        return None
    game_id = m.group(1)

    endpoints = []
    if "computer" in url:
        endpoints.append(f"https://www.chess.com/computer/callback/game/{game_id}")
        endpoints.append(f"https://www.chess.com/callback/live/game/{game_id}")
    elif "daily" in url:
        endpoints.append(f"https://www.chess.com/callback/daily/game/{game_id}")
        endpoints.append(f"https://www.chess.com/callback/live/game/{game_id}")
    elif "games/view" not in url:
        endpoints.append(f"https://www.chess.com/callback/live/game/{game_id}")
        endpoints.append(f"https://www.chess.com/computer/callback/game/{game_id}")
        endpoints.append(f"https://www.chess.com/callback/daily/game/{game_id}")

    for ep_url in endpoints:
        try:
            req = urllib.request.Request(
                ep_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json"
                }
            )
            with urllib.request.urlopen(req, timeout=6) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    game = data.get("game", data)
                    movelist = game.get("moveList")
                    if movelist:
                        headers = game.get("pgnHeaders")
                        initial_fen = game.get("initialFen") or game.get("initialSetup") or game.get("fen")
                        pgn = movelist_a_pgn(movelist, headers=headers, initial_fen=initial_fen)
                        if pgn and len(pgn.strip()) > 0:
                            return pgn
        except Exception:
            continue

    return None

def _extraer_pgn_playwright(url):
    print(f"Abriendo navegador (fallback Playwright) para: {url}")
    
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
            try:
                # Clic forzado en el botón de compartir ignorando otros elementos encima
                page.locator('button[aria-label="Share"]').click(force=True, timeout=3000)
                page.locator('text=PGN').click(timeout=2000)
                # Extraer el texto del textarea de PGN
                pgn = page.locator('div.share-menu-tab-pgn-textarea textarea, textarea.share-menu-tab-pgn-textarea, textarea').first.input_value()
                print("\n[Ok] PGN Extraido desde la ventana de compartir!\n")
                print(pgn)
            except Exception as e:
                print(f"[Error] Tampoco se pudo extraer desde la interfaz de compartir. Detalles: {e}")
                pgn = None
                
        browser.close()
        return pgn

def extraer_pgn_chesscom(url):
    print(f"Intentando extraer PGN via API HTTP interna para: {url}")
    try:
        pgn = extraer_pgn_api(url)
        if pgn and len(pgn.strip()) > 0:
            print("\n[Ok] PGN obtenido exitosamente via HTTP/TCN (sin navegador)!\n")
            print(pgn)
            return pgn
    except Exception as e:
        print(f"[Aviso] Excepción en extracción API HTTP: {e}")

    print("\n[Aviso] Extracción API HTTP no disponible o incompleta. Usando Playwright como fallback...")
    return _extraer_pgn_playwright(url)

if __name__ == "__main__":
    # Prueba rápida cuando se ejecuta este archivo directamente
    url_ejemplo = "https://www.chess.com/game/live/2252875298"
    print(f"Ejecutando prueba independiente con: {url_ejemplo}")
    extraer_pgn_chesscom(url_ejemplo)
