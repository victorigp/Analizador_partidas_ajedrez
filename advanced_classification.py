"""
advanced_classification.py

Clasificación local aproximada de Chess.com V2 a partir de Expected Points.
Cada pérdida se calcula entre Best y la jugada real desde la misma posición raíz.
"""
from __future__ import annotations

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

# ---------------------------------------------------------------------------
# Calibración (todo en Expected Points: 0.00 a 1.00)
# ---------------------------------------------------------------------------
# Chess.com no publica la función exacta de Expected Points. Se usa una curva
# continua calibrable para no perder resolución en posiciones muy desequilibradas.
DEFAULT_RATING = 1500
MIN_RATING = 400
MAX_RATING = 3000
BASE_WIN_K = 0.0030

EXCELLENT_LOSS = 0.02
# Stockfish local a profundidad fija sobreestima levemente los deltas de EP.
# El corte 0,04 reproduce las imprecisiones contrastadas con Chess.com.
GOOD_LOSS = 0.04
# La curva local se calibra con partidas de Chess.com de Elo bajo.
INACCURACY_LOSS = 0.09
MISTAKE_LOSS = 0.20
CLASSIFICATION_BOUNDARIES = (EXCELLENT_LOSS, GOOD_LOSS, INACCURACY_LOSS, MISTAKE_LOSS)

# Se consideran transiciones de estado para Great y Miss.
EQUAL_POINTS = 0.50
WINNING_POINTS = 0.70
GREAT_UNIQUE_GOOD_GAP = 0.05
MISS_MIN_OPPONENT_LOSS = INACCURACY_LOSS
MISS_MIN_RECOVERY_GAIN = 0.10
MISS_WINDOW_TURNS = 2

# BRILLIANT: sacrificio real y compensación suficiente.
SACRIFICE_MIN_MATERIAL = 2
BRILLIANT_MIN_PLAYED_POINTS = 0.45
COMPLETELY_WON_POINTS = 0.95
TACTICAL_MISTAKE_MATERIAL_LOSS = 2

# Aproximación CAPS2 a partir de la pérdida media de Expected Points.
CAPS2_SCALE = 103.1668
CAPS2_DECAY = 0.04354
CAPS2_OFFSET = 3.1669

# Los topes se dejan desactivados durante la emulación.
MAX_BRILLIANTS_PER_SIDE = None
MAX_GREATS_PER_SIDE = None

PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
}


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def _win_k_for_rating(rating: int) -> float:
    rating = max(MIN_RATING, min(MAX_RATING, rating))
    return BASE_WIN_K * (1 + 0.20 * ((rating - DEFAULT_RATING) / DEFAULT_RATING))


def expected_points_white(score, rating: int) -> float:
    """Devuelve los Expected Points de blancas para un score desde su perspectiva."""
    if score.is_mate():
        return 1.0 if score.mate() > 0 else 0.0

    centipawns = max(-1500.0, min(1500.0, score.score()))
    return 1 / (1 + math.exp(-_win_k_for_rating(rating) * centipawns))


def caps2_accuracy(expected_point_losses) -> float:
    if not expected_point_losses:
        return 100.0

    average_loss_percent = 100 * sum(expected_point_losses) / len(expected_point_losses)
    accuracy = CAPS2_SCALE * math.exp(-CAPS2_DECAY * average_loss_percent) - CAPS2_OFFSET
    return max(0.0, min(100.0, accuracy))


def _material_balance(board: chess.Board, color: bool) -> int:
    mine = theirs = 0
    for piece in board.piece_map().values():
        value = PIECE_VALUES.get(piece.piece_type, 0)
        if piece.color == color:
            mine += value
        else:
            theirs += value
    return mine - theirs


def sacrificed_material(board_before: chess.Board, pv, max_plies: int = 8) -> int:
    """
    Material que se entrega temporalmente en la PV desde el punto de vista de quien mueve.
    Se conserva el mínimo balance para reconocer sacrificios recuperados después.
    """
    if not pv or len(pv) < 2:
        return 0
    mover = board_before.turn
    start = _material_balance(board_before, mover)

    board = board_before.copy(stack=False)
    minimum_balance = start
    for mv in pv[:max_plies]:
        board.push(mv)
        minimum_balance = min(minimum_balance, _material_balance(board, mover))
    return max(0, start - minimum_balance)


def net_material_loss(board_before: chess.Board, pv, max_plies: int = 8) -> int:
    """Material neto cedido al final de la PV, tras completar los intercambios."""
    if not pv or len(pv) < 2:
        return 0
    mover = board_before.turn
    start = _material_balance(board_before, mover)
    board = board_before.copy(stack=False)
    for move in pv[:max_plies]:
        board.push(move)
    return max(0, start - _material_balance(board, mover))


# ---------------------------------------------------------------------------
# Clasificador
# ---------------------------------------------------------------------------
class AdvancedClassifier:
    def __init__(self, white_rating=None, black_rating=None):
        self.white_rating = white_rating or DEFAULT_RATING
        self.black_rating = black_rating or DEFAULT_RATING
        self._last_loss = 0.0
        self._last_played_score_white = None
        self._miss_opportunity = None

    def _expected_points_for_player(self, score_white, color: bool) -> float:
        player_rating = self.white_rating if color == chess.WHITE else self.black_rating
        white_points = expected_points_white(score_white, player_rating)
        return white_points if color == chess.WHITE else 1.0 - white_points

    def _remember_move(
        self,
        loss: float,
        played_score_white,
        mover_color=None,
        best_score_white_before=None,
    ) -> None:
        self._last_loss = loss
        self._last_played_score_white = played_score_white
        if (
            mover_color is not None
            and best_score_white_before is not None
            and loss >= MISS_MIN_OPPONENT_LOSS
        ):
            opportunity_color = not mover_color
            self._miss_opportunity = {
                "color": opportunity_color,
                "baseline_points": self._expected_points_for_player(
                    best_score_white_before,
                    opportunity_color,
                ),
                "turns_remaining": MISS_WINDOW_TURNS,
            }

    def _is_miss_opportunity(
        self,
        board_before: chess.Board,
        best_score_white,
        played_score_white,
        loss: float,
    ) -> bool:
        opportunity = self._miss_opportunity
        if opportunity is None or opportunity["color"] != board_before.turn:
            return False

        # Una respuesta forzada no consume la oportunidad táctica disponible.
        if board_before.is_check() or board_before.legal_moves.count() == 1:
            return False

        color = board_before.turn
        best_points = self._expected_points_for_player(best_score_white, color)
        played_points = self._expected_points_for_player(played_score_white, color)
        baseline_points = opportunity["baseline_points"]
        recovery = best_points - baseline_points

        if recovery >= MISS_MIN_RECOVERY_GAIN:
            self._miss_opportunity = None
            return played_points <= baseline_points and loss >= EXCELLENT_LOSS

        opportunity["turns_remaining"] -= 1
        if opportunity["turns_remaining"] <= 0:
            self._miss_opportunity = None
        return False

    @property
    def last_loss(self) -> float:
        return self._last_loss

    def expected_loss(self, board_before: chess.Board, played_score_white, best_score_white, is_top_move: bool) -> float:
        if is_top_move:
            return 0.0
        is_white_turn = board_before.turn == chess.WHITE
        played_points = self._expected_points_for_player(played_score_white, is_white_turn)
        best_points = self._expected_points_for_player(best_score_white, is_white_turn)
        return max(0.0, best_points - played_points)

    def is_near_classification_boundary(
        self,
        board_before: chess.Board,
        played_score_white,
        best_score_white,
        is_top_move: bool,
        margin: float,
    ) -> bool:
        loss = self.expected_loss(board_before, played_score_white, best_score_white, is_top_move)
        return (
            not is_top_move
            and loss > 0.0
            and any(abs(loss - boundary) <= margin for boundary in CLASSIFICATION_BOUNDARIES)
        )

    def classify_move(
        self,
        board_before: chess.Board,
        move: chess.Move,
        played_score_white,
        best_score_white_before,
        second_best_score_white_before,
        is_top_move: bool,
        played_pv=None,
        is_book: bool = False,
        best_expected_points=None,
        second_expected_points=None,
        played_expected_points=None,
    ) -> str:
        is_white_turn = board_before.turn == chess.WHITE
        previous_loss = self._last_loss
        previous_score_white = self._last_played_score_white

        played_points = (
            played_expected_points
            if played_expected_points is not None
            else self._expected_points_for_player(played_score_white, is_white_turn)
        )
        best_points = (
            best_expected_points
            if best_expected_points is not None
            else self._expected_points_for_player(best_score_white_before, is_white_turn)
        )
        loss = 0.0 if is_top_move else max(0.0, best_points - played_points)

        if is_book:
            self._remember_move(0.0, played_score_white)
            return ANNOTATIONS["BOOK"]

        is_miss = self._is_miss_opportunity(
            board_before,
            best_score_white_before,
            played_score_white,
            loss,
        )
        self._remember_move(
            loss,
            played_score_white,
            is_white_turn,
            best_score_white_before,
        )
        is_near_best = is_top_move

        # MISS: se pierde una recuperación generada por un error rival.
        if is_miss:
            return ANNOTATIONS["MISS"]

        # Las clases normales se determinan exclusivamente con la pérdida de EP.
        if not is_near_best:
            if loss >= MISTAKE_LOSS:
                return ANNOTATIONS["BLUNDER"]
            if (
                played_pv
                and played_pv[0] == move
                and board_before.is_capture(move)
                and net_material_loss(board_before, played_pv) >= TACTICAL_MISTAKE_MATERIAL_LOSS
            ):
                return ANNOTATIONS["MISTAKE"]
            if loss >= INACCURACY_LOSS:
                return ANNOTATIONS["MISTAKE"]
            if loss >= GOOD_LOSS:
                return ANNOTATIONS["INACCURACY"]
            if loss >= EXCELLENT_LOSS:
                return ANNOTATIONS["GOOD"]
            return ANNOTATIONS["EXCELLENT"]

        if second_best_score_white_before is None or board_before.legal_moves.count() == 1:
            return ANNOTATIONS["BEST"]

        second_points = (
            second_expected_points
            if second_expected_points is not None
            else self._expected_points_for_player(second_best_score_white_before, is_white_turn)
        )
        pre_move_points = (
            self._expected_points_for_player(previous_score_white, is_white_turn)
            if previous_score_white is not None
            else best_points
        )
        is_recapture = (
            bool(board_before.move_stack)
            and board_before.peek().to_square == move.to_square
            and board_before.is_capture(move)
        )

        # BRILLIANT: sacrificio real, buena compensación y posición no decidida.
        if (
            played_pv
            and played_pv[0] == move
            and not is_recapture
            and pre_move_points < COMPLETELY_WON_POINTS
            and played_points >= BRILLIANT_MIN_PLAYED_POINTS
            and sacrificed_material(board_before, played_pv) >= SACRIFICE_MIN_MATERIAL
        ):
            return ANNOTATIONS["BRILLIANT"]

        # GREAT: única jugada buena o castigo de un error importante.
        unique_good_move = (
            best_points >= EQUAL_POINTS
            and second_points < EQUAL_POINTS
            and best_points - second_points >= GREAT_UNIQUE_GOOD_GAP
        )
        punishes_error = previous_loss >= MISTAKE_LOSS and best_points >= WINNING_POINTS
        if not is_recapture and (unique_good_move or punishes_error):
            return ANNOTATIONS["GREAT"]

        return ANNOTATIONS["BEST"]
