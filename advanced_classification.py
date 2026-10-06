import math
import chess

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

WIN_PCT_CAP_LOW = 5.0
WIN_PCT_CAP_HIGH = 95.0
NON_SACRIFICE_PENALTY = 0.85
RECAPTURE_PENALTY = 0.0
CHECK_RESPONSE_PENALTY = 0.0
CAPTURE_PENALTY = 0.5
MAX_BRILLIANTS_PER_SIDE = 3
MAX_EXCELLENTS_PER_SIDE = 5

def cp_to_win_pct(cp: float) -> float:
    centipawns = cp * 100
    try:
        return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * centipawns)) - 1)
    except OverflowError:
        return 100.0 if centipawns > 0 else 0.0

class AdvancedClassifier:
    def __init__(self):
        self.brilliants_w = 0
        self.brilliants_b = 0
        self.excellents_w = 0
        self.excellents_b = 0
        self.history_win_pct_w = []

    def get_win_pct_w(self, score) -> float:
        if score.is_mate():
            mate = score.mate()
            if mate > 0:
                return max(99.0, 100.0 - (mate * 0.1))
            else:
                return min(1.0, 0.0 + (abs(mate) * 0.1))
        else:
            cp = max(-15.0, min(15.0, score.score() / 100.0))
            return cp_to_win_pct(cp)

    def get_game_phase(self, board: chess.Board) -> str:
        pieces = len(board.piece_map())
        if pieces > 24:
            return "opening"
        elif pieces > 12:
            return "middlegame"
        else:
            return "endgame"

    def classify_move(self, board_before: chess.Board, move: chess.Move, 
                      played_score_white, best_score_white_before, second_best_score_white_before, is_top_move: bool,
                      fallback_prev_eval_w: float) -> str:
                      
        is_white_turn = board_before.turn == chess.WHITE
        
        curr_win_pct_w = self.get_win_pct_w(played_score_white)
        
        if best_score_white_before:
            best_before_win_pct_w = self.get_win_pct_w(best_score_white_before)
        else:
            best_before_win_pct_w = cp_to_win_pct(fallback_prev_eval_w)
            
        self.history_win_pct_w.append(curr_win_pct_w)
        
        # Rule 10: Smoothing
        prev_win_w = best_before_win_pct_w
        if len(self.history_win_pct_w) >= 3:
            curr = self.history_win_pct_w[-1]
            prev1 = self.history_win_pct_w[-2]
            prev2 = self.history_win_pct_w[-3]
            # Si prev1 (1 ply ago) fue un pico >25% y curr volvió a su cauce cerca de prev2
            if abs(prev1 - prev2) > 25.0 and abs(curr - prev2) < 10.0:
                prev_win_w = prev2
                
        played_pct = curr_win_pct_w if is_white_turn else (100.0 - curr_win_pct_w)
        best_before_pct = best_before_win_pct_w if is_white_turn else (100.0 - best_before_win_pct_w)
        prev_pct_smoothed = prev_win_w if is_white_turn else (100.0 - prev_win_w)
        
        # Rule 4: Non-linear Delta
        delta_pct = played_pct - best_before_pct
        
        if delta_pct <= -20.0:
            if best_before_pct >= 60.0 and played_pct < 50.0:
                return ANNOTATIONS["MISS"]
            return ANNOTATIONS["BLUNDER"]
        elif delta_pct <= -10.0:
            return ANNOTATIONS["MISTAKE"]
        elif delta_pct <= -5.0:
            return ANNOTATIONS["INACCURACY"]
            
        if not is_top_move:
            if delta_pct <= -4.0:
                return ANNOTATIONS["GOOD"]
            elif delta_pct <= -1.0:
                return ANNOTATIONS["EXCELLENT"]
            else:
                return ANNOTATIONS["BEST"]
                
        if not second_best_score_white_before:
            return ANNOTATIONS["BEST"]
            
        second_best_pct_w = self.get_win_pct_w(second_best_score_white_before)
        second_best_pct = second_best_pct_w if is_white_turn else (100.0 - second_best_pct_w)
        
        diff_pct = best_before_pct - second_best_pct
        
        # Rule 1 & 5: Win Probability Caps & Mate handling
        if prev_pct_smoothed > WIN_PCT_CAP_HIGH or prev_pct_smoothed < WIN_PCT_CAP_LOW:
            return ANNOTATIONS["BEST"]
        if played_score_white.is_mate() and best_score_white_before and best_score_white_before.is_mate():
            return ANNOTATIONS["BEST"]
            
        effective_diff = diff_pct
        
        # Rule 2: Sacrifice detection / Capture penalty
        if not board_before.is_capture(move):
            effective_diff *= NON_SACRIFICE_PENALTY
        else:
            effective_diff *= CAPTURE_PENALTY
            
        # Rule 3 & 7: Discard forced moves completely
        if board_before.is_check():
            effective_diff *= CHECK_RESPONSE_PENALTY
            
        if board_before.move_stack:
            last_move = board_before.peek()
            if last_move.to_square == move.to_square and board_before.is_capture(move):
                effective_diff *= RECAPTURE_PENALTY
                
        # Rule 8: Swing bidireccional
        if prev_pct_smoothed <= 35.0 and played_pct >= 65.0:
            effective_diff *= 1.3
        elif prev_pct_smoothed < 50.0 and played_pct > 50.0:
            effective_diff *= 1.15
            
        # Rule 6: Game Phase Awareness
        phase = self.get_game_phase(board_before)
        multiplier = 1.5 if phase == "opening" else (1.1 if phase == "endgame" else 1.0)
        
        threshold_brilliant = 18.0 * multiplier
        threshold_great = 10.0 * multiplier
        
        classification = ANNOTATIONS["BEST"]
        if is_top_move:
            if effective_diff >= threshold_brilliant:
                classification = ANNOTATIONS["BRILLIANT"]
            elif effective_diff >= threshold_great:
                classification = ANNOTATIONS["GREAT"]
            
        # Rule 9: Anti-inflation
        if classification == ANNOTATIONS["BRILLIANT"]:
            if is_white_turn:
                if self.brilliants_w >= MAX_BRILLIANTS_PER_SIDE:
                    classification = ANNOTATIONS["GREAT"]
                else:
                    self.brilliants_w += 1
            else:
                if self.brilliants_b >= MAX_BRILLIANTS_PER_SIDE:
                    classification = ANNOTATIONS["GREAT"]
                else:
                    self.brilliants_b += 1
                    
        if classification == ANNOTATIONS["GREAT"]:
            if is_white_turn:
                if self.excellents_w >= MAX_EXCELLENTS_PER_SIDE:
                    classification = ANNOTATIONS["BEST"]
                else:
                    self.excellents_w += 1
            else:
                if self.excellents_b >= MAX_EXCELLENTS_PER_SIDE:
                    classification = ANNOTATIONS["BEST"]
                else:
                    self.excellents_b += 1
                    
        return classification
