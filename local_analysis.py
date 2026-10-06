import os
import chess
import chess.pgn
import chess.engine
import chess.polyglot
import io
import time
import threading
try:
    from dotenv import load_dotenv
    load_dotenv()
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
        threads = int(os.getenv("STOCKFISH_THREADS", "2"))
        hash_memory = int(os.getenv("STOCKFISH_HASH", "128"))
        engine.configure({"Threads": threads, "Hash": hash_memory})
        depth = int(os.getenv("STOCKFISH_DEPTH", "20"))
    except FileNotFoundError:
        print(f"Error: No se encontró el binario de Stockfish en la ruta: {stockfish_path}")
        return pgn_string

    pgn = io.StringIO(pgn_string)
    game = chess.pgn.read_game(pgn)
    if game is None:
        if 'engine' in locals(): engine.quit()
        return pgn_string

    from advanced_classification import AdvancedClassifier
    classifier = AdvancedClassifier()

    default_book = os.path.join(os.path.dirname(__file__), "stockfish", "polyglot.bin")
    book_path = os.getenv("POLYGLOT_BOOK_PATH", default_book)
    book_reader = None
    if os.path.exists(book_path):
        book_reader = chess.polyglot.open_reader(book_path)

    board = game.board()
    node = game
    
    def to_cp(score):
        if score.is_mate():
            return 10.0 if score.mate() > 0 else -10.0
        return max(-10.0, min(10.0, score.score() / 100.0))
        
    # Evaluación inicial rápida para tener el prev_eval base
    try:
        start_info = engine.analyse(board, chess.engine.Limit(depth=15))
        prev_eval_w = to_cp(start_info["score"].white())
    except Exception:
        prev_eval_w = 0.0
    
    total_moves = sum(1 for _ in game.mainline_moves())
    move_count = 0
    start_time = time.time()
    analysis_done = False
    
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
        is_white_turn = board.turn == chess.WHITE
        move_count += 1
        
        is_book_move = False
        if book_reader is not None:
            try:
                for entry in book_reader.find_all(board):
                    if entry.move == move:
                        is_book_move = True
                        break
            except Exception:
                pass
                
        board.push(move)
        
        try:
            # 1. Analizar SOLO la posición resultante
            info_after = engine.analyse(board, chess.engine.Limit(depth=depth))
            played_score_white = info_after["score"].white()
            played_cp_w = to_cp(played_score_white)
            
            # Perspectiva del jugador
            best_eval_cp = prev_eval_w if is_white_turn else -prev_eval_w
            played_eval_cp = played_cp_w if is_white_turn else -played_cp_w
            
            delta = played_eval_cp - best_eval_cp
            
            classification = ANNOTATIONS["GOOD"]
            
            if is_book_move:
                classification = ANNOTATIONS["BOOK"]
                classifier.history_win_pct_w.append(classifier.get_win_pct_w(played_score_white))
            else:
                best_score_before = None
                second_best_score = None
                is_top_move = False
                
                # LAZY EVALUATION: Solo si la jugada es pasable (delta >= -0.2) miramos multipv
                if delta >= -0.2:
                    board.pop()
                    info_before = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=2)
                    board.push(move)
                    
                    if info_before:
                        best_score_before = info_before[0]["score"].white()
                        is_top_move = info_before[0].get("pv") and info_before[0]["pv"][0] == move
                        if len(info_before) > 1:
                            second_best_score = info_before[1]["score"].white()
                            
                board_before = board.copy()
                board_before.pop()
                classification = classifier.classify_move(
                    board_before=board_before,
                    move=move,
                    played_score_white=played_score_white,
                    best_score_white_before=best_score_before,
                    second_best_score_white_before=second_best_score,
                    is_top_move=is_top_move,
                    fallback_prev_eval_w=prev_eval_w
                )
                
            if played_score_white.is_mate():
                eval_value = f"M{played_score_white.mate()}"
            else:
                eval_value = f"{played_score_white.score() / 100.0:.2f}"
                
            comment = f"[%eval {eval_value}] {classification}"
            if next_node.comment:
                next_node.comment = f"{comment} {next_node.comment}"
            else:
                next_node.comment = comment
                
            # Actualizamos la evaluación previa para el siguiente turno
            prev_eval_w = played_cp_w
            
        except Exception as e:
            pass
            
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
    
    # Se exporta la partida resultante a una cadena PGN
    exporter = chess.pgn.StringExporter(headers=True, variations=True, comments=True)
    return game.accept(exporter)

if __name__ == "__main__":
    # Script de prueba
    test_pgn = "[Event \"Test\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 Nge7 4. c3 a6 5. a4 axb5 6. d3 bxa4 7. Rxa4 Rxa4 8. Qxa4 f6 9. d4 exd4 10. Nxd4 Nxd4 11. cxd4 Nc6 12. d5 Ne5 13. f4 Bb4+ 14. Ke2 Qe7 15. h4 Nc4 16. Qc2 Qc5 17. b3 Na3 18. Qxc5 Bxc5 19. Bxa3 Bxa3 20. Nxa3 c6 21. Nc2 O-O 22. Kf3 Re8 23. g4 cxd5 24. exd5 b5 25. f5 Bb7 26. Rh3 Bxd5+ 27. Kg3 Bxb3 28. Nd4 Re3+ 29. Kh2 Rxh3+ 30. Kxh3 Bc4 31. g5 Kf7 32. Nxb5 Bxb5 33. Kg2 d5 34. g6+ hxg6 35. fxg6+ Kxg6 36. Kf3 d4 37. Ke4 d3 38. h5+ Kxh5 39. Ke3 g5 40. Kd2 Kg4 41. Kc3 Kf3 42. Kd2 g4 43. Ke1 g3 44. Kd2 g2 45. Kc3 g1=Q 46. Kd2 Qe3+ 47. Kc3 d2+ 48. Kb4 Be8 49. Kc4 d1=Q 50. Kb4 Qdd4+ 51. Ka5 Qb3 52. Ka6 Qdb6# 0-1"
    result = analyze_pgn(test_pgn)
    print(result)
