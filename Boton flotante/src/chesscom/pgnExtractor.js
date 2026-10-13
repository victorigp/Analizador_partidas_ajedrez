// Extractor de PGN desde la interfaz o estado de Chess.com

export async function getChessComPGN() {
    // Método 1: Intentar obtener del objeto global
    try {
        if (window.___INITIAL_STATE__?.game?.pgn) {
            return window.___INITIAL_STATE__?.game?.pgn;
        }
        if (window.Game?.data?.game?.pgn) {
            return window.Game.data.game.pgn;
        }
        if (window.gameData?.pgn) {
            return window.gameData.pgn;
        }
    } catch (e) {
        // Ignorar
    }

    // Método 2: Buscar script con tipo application/x-chess-pgn
    try {
        const pgnScript = document.querySelector('script[type="application/x-chess-pgn"]');
        if (pgnScript && pgnScript.textContent.trim()) {
            return pgnScript.textContent;
        }
    } catch (e) {
        // Ignorar
    }

    // Método 3: Buscar en elementos con clase o id específico
    try {
        const pgnElements = document.querySelectorAll('[class*="pgn"], [id*="pgn"], [data-pgn]');
        for (const el of pgnElements) {
            if (el.textContent?.includes('[Event') || el.getAttribute('data-pgn')?.includes('[Event')) {
                const pgnText = el.getAttribute('data-pgn') || el.textContent;
                if (pgnText?.includes('[Event')) {
                    return pgnText;
                }
            }
        }
    } catch (e) {
        // Ignorar
    }

    // Método 4: Buscar en elementos hidden o textarea
    try {
        const inputs = document.querySelectorAll('input[type="hidden"], textarea');
        for (const input of inputs) {
            if (input.value?.includes('[Event')) {
                return input.value;
            }
        }
    } catch (e) {
        // Ignorar
    }

    // Método 6: Extraer movimientos del DOM y reconstruir PGN
    try {
        const moveElements = document.querySelectorAll('.move-list .move, .game-moves .move, [data-move], .move-notation span');

        if (moveElements.length > 0) {
            // Intentar obtener jugadores
            const whitePlayer = document.querySelector('.board-layout-top [data-test-element="user-tagline-username"]')?.textContent?.trim() || 'White';
            const blackPlayer = document.querySelector('.board-layout-bottom [data-test-element="user-tagline-username"]')?.textContent?.trim() || 'Black';
            const resultEl = document.querySelector('[data-test-element="game-status"], .game-result');
            const result = resultEl?.textContent?.trim() || '*';

            // Obtener fecha
            const dateEl = document.querySelector('[data-test-element="game-date"]');
            const date = dateEl?.textContent?.trim() || new Date().toISOString().split('T')[0];

            // Reconstruir PGN
            let pgn = `[Event "?"]\n`;
            pgn += `[Site "Chess.com"]\n`;
            pgn += `[Date "${date}"]\n`;
            pgn += `[White "${whitePlayer}"]\n`;
            pgn += `[Black "${blackPlayer}"]\n`;
            pgn += `[Result "${result}"]\n`;
            pgn += `[WhiteElo "?"]\n`;
            pgn += `[BlackElo "?"]\n`;
            pgn += `[ECO "?"]\n`;
            pgn += `[PlyCount "${moveElements.length}"]\n\n`;

            // Extraer movimientos
            for (const el of moveElements) {
                const moveText = el.textContent?.trim();
                if (moveText && !isNaN(parseInt(moveText[0]))) {
                    // Es un número de jugada, obtener el movimiento
                    const fullText = el.parentNode?.textContent || el.textContent;
                    const moveMatch = fullText.match(/(\d+\.\s*[a-zA-Z0-9]+)/g);
                    if (moveMatch) {
                        pgn += moveMatch.join(' ') + ' ';
                    }
                }
            }

            pgn += result + '\n\n';

            if (pgn.includes('1.') && pgn.includes('[Event')) {
                return pgn;
            }
        }
    } catch (e) {
        // Ignorar
    }

    return null;
}
