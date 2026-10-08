import os
import chess
import chess.pgn
import chess.engine
import chess.polyglot
import io
import json
import time
import threading
from collections import Counter
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass

# Mapeo de las anotaciones al estilo de chess.com
ANNOTATIONS = {
    "BRILLIANT": "[#BRILLIANT#]",
    "GREAT": "[#GREAT#]",
    "BOOK": "[#BOOK#]",
    "BEST": "[#BEST#]",
    "EXCELLENT": "[#EXCELLENT#]",
    "GOOD": "[#GOOD#]",
    "INACCURACY": "[#INACCURACY#]",
    "MISTAKE": "[#MISTAKE#]",
    "MISS": "[#MISS#]",
    "BLUNDER": "[#BLUNDER#]",
}

# La heurística de clasificación se realiza directamente en el bucle principal
# aprovechando el análisis multipv para Brillantes y Omisiones.

def analyze_pgn(pgn_string: str) -> str:
    # Por defecto, busca en la carpeta "stockfish" dentro del proyecto
    default_path = os.path.join(os.path.dirname(__file__), "stockfish", "stockfish-windows-x86-64-universal.exe")
    stockfish_path = os.getenv("STOCKFISH_PATH", default_path)
    
    try:
        engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
        # Configurar parámetros desde .env o usar valores por defecto
        threads = int(os.getenv("STOCKFISH_THREADS", "1"))
        hash_memory = int(os.getenv("STOCKFISH_HASH", "512"))
        depth = int(os.getenv("STOCKFISH_DEPTH", "18"))
                
        engine.configure({"Threads": threads, "Hash": hash_memory})
        nodes = int(os.getenv("STOCKFISH_NODES", "0"))
        analysis_limit = chess.engine.Limit(nodes=nodes) if nodes > 0 else chess.engine.Limit(depth=depth)
        tactical_depth = int(os.getenv("STOCKFISH_TACTICAL_DEPTH", str(depth + 4)))
        tactical_nodes = int(os.getenv("STOCKFISH_TACTICAL_NODES", str(nodes * 4)))
        tactical_limit = chess.engine.Limit(nodes=tactical_nodes) if nodes > 0 else chess.engine.Limit(depth=tactical_depth)
        classification_margin = float(os.getenv("STOCKFISH_CLASSIFICATION_MARGIN", "0.02"))
        verification_enabled = os.getenv("STOCKFISH_VERIFY_CLASSIFICATIONS", "false").lower() in {"1", "true", "yes"}
    except FileNotFoundError:
        print(f"Error: No se encontró el binario de Stockfish en la ruta: {stockfish_path}")
        return pgn_string

    pgn = io.StringIO(pgn_string)
    game = chess.pgn.read_game(pgn)
    if game is None:
        if 'engine' in locals(): engine.quit()
        return pgn_string

    def get_rating(header: str):
        try:
            return int(game.headers.get(header))
        except (TypeError, ValueError):
            return None

    def get_player_name(header: str, fallback: str) -> str:
        name = game.headers.get(header, "").strip()
        return name if name and name != "?" else fallback

    from advanced_classification import AdvancedClassifier, caps2_accuracy, net_material_loss
    classifier = AdvancedClassifier(
        white_rating=get_rating("WhiteElo"),
        black_rating=get_rating("BlackElo"),
    )

    default_book = os.path.join(os.path.dirname(__file__), "stockfish", "polyglot.bin")
    book_path = os.getenv("POLYGLOT_BOOK_PATH", default_book)
    book_reader = None
    if os.path.exists(book_path):
        book_reader = chess.polyglot.open_reader(book_path)

    explorer_enabled = os.getenv("OPENING_EXPLORER_ENABLED", "true").lower() in {"1", "true", "yes"}
    explorer_url = os.getenv("OPENING_EXPLORER_URL", "https://explorer.lichess.org/masters")
    explorer_token = os.getenv("OPENING_EXPLORER_TOKEN", os.getenv("LICHESS_TOKEN", ""))
    explorer_min_games = int(os.getenv("OPENING_EXPLORER_MIN_GAMES", "5"))
    explorer_min_popularity = float(os.getenv("OPENING_EXPLORER_MIN_POPULARITY", "0.005"))
    explorer_max_plies = int(os.getenv("OPENING_EXPLORER_MAX_PLIES", "24"))
    explorer_timeout = float(os.getenv("OPENING_EXPLORER_TIMEOUT", "3"))
    explorer_cache = {}
    explorer_unavailable = False

    def is_polyglot_move(board_before: chess.Board, candidate: chess.Move) -> bool:
        if book_reader is None:
            return False
        try:
            return any(entry.move == candidate for entry in book_reader.find_all(board_before))
        except Exception:
            return False

    def is_explorer_move(board_before: chess.Board, candidate: chess.Move) -> bool:
        nonlocal explorer_unavailable
        if explorer_unavailable or not explorer_enabled or len(board_before.move_stack) >= explorer_max_plies:
            return False

        fen = " ".join(board_before.fen().split(" ")[:4])
        if fen not in explorer_cache:
            query = urlencode({"fen": fen, "moves": 100})
            try:
                headers = {"Accept": "application/json"}
                if explorer_token:
                    headers["Authorization"] = f"Bearer {explorer_token}"
                request = Request(f"{explorer_url}?{query}", headers=headers)
                with urlopen(request, timeout=explorer_timeout) as response:
                    payload = json.load(response)
                    explorer_cache[fen] = (
                        payload.get("moves", []),
                        payload.get("white", 0) + payload.get("draws", 0) + payload.get("black", 0),
                    )
            except (HTTPError, URLError, OSError, ValueError):
                explorer_cache[fen] = ([], 0)
                explorer_unavailable = True

        moves, total_games = explorer_cache[fen]
        if total_games == 0:
            return False

        for entry in moves:
            if entry.get("uci") != candidate.uci():
                continue
            games = entry["white"] + entry["draws"] + entry["black"]
            return games >= explorer_min_games and games / total_games >= explorer_min_popularity
        return False

    def engine_analysis(board_before: chess.Board, candidate: chess.Move, limit, exact_root_scores=False):
        infos = engine.analyse(board_before, limit, multipv=3)
        best_info = infos[0]
        best_move = best_info["pv"][0]
        played_info = next(
            (info for info in infos if info.get("pv") and info["pv"][0] == candidate),
            None,
        )
        is_top_move = best_move == candidate
        if exact_root_scores and not is_top_move:
            # Se iguala el presupuesto de Best y jugada real desde la misma raíz.
            best_info = engine.analyse(board_before, limit, root_moves=[best_move])
            played_info = engine.analyse(board_before, limit, root_moves=[candidate])
        elif played_info is None:
            # Se restringe la raíz a la jugada real cuando no aparece en MultiPV.
            played_info = engine.analyse(board_before, limit, root_moves=[candidate])

        played_pv = played_info.get("pv", [])
        if not played_pv or played_pv[0] != candidate:
            played_pv = [candidate] + played_pv

        return {
            "best_score": best_info["score"].white(),
            "second_score": infos[1]["score"].white() if len(infos) > 1 else None,
            "played_score": played_info["score"].white(),
            "is_top_move": is_top_move,
            "played_pv": played_pv,
        }

    board = game.board()
    node = game
    
    total_moves = sum(1 for _ in game.mainline_moves())
    move_count = 0
    start_time = time.time()
    analysis_done = False
    
    # Se almacenan las clasificaciones por color para el resumen.
    summary_counts = {chess.WHITE: Counter(), chess.BLACK: Counter()}
    accuracy_losses = {
        chess.WHITE: {"Apertura": [], "Medio juego": [], "Final": []},
        chess.BLACK: {"Apertura": [], "Medio juego": [], "Final": []}
    }

    def get_phase(board_before: chess.Board, current: str) -> str:
        if current == "Final":
            return "Final"
        def non_pawn_material(color):
            mat = 0
            for piece in board_before.piece_map().values():
                if piece.color == color and piece.piece_type not in (chess.PAWN, chess.KING):
                    val = 9 if piece.piece_type == chess.QUEEN else (5 if piece.piece_type == chess.ROOK else 3)
                    mat += val
            return mat
        if non_pawn_material(chess.WHITE) <= 13 and non_pawn_material(chess.BLACK) <= 13:
            return "Final"
        if current == "Apertura" and board_before.fullmove_number > 10:
            return "Medio juego"
        return current

    current_phase = "Apertura"

    def print_timer():
        while not analysis_done:
            elapsed = int(time.time() - start_time)
            mins, secs = divmod(elapsed, 60)
            print(f"[{mins:02d}:{secs:02d}] Analizando jugada {max(1, move_count)}/{total_moves}...     ", end="\r")
            time.sleep(0.2)
            
    timer_thread = threading.Thread(target=print_timer, daemon=True)
    timer_thread.start()

    while node.variations:
        next_node = node.variation(0)
        move = next_node.move
        move_count += 1
        
        is_book_move = is_polyglot_move(board, move) or is_explorer_move(board, move)
                
        try:
            board_before = board.copy()
            current_phase = get_phase(board_before, current_phase)
            # Se analizan Best, Second y la jugada real desde la misma posición raíz.
            engine_result = engine_analysis(board_before, move, analysis_limit)
            requires_tactical_verification = (
                not engine_result["is_top_move"]
                and board_before.is_capture(move)
                and net_material_loss(board_before, engine_result["played_pv"]) >= 2
            )
            requires_boundary_verification = (
                not is_book_move
                and classifier.is_near_classification_boundary(
                    board_before,
                    engine_result["played_score"],
                    engine_result["best_score"],
                    engine_result["is_top_move"],
                    classification_margin,
                )
            )
            if verification_enabled and (requires_tactical_verification or requires_boundary_verification):
                # Se repite la comparación completa con igual presupuesto de raíz.
                engine_result = engine_analysis(board_before, move, tactical_limit, exact_root_scores=True)

            best_score_before = engine_result["best_score"]
            second_best_score = engine_result["second_score"]
            played_score_white = engine_result["played_score"]
            is_top_move = engine_result["is_top_move"]
            played_pv = engine_result["played_pv"]
            best_expected_points = None
            second_expected_points = None
            played_expected_points = None

            classification = classifier.classify_move(
                board_before=board_before,
                move=move,
                played_score_white=played_score_white,
                best_score_white_before=best_score_before,
                second_best_score_white_before=second_best_score,
                is_top_move=is_top_move,
                played_pv=played_pv,
                is_book=is_book_move,
                best_expected_points=best_expected_points,
                second_expected_points=second_expected_points,
                played_expected_points=played_expected_points,
            )

            # Se añade la clasificación al color que realizó la jugada.
            summary_counts[board.turn][classification] += 1
            accuracy_losses[board.turn][current_phase].append(classifier.last_loss)

            if played_score_white.is_mate():
                eval_value = f"M{played_score_white.mate()}"
            else:
                eval_value = f"{played_score_white.score() / 100.0:.2f}"
                
            comment = f"[%eval {eval_value}] [#LOCAL_EVAL:{eval_value}#] {classification}"
            if next_node.comment:
                next_node.comment = f"{comment} {next_node.comment}"
            else:
                next_node.comment = comment
                
        except Exception:
            pass

        board.push(move)
        node = next_node

    analysis_done = True
    timer_thread.join()

    engine.quit()
    if book_reader is not None:
        book_reader.close()
        
    end_time = time.time()
    total_elapsed = int(end_time - start_time)
    mins, secs = divmod(total_elapsed, 60)
    print(f"\nAnálisis completado en {mins:02d}:{secs:02d} ({end_time - start_time:.2f} segundos).")
    
    # Se imprime el resumen de ambos jugadores en columnas.
    print("\n--- Resumen de Movimientos ---")
    players = {
        chess.WHITE: ("Blancas", get_player_name("White", "Blancas"), get_rating("WhiteElo")),
        chess.BLACK: ("Negras", get_player_name("Black", "Negras"), get_rating("BlackElo")),
    }

    def player_header(color: bool) -> str:
        side, name, rating = players[color]
        used_rating = classifier.white_rating if color == chess.WHITE else classifier.black_rating
        rating_text = str(rating) if rating is not None else f"sin Elo, usado {used_rating}"
        return f"{side}: {name} (Elo: {rating_text})"

    white_header = player_header(chess.WHITE)
    black_header = player_header(chess.BLACK)
    column_width = max(len(white_header), len(black_header), 30)
    print(f"{white_header:<{column_width}}  {black_header}")
    for category_name, tag in ANNOTATIONS.items():
        white_line = f"  {category_name.capitalize()}: {summary_counts[chess.WHITE].get(tag, 0)}"
        black_line = f"  {category_name.capitalize()}: {summary_counts[chess.BLACK].get(tag, 0)}"
        print(f"{white_line:<{column_width}}  {black_line}")
    def get_all_losses(losses_dict):
        return [loss for phase_losses in losses_dict.values() for loss in phase_losses]

    white_accuracy = f"  Accuracy CAPS2 aprox.: {caps2_accuracy(get_all_losses(accuracy_losses[chess.WHITE])):.1f}"
    black_accuracy = f"  Accuracy CAPS2 aprox.: {caps2_accuracy(get_all_losses(accuracy_losses[chess.BLACK])):.1f}"
    print(f"{white_accuracy:<{column_width}}  {black_accuracy}")
    for phase in ["Apertura", "Medio juego", "Final"]:
        w_acc = f"    {phase}: {caps2_accuracy(accuracy_losses[chess.WHITE][phase]):.1f}"
        b_acc = f"    {phase}: {caps2_accuracy(accuracy_losses[chess.BLACK][phase]):.1f}"
        print(f"{w_acc:<{column_width}}  {b_acc}")
    print("------------------------------\n")

    # Añadir las precisiones como cabeceras al PGN
    game.headers["WhiteEloAccuracy"] = f"{caps2_accuracy(get_all_losses(accuracy_losses[chess.WHITE])):.1f}"
    game.headers["BlackEloAccuracy"] = f"{caps2_accuracy(get_all_losses(accuracy_losses[chess.BLACK])):.1f}"
    for phase in ["Apertura", "Medio juego", "Final"]:
        header_phase = phase.replace(" ", "")
        game.headers[f"WhiteEloAccuracy{header_phase}"] = f"{caps2_accuracy(accuracy_losses[chess.WHITE][phase]):.1f}"
        game.headers[f"BlackEloAccuracy{header_phase}"] = f"{caps2_accuracy(accuracy_losses[chess.BLACK][phase]):.1f}"

    game.headers["WhiteBrilliant"] = str(summary_counts[chess.WHITE].get("[#BRILLIANT#]", 0))
    game.headers["BlackBrilliant"] = str(summary_counts[chess.BLACK].get("[#BRILLIANT#]", 0))
    game.headers["WhiteGreat"] = str(summary_counts[chess.WHITE].get("[#GREAT#]", 0))
    game.headers["BlackGreat"] = str(summary_counts[chess.BLACK].get("[#GREAT#]", 0))

    # Se exporta la partida resultante a una cadena PGN
    exporter = chess.pgn.StringExporter(headers=True, variations=True, comments=True)
    return game.accept(exporter)

if __name__ == "__main__":
    # Script de prueba
    test_pgn = "[Event \"Play vs Bot\"][Site \"Chess.com\"][Date \"2026.09.02\"][White \"Ella-Drums-BOT\"][Black \"victorigp\"][Result \"0-1\"][WhiteElo \"925\"][BlackElo \"800\"][Termination \"victorigp ha ganado por jaque mate\"][ECO \"C60\"][EndDate \"2026.09.02\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 Nge7 4. c3 a6 5. a4 axb5 6. d3 bxa4 7. Rxa4 Rxa4 8. Qxa4 f6 9. d4 exd4 10. Nxd4 Nxd4 11. cxd4 Nc6 12. d5 Ne5 13. f4 Bb4+ 14. Ke2 Qe7 15. h4 Nc4 16. Qc2 Qc5 17. b3 Na3 18. Qxc5 Bxc5 19. Bxa3 Bxa3 20. Nxa3 c6 21. Nc2 O-O 22. Kf3 Re8 23. g4 cxd5 24. exd5 b5 25. f5 Bb7 26. Rh3 Bxd5+ 27. Kg3 Bxb3 28. Nd4 Re3+ 29. Kh2 Rxh3+ 30. Kxh3 Bc4 31. g5 Kf7 32. Nxb5 Bxb5 33. Kg2 d5 34. g6+ hxg6 35. fxg6+ Kxg6 36. Kf3 d4 37. Ke4 d3 38. h5+ Kxh5 39. Ke3 g5 40. Kd2 Kg4 41. Kc3 Kf3 42. Kd2 g4 43. Ke1 g3 44. Kd2 g2 45. Kc3 g1=Q 46. Kd2 Qe3+ 47. Kc3 d2+ 48. Kb4 Be8 49. Kc4 d1=Q 50. Kb4 Qdd4+ 51. Ka5 Qb3 52. Ka6 Qdb6# 0-1"
    result = analyze_pgn(test_pgn)
    print(result)
