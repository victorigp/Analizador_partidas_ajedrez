// Glifos, badges y marcadores en el tablero de Lichess

import { MOVE_TYPES } from './constants.js';
import { state } from './state.js';
import { getMainlineMoveNodes } from './moveUtils.js';
import { getMoveTypeIconHtml, createMoveTypeBadge } from './icons.js';

export { getMoveTypeIconHtml, createMoveTypeBadge };

export function getDestSquareFromSan(san, moveColor) {
    const clean = san?.replace(/[+#!?]/g, '').trim();
    if (!clean) return null;
    if (clean === 'O-O') return moveColor === 'white' ? 'g1' : 'g8';
    if (clean === 'O-O-O') return moveColor === 'white' ? 'c1' : 'c8';
    const match = clean.match(/([a-h][1-8])(?:=[QRBN])?$/);
    return match ? match[1] : null;
}

export function squareToTransform(square, isFlipped) {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    const x = isFlipped ? 7 - file : file;
    const y = isFlipped ? rank : 7 - rank;
    return `translate(${x * 100}%, ${y * 100}%)`;
}

export function isCheckmate(san, moveIndex) {
    if (san && (san.includes('#') || san.includes('++') || san.includes('‡'))) return true;
    if (state.data && typeof moveIndex === 'number' && moveIndex === state.data.moves.length - 1) {
        const termination = state.data.headers['Termination'] || state.data.headers['Result'] || '';
        const evalRaw = state.data.moves[moveIndex]?.rawEvaluation || '';
        if (/mate/i.test(termination) || /checkmate/i.test(termination) || /#0\b/.test(evalRaw)) return true;
    }
    return false;
}

export function getGameWinner(move, moveIndex) {
    if (!state.data || !move) return null;
    if (isCheckmate(move.san, moveIndex)) {
        const winner = moveIndex % 2 === 0 ? 'white' : 'black';
        return { winner, loser: winner === 'white' ? 'black' : 'white', reason: 'checkmate' };
    }
    const isLastMove = typeof moveIndex === 'number' && moveIndex === state.data.moves.length - 1;
    if (!isLastMove) return null;

    const result = (state.data.headers['Result'] || '').trim();
    const termination = (state.data.headers['Termination'] || '').trim();

    if (result === '1/2-1/2' || /tablas|draw|stalemate|ahogado|repetition|repetición/i.test(termination)) {
        return null;
    }

    if (result === '1-0' || /blancas.*ganado|white.*won/i.test(termination)) {
        return { winner: 'white', loser: 'black', reason: 'resignation' };
    }
    if (result === '0-1' || /negras.*ganado|black.*won/i.test(termination)) {
        return { winner: 'black', loser: 'white', reason: 'resignation' };
    }
    return null;
}

export function syncBoardGlyph() {
    const board = document.querySelector('cg-board');
    if (!board || !state.data) return;
    board.querySelectorAll('.local-board-glyph').forEach((glyph) => glyph.remove());
    board.querySelectorAll('glyph:not(.local-board-glyph)').forEach((glyph) => {
        glyph.style.display = 'none';
        glyph.classList.add('local-analysis-native-hidden');
    });
    const mainlineMoves = getMainlineMoveNodes();
    const activeEntry = mainlineMoves.find((item) => item.node.classList.contains('active') || item.node.classList.contains('a'));
    const activeIndex = activeEntry?.index;
    const move = activeIndex !== undefined ? state.data.moves[activeIndex] : null;
    if (!move) return;

    const moveColor = activeIndex % 2 === 0 ? 'white' : 'black';
    const isFlipped = document.querySelector('.cg-wrap')?.classList.contains('orientation-black');
    const gameWinner = getGameWinner(move, activeIndex);

    if (gameWinner) {
        const winnerColor = gameWinner.winner;
        const loserColor = gameWinner.loser;

        const winnerKingEl = board.querySelector(`piece.${winnerColor}.king, piece.king.${winnerColor}`);
        const loserKingEl = board.querySelector(`piece.${loserColor}.king, piece.king.${loserColor}`);

        const getTransform = (pieceEl, fallbackSquare) => {
            if (pieceEl && pieceEl.style && pieceEl.style.transform) {
                return pieceEl.style.transform;
            }
            if (pieceEl && pieceEl.cgKey) {
                return squareToTransform(pieceEl.cgKey, isFlipped);
            }
            return squareToTransform(fallbackSquare, isFlipped);
        };

        const winnerTransform = getTransform(winnerKingEl, winnerColor === 'white' ? 'e1' : 'e8');
        const loserTransform = getTransform(loserKingEl, loserColor === 'white' ? 'e1' : 'e8');

        [
            { transform: winnerTransform, iconType: 'WHITE_CROWN', color: '#81b64c' },
            { transform: loserTransform, iconType: 'BLACK_CROWN', color: '#fa412d' }
        ].forEach(({ transform, iconType, color }) => {
            const marker = document.createElement('div');
            marker.className = 'local-board-glyph';
            Object.assign(marker.style, {
                left: '0', position: 'absolute', top: '0', transform: transform, width: '12.5%', height: '12.5%',
                zIndex: '15', pointerEvents: 'none',
            });
            const bubble = document.createElement('div');
            Object.assign(bubble.style, {
                alignItems: 'center', backgroundColor: color, borderRadius: '50%',
                color: 'white', display: 'flex', fontFamily: '"Noto Sans", sans-serif',
                fontSize: 'clamp(11px, 2.2vw, 29px)', fontWeight: 'bold',
                height: '40%', justifyContent: 'center', position: 'absolute',
                right: '-11%', top: '-11%', width: '40%', zIndex: '16', pointerEvents: 'none',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.45)',
            });
            bubble.innerHTML = getMoveTypeIconHtml(iconType, '72%');
            marker.appendChild(bubble);
            board.appendChild(marker);
        });
    }

    if (move && MOVE_TYPES[move.type]) {
        const destination = getDestSquareFromSan(move.san, moveColor);
        if (destination) {
            const marker = document.createElement('div');
            marker.className = 'local-board-glyph';
            Object.assign(marker.style, {
                left: '0', position: 'absolute', top: '0', transform: squareToTransform(destination, isFlipped), width: '12.5%', height: '12.5%',
                zIndex: '10', pointerEvents: 'none',
            });
            const bubble = document.createElement('div');
            Object.assign(bubble.style, {
                alignItems: 'center', backgroundColor: MOVE_TYPES[move.type].color, borderRadius: '50%',
                color: 'white', display: 'flex', fontFamily: '"Noto Sans", sans-serif', fontSize: 'clamp(11px, 2.2vw, 29px)', fontWeight: 'bold',
                height: '40%', justifyContent: 'center', position: 'absolute', right: '-11%', top: '-11%', width: '40%', zIndex: '11',
            });
            bubble.innerHTML = getMoveTypeIconHtml(move.type);
            marker.appendChild(bubble);
            board.appendChild(marker);
        }
    }
}
