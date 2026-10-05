import os
import re
import google.generativeai as genai

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

def _guardar_env(key, value):
    env_lines = []
    if os.path.exists('.env'):
        with open('.env', 'r', encoding='utf-8') as f:
            env_lines = f.readlines()
            
    with open('.env', 'w', encoding='utf-8') as f:
        encontrado = False
        for linea in env_lines:
            if linea.startswith(f"{key}="):
                f.write(f"{key}={value}\n")
                encontrado = True
            else:
                f.write(linea)
        if not encontrado:
            if env_lines and not env_lines[-1].endswith('\n'):
                f.write("\n")
            f.write(f"{key}={value}\n")

def _obtener_modelo_pro_mas_reciente(api_key, modelo_actual):
    try:
        genai.configure(api_key=api_key)
        modelos_pro = []
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods and 'pro' in m.name.lower() and 'vision' not in m.name.lower():
                modelos_pro.append(m.name)
                
        if not modelos_pro:
            return modelo_actual
            
        def extract_version(name):
            match = re.search(r'gemini-(\d+(?:\.\d+)*)', name)
            if match:
                return [float(x) for x in match.group(1).split('.')]
            return [0]
            
        modelos_pro.sort(key=extract_version, reverse=True)
        mejor_modelo = modelos_pro[0]
        
        mejor_modelo_clean = mejor_modelo.replace('models/', '')
        actual_clean = modelo_actual.replace('models/', '')
        
        if extract_version(mejor_modelo_clean) > extract_version(actual_clean):
            print(f"\n[Info] Se ha detectado un modelo de Gemini Pro mas reciente: {mejor_modelo_clean} (actual: {actual_clean})")
            opcion = input("¿Quieres actualizar el .env para usar este nuevo modelo de ahora en adelante? (S/N): ").strip().lower()
            if opcion == 's':
                _guardar_env('GEMINI_MODEL', mejor_modelo_clean)
                print(f"[Ok] Modelo actualizado a {mejor_modelo_clean} en .env")
                return mejor_modelo_clean
                
        return actual_clean
    except Exception as e:
        print(f"[Aviso] No se pudieron comprobar los modelos: {e}")
        return modelo_actual.replace('models/', '')

def analizar_pgn_con_ia(pgn_original, pgn_anotado, stats=None):
    env_vars = _cargar_env()
    api_keys = []
    for k, v in env_vars.items():
        if re.match(r'^GEMINI_API_KEY(_\d+)?$', k):
            api_keys.append((k, v))
    api_keys.sort(key=lambda x: x[0])
    
    if not api_keys:
        print("[Advertencia] No se encontro ninguna variable GEMINI_API_KEY en el archivo .env.")
        print("Por favor, anadela para activar los comentarios de la IA.")
        return "El analisis de IA requiere un API Key de Google Gemini."

    indice_key_actual = 0
    api_key_name, api_key = api_keys[indice_key_actual]

    # Determinar modelo
    modelo_configurado = env_vars.get("GEMINI_MODEL", "gemini-1.5-pro")
    modelo_usar = _obtener_modelo_pro_mas_reciente(api_key, modelo_configurado)

    print(f"\n[Google IA] Enviando PGN a {modelo_usar} para evaluacion de Gran Maestro...")
    
    # Extraer nombres
    white_name = "White"
    black_name = "Black"
    match_w = re.search(r'\[White\s+"([^"]+)"\]', pgn_original)
    if match_w: white_name = match_w.group(1)
    match_b = re.search(r'\[Black\s+"([^"]+)"\]', pgn_original)
    if match_b: black_name = match_b.group(1)

    # Eliminar ELOs de pgn_anotado
    lineas_validas = []
    for linea in pgn_anotado.splitlines(True):
        if not re.match(r'^\s*\[(White|Black)Elo\s+"\d+"\]', linea):
            lineas_validas.append(linea)
    pgn_anotado = "".join(lineas_validas)
    
    # Eliminar las líneas en blanco adicionales
    pgn_anotado = re.sub(r'(\r?\n)([ \t]*(\r?\n))+', r'\n', pgn_anotado).strip()
    
    # Construir bloque de estadísticas
    stats_texto = ""
    if stats:
        stats_texto = f"""
In the initial match summary, indicate this as follows:
{white_name} ELO partida: XXXX <line break>{black_name} ELO partida: YYYY <line break><line break>
Calculate the match ELO only based on the following metrics and replace the values of XXXX and YYYY.  
Just put only the text and the Elo, without any justification.
I know it is not possible to accurately calculate a specific "match ELO", but you have to try to estimate the match ELO of two players based on the values: 

{white_name}:
"""
        def bstats(p):
            l=[]
            if 'Imprecisiones' in p: l.append(f"{p['Imprecisiones']} Imprecisiones")
            if 'Errores' in p: l.append(f"{p['Errores']} Errores")
            if 'Graves' in p: l.append(f"{p['Graves']} Errores graves")
            if 'Centipeones' in p: l.append(f"{p['Centipeones']} Pérdida promedio en centipeones")
            if 'Precision' in p: l.append(f"{p['Precision']} Precisión")
            if 'Apertura' in p: l.append(f"{p['Apertura']} Apertura")
            if 'MedioJuego' in p: l.append(f"{p['MedioJuego']} Medio juego")
            if 'Final' in p: l.append(f"{p['Final']} Final")
            return "\n".join(l)
        stats_texto += bstats(stats.get('white', {})) + f"\n\n{black_name}:\n" + bstats(stats.get('black', {}))

    target_player = env_vars.get("CHESSCOM_PLAYER", "")
    
    prompt_base = f"""Role: Act as an Grandmaster (GM) of chess, skilled in both analysis and teaching.

Primary Task: You will analyze a complete chess game, move by move. Your analysis must be presented as a standard, valid PGN file.

Audience: The analysis should be instructive, detailed, and clear, specifically aimed at an intermediate player.

Output Format (STRICT REQUIREMENTS):

1. Standard PGN File: The final output must be text formatted as PGN, ready to be imported into chess software.
2. PGN Headers: Include the standard game headers (Event, Site, Date, Round, White, Black, Result, etc.) exactly as provided in the input.
3. Initial Summary: Immediately after the [Tag "Value"] headers and BEFORE 1. (the first move), include a DETAILED game summary. This summary MUST be enclosed in a single pair of curly braces {{}}. It should contextualize the game (type of event if known, significance, player styles if relevant) and provide a general overview of how it unfolded.
4. Move Comments:
 - Placement: After EACH move number and move notation (e.g., 1. e4, 1... c5), add an explanatory comment enclosed in a single pair of curly braces {{}}.
 - Content: Explain the idea behind the move, its immediate strategic and tactical consequences, and how it affects the position. Cover both White's and Black's moves in their respective turns. In key moves, he explains why they are key, what the player or opponent should do, and analyzes the current situation of the game.
 -Numerical Evaluation: If the source analysis provides an evaluation like [%eval X.XX], you MUST include it at the END of the comment, INSIDE the curly braces {{}}, preceded by a space, using square brackets [] with the appropriate + or - sign. Example: {{Comentario sobre la jugada. [+0.75]}} or {{Comentario sobre la jugada. [-1.20]}}. DO NOT include the text %eval in your output.
 - Language and Notation: Comments MUST be in Spanish. Move notation must be standard English algebraic notation (e.g., e4, Nf3, O-O, Bxd5).
- Handling Evaluation Terms (e.g., Inaccuracy, Mistake, Blunder):  
   - MANDATORY Application: You MUST ALWAYS apply the Handling Evaluation Terms rules to EVERY move that carries an annotation symbol. No move with an annotation should lack the corresponding tonal treatment.
   - Tone Consistency with PGN Annotations: The tone of your commentary MUST strictly match any annotation symbols present in the input PGN (?, ??, ?!). 
     * For ?? (Blunder): The commentary must be harsh and severely critical. Make it clear this is a catastrophic error that ruins or seriously damages the position. NEVER praise or soften a ??. Be direct about the gravity of the mistake.
     * For ? (Mistake): The commentary must be clearly negative and critical. Point out the damage caused without sugarcoating it. NEVER praise a move marked with ?.
     * For ?! (Inaccuracy): The tone should be cautionary and mildly critical, pointing out a misstep that lets the opponent improve their position. Do NOT praise or encourage the player for an inaccuracy.

   - MANDATORY Justification of Classification: For EVERY annotated move, you MUST explain WHY the move deserves that classification. Do not simply state that a move is bad; explain the concrete positional, tactical, or strategic reasons behind the evaluation. If the consequences of a move become apparent in the following moves, you MUST reference those subsequent developments to justify the classification (e.g., "Esta jugada debilita gravemente tu posición, como se verá en las próximas jugadas donde tu rival aprovecha la debilidad creada.").
   - CRITICAL for Negative Moves (?!, ?, ??): When analyzing moves belonging to {target_player} that are marked as inaccuracy (?!), mistake (?), or blunder (??), you must be CRITICAL, not encouraging. Do NOT praise the player's intention or effort. Focus on what went wrong, what weakness was created, or what opportunity was missed. Scale the severity of your criticism to match the annotation: mild criticism for ?!, firm criticism for ?, and severe criticism for ??.
   IMPORTANT: Do not explicitly write the words "Blunder", "Mistake", etc., inside the braces {{}}; instead, convey their meaning entirely through the emotional tone, critique, and justification of your Spanish explanation.

- CRITICAL RESTRICTION - NO Mentioning Specific Squares, specific pieces not mentioned in the move or Unsolicited Alternative Moves: This is the MOST IMPORTANT RULE and must be followed with extreme precision. 
Specific Squares Forbidden: ABSOLUTELY NO MENTION of specific square coordinates (like e5, c6, f7) is allowed INSIDE the curly braces {{}} of the comment, unless explicitly required by the exception below.
Specific pieces not in the move: ABSOLUTELY NO MENTION of specific pieces (like Queen, Knight, Bishop, Rook, Pawn, King - Dama, Caballo, Alfil, Torre, Peón, Rey in Spanish) is allowed INSIDE the curly braces {{}} of the comment, unless explicitly required by the exception below.
Piece Names Allowed: Mentioning the type of piece being moved (Queen, Knight, Bishop, Rook, Pawn, King - Dama, Caballo, Alfil, Torre, Peón, Rey in Spanish) is allowed when the piece type is inherent in the move notation itself (e.g., Nf3 clearly involves a Knight/Caballo; e4 involves a Pawn/Peón). But not is allowed mentioning other pieces type if not in the move notation. For example, the following comment is not allowed for the move 27. Ncxe7+: "¡Jaque! Capturas el alfil con jaque usando tu otro caballo. Una secuencia forzada hacia el mate. [+ #3]" because you are mentioning a piece (bishop) that does not appear in the notation (Ncxe7+).
Focus: Describe the piece's general function/purpose (development, control, attack, defense, preparation) and the general area of the board it influences (e.g., "center," "kingside," "near the enemy king") without naming specific target squares or pieces being attacked/defended by their coordinate name.
EXAMPLES of what is FORBIDDEN vs ALLOWED (Comments must be in Spanish):
FORBIDDEN (Violates specific pieces not in the move): 3. e5 {{Las blancas avanzan su peón central, atacando tu alfil. [+0.15]}} (Mentions "alfil" but the piece moved is a pawn)
ALLOWED (Follows Rule): 3. e5 {{Las blancas avanzan su peón central, poniendo presión sobre la estructura negra. [+0.15]}} (Mentions "peón" - allowed; uses general terms like "central" - allowed; avoids specific pieces - correct).
FORBIDDEN (Violates Square Rule, Violates specific pieces not in the move): 3. Bb5 {{Ataca el caballo de c6 que defiende el peón de e5. [+0.15]}} (Mentions c6, e5, "caballo", "peón")
ALLOWED (Follows Rule): 3. Bb5 {{Desarrolla el alfil a una casilla activa, iniciando la Apertura Ruy López y poniendo presión sobre la estructura negra en el centro. [+0.15]}} (Mentions "alfil" - allowed; uses general terms like "centro" - allowed; avoids specific squares - correct).
FORBIDDEN (Violates Square Rule, Violates specific pieces not in the move): 4... Nf6 {{Ataca el peón de e4 y prepara el enroque. [+0.2]}} (Mentions e4, "peón")
ALLOWED (Follows Rule): 4... Nf6 {{Desarrolla el caballo a su casilla natural, contribuye al control central y prepara el enroque corto. [+0.2]}} (Mentions "caballo" - allowed; uses "central" - allowed; avoids specific target square - correct).
FORBIDDEN (Violates Square Rule, Violates specific pieces not in the move): 15. Qh5 {{Amenaza mate en h7 y ataca el alfil de f7. [+3.1]}} (Mentions h7, f7, "alfil")
ALLOWED (Follows Rule): 15. Qh5 {{Mueve la dama a una posición muy agresiva cerca del rey enemigo, creando amenazas directas y aumentando la presión en el flanco de rey. [+3.1]}} (Mentions "dama", "rey" - allowed; uses "flanco de rey" - allowed; avoids specific target pieces - correct).
MANDATORY Exception for Explicitly Provided Alternatives: The ONLY time you MUST mention specific alternative moves or squares inside the comment braces {{}} is when the original source analysis text itself explicitly provides them and indicates they should be part of the commentary (e.g., the source says 'Qh5 was best.' or 'Lost forced checkmate sequence. Ra7 was best.'). In these specific cases, include the provided alternative notation within your Spanish commentary. For instance, if the source states "Ba6 was best", your comment might be: {{Una jugada de desarrollo, aunque Ba6 era mejor. [+0.1]}}.
If the source text does NOT provide such specific alternative notation to be included, YOU MUST NOT ADD IT YOURSELF. Stick to the general rule of describing the played move's function without naming specific squares or other potential moves.

- CRITICAL RESTRICTION - Brace Structure: There can only be ONE pair of curly braces {{}} per comment/move. Nesting braces (e.g., {{texto {{otro texto}} fin}}) is STRICTLY FORBIDDEN.
5. Parenthetical Variations: If the source analysis includes variations in parentheses (), KEEP THEM EXACTLY AS THEY ARE, ensuring they remain OUTSIDE the comment braces {{}}. Example: 10. Rad1 {{Comentario sobre Rad1. [+0.4]}} (10. O-O a5 11. Ng3) 10... Qe7 {{Comentario sobre Qe7. [+0.35]}}.
6. Do Not Correct Moves: The moves provided in the source PGN are the moves that were played. DO NOT correct them; analyze them as given.
7. Special Handling for Player "{target_player}": If one player is named {target_player}:
 - Address them using the Spanish informal second-person singular in the comments for THEIR moves.
 - Adopt a pedagogical, understanding, and encouraging tone in Spanish. Highlight good ideas ("{{Aquí buscaste correctamente presionar el flanco de dama.}}") and explain mistakes constructively ("{{Esta jugada te deja vulnerable a un ataque doble en c2, ¡cuidado la próxima vez!}}"). Emphasize their successes ("{{¡Excelente jugada defensiva bloqueando la columna abierta!}}", "{{¡Bien visto ese recurso táctico para simplificar la posición!}}"). Modulate the tone according to the quality of the move as per rule 4 "Handling Evaluation Terms".

Input Context: I will provide you with the game in PGN format. This PGN may contain preliminary annotations like [%eval X.XX] or basic comments / evaluation symbols (!, ?, ??, etc.). You must use this base information to generate your complete analysis following ALL the rules above, producing the final commentary in Spanish.

Final Goal: Generate a high-quality, commented PGN useful for an intermediate player's learning, strictly adhering to all specified formatting and content requirements, with all commentary written in Spanish and reflecting the appropriate emotional weight for each move's quality.

Input Context: 
{pgn_anotado}

{stats_texto}
"""
    
    with open("Resultados.txt", "a", encoding="utf-8") as f:
        f.write("==================================================\n")
        f.write("PROMPT ENVIADO A LA IA\n")
        f.write("==================================================\n")
        f.write(prompt_base)
        f.write("\n\n")
    
    modelo_actual = modelo_usar
    
    while True:
        try:
            import os
            os.environ["GEMINI_API_KEY"] = api_key
            genai.configure(api_key=api_key)
            # Limpiar la cache interna del SDK para forzar que use la nueva key
            from google.generativeai import client as genai_client
            if hasattr(genai_client, '_client_manager'):
                genai_client._client_manager.clients.clear()
                
            model = genai.GenerativeModel(modelo_actual)
            response = model.generate_content(prompt_base)
            texto_ia = response.text
            print("\n[Ok] Analisis de la IA recibido!\n")
            
            # Restaurar los ELO originales en el PGN devuelto por la IA
            match_w_elo = re.search(r'\[WhiteElo\s+"([^"]+)"\]', pgn_original)
            match_b_elo = re.search(r'\[BlackElo\s+"([^"]+)"\]', pgn_original)
            
            w_elo_str = f'[WhiteElo "{match_w_elo.group(1)}"]\n' if match_w_elo else ""
            b_elo_str = f'[BlackElo "{match_b_elo.group(1)}"]\n' if match_b_elo else ""
            
            if w_elo_str or b_elo_str:
                texto_ia = re.sub(r'(\[Event\s+"[^"]+"\])', r'\1\n' + w_elo_str + b_elo_str.strip(), texto_ia, count=1)
                
            return texto_ia
        except Exception as e:
            error_str = str(e)
            if "429" in error_str and "exceeded your current quota" in error_str:
                tiempo_match = re.search(r'retry in (\d+h)?(\d+m)?', error_str)
                tiempo_str = ""
                if tiempo_match:
                    h = tiempo_match.group(1) or ""
                    m = tiempo_match.group(2) or ""
                    if h or m:
                        tiempo_str = f" Puedes reintentarlo en {h} {m}."
                
                print(f"\n[Error] al contactar con Gemini ({modelo_actual}): 429 Has superado tu cuota actual para las peticiones a la IA de Google.{tiempo_str}")
                
                indice_key_actual += 1
                if indice_key_actual < len(api_keys):
                    api_key_name, api_key = api_keys[indice_key_actual]
                    print(f"[Aviso] Cambiando automáticamente a la clave alternativa: {api_key_name}...")
                    continue
            else:
                print(f"\n[Error] al contactar con Gemini ({modelo_actual}): {e}")
            
            print("\n¿Qué deseas hacer?")
            print("1. Utilizar otro modelo de IA")
            print("2. Salir")
            opcion_error = input("Selecciona una opción (1/2): ").strip()
            
            if opcion_error == '2':
                import sys
                print("[Aviso] Saliendo del script...")
                sys.exit(0)
            elif opcion_error == '1':
                print("Consultando otros modelos disponibles...")
                try:
                    modelos = []
                    for m in genai.list_models():
                        # Filtramos modelos de texto (excluyendo vision si no hace falta)
                        if 'generateContent' in m.supported_generation_methods and 'vision' not in m.name.lower():
                            modelos.append(m.name.replace('models/', ''))
                            
                    if modelos:
                        print("\nModelos alternativos disponibles:")
                        for i, m_name in enumerate(modelos):
                            print(f"  {i + 1}. {m_name}")
                        
                        opcion = input(f"\nIntroduce el numero del modelo a utilizar (1-{len(modelos)}) o pulsa Enter para salir: ").strip()
                        if opcion.isdigit():
                            idx = int(opcion) - 1
                            if 0 <= idx < len(modelos):
                                modelo_actual = modelos[idx]
                                guardar = input(f"¿Quieres guardar '{modelo_actual}' como tu modelo predeterminado en .env? (S/N): ").strip().lower()
                                if guardar == 's':
                                    _guardar_env('GEMINI_MODEL', modelo_actual)
                                
                                indice_key_actual = 0
                                api_key_name, api_key = api_keys[indice_key_actual]
                                print(f"\n[Google IA] Reintentando con {modelo_actual} usando {api_key_name}...")
                                continue
                            else:
                                print("[Aviso] Opcion invalida. Saliendo.")
                                import sys; sys.exit(0)
                        else:
                            print("[Aviso] Cancelado por el usuario. Saliendo.")
                            import sys; sys.exit(0)
                    else:
                        print("[Aviso] No se encontraron otros modelos disponibles en tu cuenta.")
                        import sys; sys.exit(0)
                except Exception as ex:
                    print(f"[Error] Fallo al obtener la lista de modelos: {ex}")
                    import sys; sys.exit(0)
            else:
                import sys
                print("[Aviso] Opción inválida. Saliendo.")
                sys.exit(0)

                
    return "Ocurrio un error en el analisis de la IA o se agoto la cuota."
