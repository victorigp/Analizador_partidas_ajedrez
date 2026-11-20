// Funciones de parseo de PGN, cabeceras y metadatos de evaluación

export function parseHeaders(pgn) {
    const headers = {};
    for (const match of pgn.matchAll(/^\[([^\s]+)\s+"(.*)"\]\s*$/gm)) headers[match[1]] = match[2];

    const annotator = headers['Annotator'] || '';
    if (annotator.includes('Accuracy')) {
        const parts = annotator.split(',');
        for (const part of parts) {
            const [key, value] = part.split(':').map((s) => s.trim());
            if (key && value) {
                headers[key] = value;
            }
        }
    }

    const accMatches = pgn.matchAll(/(WhiteEloAccuracy\w*|BlackEloAccuracy\w*):\s*([\d.]+)/g);
    for (const match of accMatches) {
        if (!headers[match[1]]) {
            headers[match[1]] = match[2];
        }
    }
    return headers;
}

export function parseEval(value) {
    if (!value) return null;
    const mate = value.match(/^(?:#?M|#)([+-]?\d+)$/i);
    if (mate) return Number(mate[1]) < 0 ? -12 : 12;
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) ? numeric : null;
}

export function parseMetadata(comment) {
    const evalMatch = comment.match(/\[%eval\s+([^\]\s]+)\]/i);
    const localEvalMatch = comment.match(/\[#LOCAL_EVAL\s*:\s*([^#\]\s]+)#\]/i);
    const typeMatch = comment.match(/\[#(BRILLIANT|GREAT|BOOK|BEST|EXCELLENT|GOOD|INACCURACY|MISTAKE|MISS|BLUNDER)#\]/i);
    if (!evalMatch && !localEvalMatch && !typeMatch) return null;
    const evaluationText = localEvalMatch?.[1] || evalMatch?.[1] || null;
    return {
        evaluation: parseEval(evaluationText),
        rawEvaluation: evaluationText,
        type: typeMatch ? typeMatch[1].toUpperCase() : null,
        hasLocalEval: Boolean(localEvalMatch),
    };
}

export function hasLocalAnalysis(data) {
    if (!data) return false;
    const hasAccuracyHeader = Object.keys(data.headers || {}).some((key) => /^(?:White|Black)EloAccuracy/i.test(key));
    if (hasAccuracyHeader) return true;
    return (data.moves || []).some((move) => Boolean(move.type || move.hasLocalEval));
}

export function appendMoveToken(rawToken, moves) {
    let token = rawToken.replace(/^\d+\.(?:\.\.)?/, '').replace(/^\.\.\./, '').trim();
    token = token.replace(/\$\d+$/, '').replace(/[!?]+$/, '');
    if (!token || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(token) || !/^[a-hKQRBNO]/.test(token)) return;
    moves.push({ san: token, evaluation: null, rawEvaluation: null, type: null, hasLocalEval: false });
}

export function parsePgn(pgn) {
    const headers = parseHeaders(pgn);
    const body = pgn.replace(/^\[[^\n]*\]\s*$/gm, '');
    const moves = [];
    let index = 0;
    let variationDepth = 0;
    let lastMoveIndex = -1;
    while (index < body.length) {
        const char = body[index];
        if (char === '{') {
            const end = body.indexOf('}', index + 1);
            const metadata = parseMetadata(body.slice(index + 1, end === -1 ? body.length : end));
            if (variationDepth === 0 && lastMoveIndex >= 0 && metadata) {
                const targetMove = moves[lastMoveIndex];
                if (metadata.type) targetMove.type = metadata.type;
                if (metadata.hasLocalEval) {
                    targetMove.evaluation = metadata.evaluation;
                    targetMove.rawEvaluation = metadata.rawEvaluation;
                    targetMove.hasLocalEval = true;
                } else if (Number.isFinite(metadata.evaluation) && !targetMove.hasLocalEval && !Number.isFinite(targetMove.evaluation)) {
                    targetMove.evaluation = metadata.evaluation;
                    targetMove.rawEvaluation = metadata.rawEvaluation;
                }
            }
            index = end === -1 ? body.length : end + 1;
        } else if (char === '(') {
            variationDepth += 1;
            index += 1;
        } else if (char === ')') {
            variationDepth = Math.max(0, variationDepth - 1);
            index += 1;
        } else if (/\s/.test(char)) {
            index += 1;
        } else {
            const start = index;
            while (index < body.length && !/[\s{}()]/.test(body[index])) index += 1;
            if (variationDepth === 0) {
                const lengthBefore = moves.length;
                appendMoveToken(body.slice(start, index), moves);
                if (moves.length > lengthBefore) lastMoveIndex = moves.length - 1;
            }
        }
    }
    return { headers, moves };
}
