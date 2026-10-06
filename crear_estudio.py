import os
import re
import sys
import json
import urllib.request
import urllib.parse
import urllib.error
from playwright.sync_api import sync_playwright
from browser_utils import iniciar_navegador

def _cargar_env():
    env_vars = {}
    if os.path.exists('.env'):
        with open('.env', 'r', encoding='utf-8') as f:
            for linea in f:
                linea = linea.strip()
                if linea and not linea.startswith('#') and '=' in linea:
                    key, val = linea.split('=', 1)
                    env_vars[key.strip()] = val.strip()
    return env_vars

def extraer_datos_pgn(pgn_text, target_player, contenido_completo):
    blancas_match = re.search(r'\[White "(.*?)"\]', pgn_text)
    negras_match = re.search(r'\[Black "(.*?)"\]', pgn_text)
    resultado_match = re.search(r'\[Result "(.*?)"\]', pgn_text)
    
    blancas = blancas_match.group(1) if blancas_match else "Blancas"
    negras = negras_match.group(1) if negras_match else "Negras"
    resultado = resultado_match.group(1) if resultado_match else "*"
    
    # Determinar si el target player es blancas o negras
    color_target = "Blancas"
    is_white = True
    if target_player and target_player.lower() in negras.lower():
        color_target = "Negras"
        is_white = False
    
    # Determinar victoria/derrota/empate
    victoria = False
    empate = False
    if "1-0" in resultado and is_white:
        victoria = True
    elif "0-1" in resultado and not is_white:
        victoria = True
    elif "1/2" in resultado:
        empate = True
        
    if empate:
        resultado_txt = "DRAW"
    else:
        resultado_txt = "WIN" if victoria else "LOSE"
        
    # Extraer ELO estimado por la IA desde contenido_completo
    elo_est_match = re.search(rf'{target_player} ELO partida:\s*(\d+)', contenido_completo, re.IGNORECASE)
    elo_str = f"ELO: {elo_est_match.group(1)}" if elo_est_match else "ELO: ?"
    
    # Extraer stats del target player desde contenido_completo
    # Usamos re.DOTALL para buscar las estadisticas despues de que aparezca su nombre en el bloque de stats
    precision = ""
    prec_match = re.search(rf'{target_player}:.*?(\d+%)\s+Precisi.n', contenido_completo, re.DOTALL)
    if prec_match:
        precision = prec_match.group(1) + ", "
    # Nombre final: WIN, 96%, ELO: 1950
    nombre_estudio = f"{resultado_txt}, {precision}{elo_str}"
    return nombre_estudio, color_target

def _api_request(url, token, data=None, method=None):
    """Hace una peticion a la API de Lichess con autenticacion Bearer."""
    headers = {'Authorization': f'Bearer {token}'}
    if data is not None:
        encoded = urllib.parse.urlencode(data).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        req = urllib.request.Request(url, data=encoded, headers=headers)
    else:
        req = urllib.request.Request(url, headers=headers, method=method or 'GET')
    if method:
        req.method = method
    return urllib.request.urlopen(req)

def crear_estudio_desde_txt():
    # 1. Leer Resultados.txt
    archivo_resultados = "Resultados.txt"
    if not os.path.exists(archivo_resultados):
        print(f"[Error] No se ha encontrado {archivo_resultados}. Ejecuta main.py primero o crea el archivo.")
        return
        
    with open(archivo_resultados, "r", encoding="utf-8") as f:
        contenido = f.read()
        
    # Extraer solo la parte final de la IA
    marcador = "ANALISIS DE IA (GOOGLE GEMINI)"
    if marcador in contenido:
        # Dividimos por el marcador y nos quedamos con todo lo que hay después (saltando las líneas de igual)
        bloques = contenido.split(marcador)
        pgn_ia = bloques[-1].replace("==================================================\n", "").strip()
    else:
        print("[Aviso] No se encontro la cabecera de IA en Resultados.txt. Usando todo el contenido.")
        pgn_ia = contenido.strip()
        
    if not pgn_ia:
        print("[Error] El texto del PGN de la IA esta vacio.")
        return
        
    # 2. Extraer info
    env_vars = _cargar_env()
    target_player = env_vars.get("CHESSCOM_PLAYER", "")
    token = env_vars.get("LICHESS_TOKEN")
    lichess_cookie = env_vars.get("LICHESS_COOKIE")
    
    if not token:
        print("[Error] No se ha encontrado LICHESS_TOKEN en .env")
        return
    
    nombre_estudio, color_orientacion = extraer_datos_pgn(pgn_ia, target_player, contenido)
    val_orientacion = "white" if color_orientacion == "Blancas" else "black"
    
    print(f"[Info] Nombre del estudio: {nombre_estudio}")
    print(f"[Info] Orientacion del tablero: {color_orientacion}")
    
    # ============================
    # PASO 1: Crear estudio via API
    # ============================
    print("[Lichess] Creando estudio via API REST...")
    try:
        resp = _api_request('https://lichess.org/api/study', token, data={
            'name': nombre_estudio,
            'visibility': 'unlisted',
            'computer': 'everyone',
            'explorer': 'everyone',
            'cloneable': 'everyone',
            'shareable': 'everyone',
            'chat': 'everyone'
        })
        resp_json = json.loads(resp.read().decode('utf-8'))
        study_id = resp_json.get('id')
        if not study_id:
            print(f"[Error] La API no devolvio un ID de estudio. Respuesta: {resp_json}")
            return
        print(f"[Ok] Estudio creado. ID: {study_id}")
    except urllib.error.HTTPError as e:
        print(f"[Error] Fallo al crear estudio via API: {e.code}")
        print("Detalle:", e.read().decode('utf-8', errors='ignore'))
        print("[Aviso] Comprueba que tu LICHESS_TOKEN tiene el permiso 'study:write'.")
        return
    
    # =========================================
    # PASO 2: Obtener el ID del capitulo vacio
    # =========================================
    # La API de crear estudio genera automaticamente un capitulo vacio.
    # Lo obtenemos accediendo a la pagina HTML del estudio, que contiene
    # un JSON embebido con los chapters: [{"id":"XXXXXXXX","name":"Chapter 1"}]
    chapter_id_vacio = None
    if lichess_cookie:
        try:
            req_html = urllib.request.Request(
                f'https://lichess.org/study/{study_id}',
                headers={'Cookie': f'lila2={lichess_cookie}'}
            )
            html_resp = urllib.request.urlopen(req_html).read().decode('utf-8')
            match = re.search(r'"chapters":\s*\[\{"id":"([^"]+)"', html_resp)
            if match:
                chapter_id_vacio = match.group(1)
        except Exception:
            pass
    
    # ===================================
    # PASO 3: Importar PGN con el analisis
    # ===================================
    print("[Lichess] Importando PGN con analisis de IA...")
    try:
        _api_request(f'https://lichess.org/api/study/{study_id}/import-pgn', token, data={
            'name': nombre_estudio,
            'pgn': pgn_ia,
            'orientation': val_orientacion
        })
        print("[Ok] PGN importado correctamente.")
    except urllib.error.HTTPError as e:
        print(f"[Error] Fallo al importar PGN: {e.code}")
        print("Detalle:", e.read().decode('utf-8', errors='ignore'))
        return
    
    # ==========================================
    # PASO 4: Borrar el capitulo vacio original
    # ==========================================
    if chapter_id_vacio:
        print("[Lichess] Borrando capitulo vacio original...")
        try:
            _api_request(f'https://lichess.org/api/study/{study_id}/{chapter_id_vacio}', token, method='DELETE')
            print("[Ok] Capitulo vacio eliminado.")
        except urllib.error.HTTPError as e:
            print(f"[Aviso] No se pudo borrar el capitulo vacio: {e.code}")
    
    study_url = f"https://lichess.org/study/{study_id}"
    
    # ==============================================
    # PASO 5: Abrir estudio en el navegador
    # ==============================================
    study_url_auto = f"{study_url}?auto_analyze=1"
    
    print(f"\n[Ok] Estudio creado correctamente: {study_url}")
    print(f"\n[Info] Si tienes instalado el script opcional de Tampermonkey, el estudio de Lichess con la partida se abrirá en tu navegador habitual y solicitará el análisis directamente.")
    
    import webbrowser
    webbrowser.open(study_url_auto)
    
    print(f"\n[Ok] ¡Estudio completado con exito!")
    print(f"[Ok] URL: {study_url}")

if __name__ == "__main__":
    crear_estudio_desde_txt()
