// ==UserScript==
// @name         Analizador Ajedrez (Chess.com y Lichess)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Inicia el análisis desde Chess.com y muestra el análisis local en Lichess.
// @author       Victor
// @match        *://*.chess.com/game/*
// @match        https://lichess.org/study/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const currentUrl = window.location.href;

    // Se añade el acceso al programa local desde una partida de Chess.com.
    if (currentUrl.includes('chess.com/game/')) {
        const button = document.createElement('button');
        button.textContent = '🤖 Analizar con IA';
        Object.assign(button.style, {
            position: 'fixed', bottom: '30px', right: '30px', padding: '15px 25px',
            fontSize: '16px', fontWeight: 'bold', color: '#fff', backgroundColor: '#7fa650',
            border: 'none', borderRadius: '8px', boxShadow: '0 6px 12px rgba(0,0,0,0.4)',
            cursor: 'pointer', zIndex: '999999', transition: 'transform .2s, background-color .2s',
        });
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.05)';
            button.style.backgroundColor = '#8bc453';
        });
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
            button.style.backgroundColor = '#7fa650';
        });
        button.addEventListener('click', () => {
            window.location.href = `ajedrez://${window.location.href}`;
        });
        document.body.appendChild(button);
        return;
    }

    // Se pinta la interfaz local al abrir el estudio final de Lichess.
    if (!currentUrl.includes('lichess.org/study/')) return;

    // Se cambian aquí los símbolos textuales de cada clasificación.
    const MOVE_TYPES = {
        BRILLIANT: { label: 'Brillante', symbol: '!!', color: '#1baca6' },
        GREAT: { label: 'Genial', symbol: '!', color: '#4f9ed8' },
        BOOK: { label: 'Libro', color: '#a88865' },
        BEST: { label: 'Mejor', symbol: '=', color: '#81b64c' },
        EXCELLENT: { label: 'Excelente', symbol: '!', color: '#96bc4b' },
        GOOD: { label: 'Bueno', symbol: '!?', color: '#b2d35e' },
        INACCURACY: { label: 'Imprecisión', symbol: '?!', color: '#e5b74b' },
        MISTAKE: { label: 'Error', symbol: '?', color: '#e58b45' },
        MISS: { label: 'Omisión', symbol: '×', color: '#e66b5b' },
        BLUNDER: { label: 'Error grave', symbol: '??', color: '#d8504f' },
    };
    const TYPE_ORDER = Object.keys(MOVE_TYPES);
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const state = { path: '', data: null, statCycles: new Map() };

    function injectStyles() {
        if (document.getElementById('local-analysis-styles')) return;
        const style = document.createElement('style');
        style.id = 'local-analysis-styles';
        style.textContent = `
            #local-analysis-chart-panel { background: transparent; box-sizing: border-box; color: var(--c-font, #bababa); overflow: hidden; }
            .local-analysis-title { align-items: baseline; display: flex; gap: .6em; justify-content: space-between; padding: 0 0 .35em; }
            .local-analysis-title strong, .local-analysis-player { color: var(--c-font, #ddd); }
            .local-analysis-title small { font-size: .82em; opacity: .75; }
            .local-analysis-chart { display: block; height: 220px; width: 100%; }
            .local-analysis-baseline { stroke: currentColor; opacity: .25; stroke-width: 1; }
            .local-analysis-line { fill: none; stroke: #e58b45; stroke-width: 2.5; }
            .local-analysis-point { cursor: pointer; stroke: var(--c-bg-zebra, #262421); stroke-width: 1.5; }
            .local-analysis-point.is-active { stroke: white; stroke-width: 3; }
            .local-analysis-axis { fill: currentColor; font-size: 11px; opacity: .68; }
            #local-analysis-status { color: #fff; font-size: 1.05em; font-weight: bold; line-height: 1.4; margin: .15em 0 .65em; padding: .45em 0; text-align: center; }
            #local-analysis-summary-panel { background: var(--c-bg-zebra, #262421); border-radius: 6px; margin-top: .5em; overflow: hidden; box-shadow: 0 2px 2px #00000014, 0 3px 1px -2px #0000002e, 0 1px 5px #0000001a; }
            .advice-summary.local-analysis-summary { background: var(--c-bg-box); display: grid; grid-template-columns: 1fr; margin: 0; padding: 0; }
            .advice-summary.local-analysis-summary .advice-summary__side { background: transparent; min-width: 0; padding: .55em .8em .75em; }
            .advice-summary.local-analysis-summary .advice-summary__side + .advice-summary__side { border-top: 1px solid rgba(255, 255, 255, .08); }
            .local-analysis-player { font-weight: bold; margin-bottom: .5em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; font-size: 1.4em; }
            .local-analysis-count { cursor: pointer; display: flex; font-size: 1.25em; justify-content: space-between; line-height: 1.45; user-select: none; }
            .local-analysis-count:hover { opacity: .8; }
            .local-analysis-count span:last-child { font-weight: bold; }
            glyph.custom-move-glyph { align-items: center; background: none !important; box-shadow: none !important; display: inline-flex !important; font-family: 'Noto Sans', sans-serif; font-size: .9em !important; font-weight: bold; justify-content: center; margin-left: 4px !important; vertical-align: middle !important; }
            move[data-local-analysis-type].active san, u8[data-local-analysis-type].active kw, move[data-local-analysis-type].active .custom-move-glyph, u8[data-local-analysis-type].active .custom-move-glyph { color: white !important; fill: white !important; }
            move[data-local-analysis-type="brilliant"].active, u8[data-local-analysis-type="brilliant"].active { background-color: #1baca6 !important; }
            move[data-local-analysis-type="great"].active, u8[data-local-analysis-type="great"].active { background-color: #4f9ed8 !important; }
            move[data-local-analysis-type="book"].active, u8[data-local-analysis-type="book"].active { background-color: #a88865 !important; }
            move[data-local-analysis-type="best"].active, u8[data-local-analysis-type="best"].active { background-color: #81b64c !important; }
            move[data-local-analysis-type="excellent"].active, u8[data-local-analysis-type="excellent"].active { background-color: #96bc4b !important; }
            move[data-local-analysis-type="good"].active, u8[data-local-analysis-type="good"].active { background-color: #b2d35e !important; }
            move[data-local-analysis-type="inaccuracy"].active, u8[data-local-analysis-type="inaccuracy"].active { background-color: #e5b74b !important; }
            move[data-local-analysis-type="mistake"].active, u8[data-local-analysis-type="mistake"].active { background-color: #e58b45 !important; }
            move[data-local-analysis-type="miss"].active, u8[data-local-analysis-type="miss"].active { background-color: #e66b5b !important; }
            move[data-local-analysis-type="blunder"].active, u8[data-local-analysis-type="blunder"].active { background-color: #d8504f !important; }
            move[data-local-analysis-type]:not(.active) san, u8[data-local-analysis-type]:not(.active) kw, move[data-local-analysis-type]:not(.active) .custom-move-glyph, u8[data-local-analysis-type]:not(.active) .custom-move-glyph { color: var(--local-move-color) !important; fill: var(--local-move-color) !important; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function parseHeaders(pgn) {
        const headers = {};
        for (const match of pgn.matchAll(/^\[([^\s]+)\s+"(.*)"\]\s*$/gm)) headers[match[1]] = match[2];

        const annotator = headers['Annotator'] || '';
        if (annotator.includes('Accuracy')) {
            const parts = annotator.split(',');
            for (const part of parts) {
                const [key, value] = part.split(':').map(s => s.trim());
                if (key && value) {
                    headers[key] = value;
                }
            }
        }
        return headers;
    }

    function parseEval(value) {
        if (!value) return null;
        const mate = value.match(/^(?:#?M|#)([+-]?\d+)$/i);
        if (mate) return Number(mate[1]) < 0 ? -12 : 12;
        const numeric = Number.parseFloat(value);
        return Number.isFinite(numeric) ? numeric : null;
    }

    function parseMetadata(comment) {
        const evalMatch = comment.match(/\[%eval\s+([^\]\s]+)\]/i);
        const localEvalMatch = comment.match(/\[#LOCAL_EVAL\s*:\s*([^#\]\s]+)#\]/i);
        const typeMatch = comment.match(/\[#(BRILLIANT|GREAT|BOOK|BEST|EXCELLENT|GOOD|INACCURACY|MISTAKE|MISS|BLUNDER)#\]/i);
        if (!evalMatch && !localEvalMatch && !typeMatch) return null;
        const evaluationText = localEvalMatch?.[1] || evalMatch?.[1] || null;
        return {
            evaluation: parseEval(evaluationText),
            rawEvaluation: evaluationText,
            type: typeMatch ? typeMatch[1].toUpperCase() : null,
        };
    }

    function appendMoveToken(rawToken, moves) {
        let token = rawToken.replace(/^\d+\.(?:\.\.)?/, '').replace(/^\.\.\./, '').trim();
        token = token.replace(/\$\d+$/, '').replace(/[!?]+$/, '');
        if (!token || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(token) || !/^[a-hKQRBNO]/.test(token)) return;
        moves.push({ san: token, evaluation: null, rawEvaluation: null, type: null });
    }

    function parsePgn(pgn) {
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
                if (variationDepth === 0 && lastMoveIndex >= 0 && metadata) Object.assign(moves[lastMoveIndex], metadata);
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

    function getMoveNodes() {
        const selectors = [
            '.analyse__moves move:not(.empty)', '.analyse__moves u8:not(.empty)',
            '.study__moves move:not(.empty)', '.study__moves u8:not(.empty)',
            '.gamebook move:not(.empty)', '.gamebook u8:not(.empty)',
        ];
        return [...new Set([...document.querySelectorAll(selectors.join(','))])];
    }

    function normalizeSan(san) {
        return (san || '').replace(/\s/g, '').replace(/[!?]+$/g, '');
    }

    function getMainlineMoveNodes() {
        if (!state.data) return [];
        let expectedIndex = 0;
        const mainline = [];
        for (const node of getMoveNodes()) {
            const expectedMove = state.data.moves[expectedIndex];
            const san = normalizeSan((node.querySelector('san, kw') || node).textContent);
            if (expectedMove && san === normalizeSan(expectedMove.san)) {
                mainline.push({ node, index: expectedIndex });
                expectedIndex += 1;
            }
        }
        return mainline;
    }

    function readDomEvaluation(node) {
        const evaluationNode = node.querySelector('eval, e');
        if (!evaluationNode) return null;
        return parseEval(evaluationNode.textContent.trim());
    }

    function hideVisibleMetadata() {
        document.querySelectorAll('comment, .comment').forEach((comment) => {
            const walker = document.createTreeWalker(comment, NodeFilter.SHOW_TEXT);
            const textNodes = [];
            while (walker.nextNode()) textNodes.push(walker.currentNode);
            textNodes.forEach((node) => {
                node.textContent = node.textContent
                    .replace(/\s*\[%eval\s+[^\]]+\]/gi, '')
                    .replace(/\s*\[#LOCAL_EVAL\s*:\s*[^#\]]+#\]/gi, '')
                    .replace(/\s*\[#(?:BRILLIANT|GREAT|BOOK|BEST|EXCELLENT|GOOD|INACCURACY|MISTAKE|MISS|BLUNDER)#\]/gi, '')
                    .replace(/\s*\[\w*Accuracy\w*\s+"[^"]+"\]/gi, '');
            });
        });
    }

    const BOOK_SVG = '<svg style="width: 0.85em; height: 0.85em;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M96 0C43 0 0 43 0 96V416c0 53 43 96 96 96H384h32c17.7 0 32-14.3 32-32s-14.3-32-32-32V384c17.7 0 32-14.3 32-32V32c0-17.7-14.3-32-32-32H384 96zm0 384H352v64H96c-17.7 0-32-14.3-32-32s14.3-32 32-32zm32-240c0-8.8 7.2-16 16-16H336c8.8 0 16 7.2 16 16s-7.2 16-16 16H144c-8.8 0-16-7.2-16-16zm16 48H336c8.8 0 16 7.2 16 16s-7.2 16-16 16H144c-8.8 0-16-7.2-16-16s7.2-16 16-16z"/></svg>';

    function setMoveGlyph(node, type) {
        node.querySelectorAll('.custom-move-glyph').forEach((glyph) => glyph.remove());
        node.querySelectorAll('.local-analysis-native-hidden').forEach((glyph) => {
            glyph.style.display = '';
            glyph.classList.remove('local-analysis-native-hidden');
        });
        node.removeAttribute('data-local-analysis-type');
        node.style.removeProperty('--local-move-color');
        if (!type || !MOVE_TYPES[type]) return;
        const definition = MOVE_TYPES[type];
        node.querySelectorAll('glyph:not(.custom-move-glyph)').forEach((glyph) => {
            glyph.style.display = 'none';
            glyph.classList.add('local-analysis-native-hidden');
        });
        const glyph = document.createElement('glyph');
        glyph.className = 'custom-move-glyph';
        glyph.dataset.glyphType = type.toLowerCase();
        glyph.dataset.color = definition.color;
        glyph.title = definition.label;
        node.style.setProperty('--local-move-color', definition.color);
        if (type === 'BOOK') glyph.innerHTML = BOOK_SVG;
        else glyph.textContent = definition.symbol;
        const moveText = node.querySelector('san, kw') || node;
        moveText.insertAdjacentElement('afterend', glyph);
        node.dataset.localAnalysisType = type.toLowerCase();
    }

    function activateMove(index) {
        const node = getMainlineMoveNodes().find((item) => item.index === index)?.node;
        if (!node) return;
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try {
            node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
            node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        } catch (_) { }
        node.click();
        setTimeout(() => {
            updateActivePoint();
            syncBoardGlyph();
        }, 80);
    }

    function svgElement(name, attributes = {}) {
        const element = document.createElementNS(SVG_NS, name);
        Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
        return element;
    }

    function createChart(moves) {
        const width = 720;
        const height = 220;
        const padding = { left: 12, right: 12, top: 24, bottom: 18 };
        const plotWidth = width - padding.left - padding.right;
        const baseline = height / 2;
        const plotHeight = height - padding.top - padding.bottom;
        const svg = svgElement('svg', { class: 'local-analysis-chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Gráfico de evaluaciones locales', preserveAspectRatio: 'none' });
        const points = moves.map((move, index) => {
            if (!Number.isFinite(move.evaluation)) return null;
            const x = padding.left + (moves.length <= 1 ? 0 : (index / (moves.length - 1)) * plotWidth);
            const y = padding.top + ((1 - Math.tanh(move.evaluation / 4)) / 2) * plotHeight;
            return { index, x, y };
        }).filter(Boolean);
        const topLabel = svgElement('text', { x: padding.left, y: 14, class: 'local-analysis-axis' });
        topLabel.textContent = 'Ventaja blanca';
        const bottomLabel = svgElement('text', { x: width - padding.right, y: height - 5, class: 'local-analysis-axis', 'text-anchor': 'end' });
        bottomLabel.textContent = 'Ventaja negra';
        svg.append(topLabel, bottomLabel, svgElement('line', { x1: padding.left, y1: baseline, x2: width - padding.right, y2: baseline, class: 'local-analysis-baseline' }));
        if (!points.length) return svg;
        const area = [`M ${points[0].x} ${baseline}`, ...points.map((point) => `L ${point.x} ${point.y}`), `L ${points[points.length - 1].x} ${baseline}`, 'Z'].join(' ');
        const line = points.map((point, position) => `${position ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
        svg.append(
            svgElement('path', { d: area, fill: '#e58b4533', stroke: 'none' }),
            svgElement('path', { d: line, class: 'local-analysis-line', fill: 'none', stroke: '#e58b45', 'stroke-width': 2.5 }),
        );
        points.forEach((point) => {
            const move = moves[point.index];
            const type = MOVE_TYPES[move.type] ? move.type : null;
            const circle = svgElement('circle', { cx: point.x, cy: point.y, r: type ? 4.5 : 2.2, fill: type ? MOVE_TYPES[type].color : '#b0b0b0', stroke: '#262421', 'stroke-width': 1.5, class: 'local-analysis-point', 'data-move-index': point.index });
            const title = svgElement('title');
            title.textContent = `${move.san}: ${move.rawEvaluation || move.evaluation}${type ? `, ${MOVE_TYPES[type].label}` : ''}`;
            circle.appendChild(title);
            circle.addEventListener('click', () => activateMove(point.index));
            svg.appendChild(circle);
        });
        return svg;
    }

    function createSummary(data) {
        const summary = document.createElement('div');
        summary.className = 'advice-summary local-analysis-summary';
        [['White', 'WhiteElo', 'Blancas'], ['Black', 'BlackElo', 'Negras']].forEach(([nameHeader, ratingHeader, fallback], sideIndex) => {
            const side = document.createElement('section');
            side.className = 'advice-summary__side local-analysis-side';
            const player = document.createElement('div');
            player.className = 'local-analysis-player';
            const playerIcon = `<span style="display:inline-block; width:13px; height:13px; border-radius:50%; background-color:${sideIndex === 0 ? '#fff' : '#262421'}; border:2px solid ${sideIndex === 0 ? '#999' : '#fff'}; vertical-align:middle; margin-right:6px; margin-bottom:2px;"></span>`;
            player.innerHTML = `${playerIcon}${data.headers[nameHeader] || fallback} (${data.headers[ratingHeader] || 'sin Elo'})`;
            side.appendChild(player);

            const statsContainer = document.createElement('div');
            statsContainer.style.display = 'flex';
            statsContainer.style.alignItems = 'center';

            const countsCol = document.createElement('div');
            countsCol.style.flex = '1';
            countsCol.style.paddingRight = '1em';

            const accCol = document.createElement('div');
            accCol.style.flex = '1';
            accCol.style.textAlign = 'center';
            accCol.style.display = 'flex';
            accCol.style.flexDirection = 'column';
            accCol.style.gap = '0.5em';
            accCol.style.borderLeft = '1px solid rgba(255,255,255,0.1)';
            accCol.style.paddingLeft = '0.5em';

            TYPE_ORDER.forEach((type) => {
                const count = data.moves.reduce((total, move, index) => total + (index % 2 === sideIndex && move.type === type ? 1 : 0), 0);
                const row = document.createElement('div');
                row.className = 'custom-move-stat advice-summary__error local-analysis-count';
                row.style.color = MOVE_TYPES[type].color;
                row.title = 'Haz clic para ir a esta jugada';
                const label = document.createElement('span');
                label.textContent = MOVE_TYPES[type].label;
                const value = document.createElement('span');
                value.textContent = String(count);
                row.append(label, value);
                row.addEventListener('click', () => activateCategory(sideIndex, type));
                countsCol.appendChild(row);
            });

            const prefix = sideIndex === 0 ? 'White' : 'Black';
            const accGlobal = data.headers[`${prefix}EloAccuracy`] || '-';
            const accApertura = data.headers[`${prefix}EloAccuracyApertura`] || '-';
            const accMedio = data.headers[`${prefix}EloAccuracyMediojuego`] || '-';
            const accFinal = data.headers[`${prefix}EloAccuracyFinal`] || '-';

            accCol.innerHTML = `
                <div style="font-size:1.8em; font-weight:bold;">Precisión</div>
                <div style="font-size:1.8em; font-weight:bold;">${accGlobal}%</div>
                <div style="font-size:0.9em; opacity:0.8;">Apertura: <strong>${accApertura}%</strong></div>
                <div style="font-size:0.9em; opacity:0.8;">Medio juego: <strong>${accMedio}%</strong></div>
                <div style="font-size:0.9em; opacity:0.8;">Final: <strong>${accFinal}%</strong></div>
            `;

            statsContainer.appendChild(countsCol);
            statsContainer.appendChild(accCol);
            side.appendChild(statsContainer);
            summary.appendChild(side);
        });
        return summary;
    }

    function activateCategory(sideIndex, type) {
        if (!state.data) return;
        const indexes = state.data.moves.reduce((result, move, index) => {
            if (index % 2 === sideIndex && move.type === type) result.push(index);
            return result;
        }, []);
        if (!indexes.length) return;
        const key = `${sideIndex}:${type}`;
        const next = state.statCycles.get(key) || 0;
        activateMove(indexes[next % indexes.length]);
        state.statCycles.set(key, next + 1);
    }

    function renderPanel(data) {
        const studyMessage = document.querySelector('.study__message');
        if (!studyMessage) return false;
        let chartPanel = document.getElementById('local-analysis-chart-panel');
        if (!chartPanel) {
            chartPanel = document.createElement('section');
            chartPanel.id = 'local-analysis-chart-panel';
        }
        const title = document.createElement('div');
        title.className = 'local-analysis-title';
        const heading = document.createElement('strong');
        heading.textContent = 'Análisis local de Stockfish';
        const subtitle = document.createElement('small');
        subtitle.textContent = 'PGN local, sin análisis del servidor';
        title.append(heading, subtitle);
        chartPanel.replaceChildren(title, createChart(data.moves));

        let status = document.getElementById('local-analysis-status');
        if (!status) {
            status = document.createElement('div');
            status.id = 'local-analysis-status';
        }
        status.innerHTML = '<br>Esta partida ya está analizada localmente con STOCKFISH.<br>No hace falta solicitar el análisis del ordenador de más abajo.<br>';

        studyMessage.prepend(chartPanel);
        chartPanel.insertAdjacentElement('afterend', status);

        const training = document.querySelector('.analyse__round-training');
        let summaryPanel = document.getElementById('local-analysis-summary-panel');
        if (!summaryPanel) {
            summaryPanel = document.createElement('section');
            summaryPanel.id = 'local-analysis-summary-panel';
        }
        summaryPanel.replaceChildren(createSummary(data));
        if (training) training.appendChild(summaryPanel);
        else chartPanel.appendChild(summaryPanel);
        return true;
    }

    function getDestSquareFromSan(san, moveColor) {
        const clean = san?.replace(/[+#!?]/g, '').trim();
        if (!clean) return null;
        if (clean === 'O-O') return moveColor === 'white' ? 'g1' : 'g8';
        if (clean === 'O-O-O') return moveColor === 'white' ? 'c1' : 'c8';
        const match = clean.match(/([a-h][1-8])(?:=[QRBN])?$/);
        return match ? match[1] : null;
    }

    function squareToTransform(square, isFlipped) {
        const file = square.charCodeAt(0) - 97;
        const rank = Number(square[1]) - 1;
        const x = isFlipped ? 7 - file : file;
        const y = isFlipped ? rank : 7 - rank;
        return `translate(${x * 100}%, ${y * 100}%)`;
    }

    function syncBoardGlyph() {
        const board = document.querySelector('cg-board');
        if (!board || !state.data) return;
        board.querySelectorAll('.local-board-glyph').forEach((glyph) => glyph.remove());
        board.querySelectorAll('glyph').forEach((glyph) => { glyph.style.display = ''; });
        const activeEntry = getMainlineMoveNodes().find((item) => item.node.classList.contains('active'));
        const activeIndex = activeEntry?.index;
        const move = state.data.moves[activeIndex];
        if (!move || !MOVE_TYPES[move.type]) return;
        const destination = getDestSquareFromSan(move.san, activeIndex % 2 === 0 ? 'white' : 'black');
        if (!destination) return;
        board.querySelectorAll('glyph').forEach((glyph) => { glyph.style.display = 'none'; });
        const isFlipped = document.querySelector('.cg-wrap')?.classList.contains('orientation-black');
        const marker = document.createElement('div');
        marker.className = 'local-board-glyph';
        Object.assign(marker.style, {
            left: '0', position: 'absolute', top: '0', transform: squareToTransform(destination, isFlipped), width: '12.5%', height: '12.5%',
            zIndex: '10', pointerEvents: 'none',
        });
        const bubble = document.createElement('div');
        Object.assign(bubble.style, {
            alignItems: 'center', backgroundColor: MOVE_TYPES[move.type].color, borderRadius: '50%', boxShadow: '0 2px 5px rgba(0,0,0,.3)',
            color: 'white', display: 'flex', fontFamily: '"Noto Sans", sans-serif', fontSize: 'clamp(11px, 2.2vw, 29px)', fontWeight: 'bold',
            height: '40%', justifyContent: 'center', position: 'absolute', right: '-11%', top: '-11%', width: '40%', zIndex: '11',
        });
        if (move.type === 'BOOK') {
            bubble.innerHTML = BOOK_SVG;
            bubble.querySelector('svg')?.setAttribute('style', 'fill:white;height:68%;width:68%;');
        } else {
            bubble.textContent = MOVE_TYPES[move.type].symbol;
        }
        marker.appendChild(bubble);
        board.appendChild(marker);
    }

    function updateActivePoint() {
        const activeIndex = getMainlineMoveNodes().find((item) => item.node.classList.contains('active'))?.index;
        document.querySelectorAll('.local-analysis-point').forEach((point) => {
            point.classList.toggle('is-active', Number(point.dataset.moveIndex) === activeIndex);
        });
        syncBoardGlyph();
    }

    let moveListObserver = null;
    let observedMoveList = null;

    function setupBoardSync() {
        const moveList = document.querySelector('.analyse__moves, .study__moves, .gamebook, rmoves, l4x, .tview2');
        if (!moveList || moveList === observedMoveList) return;
        moveListObserver?.disconnect();
        observedMoveList = moveList;
        moveListObserver = new MutationObserver((mutations) => {
            if (mutations.some((mutation) => mutation.type === 'attributes' && /^(MOVE|U8)$/.test(mutation.target.tagName))) {
                setTimeout(updateActivePoint, 50);
            }
        });
        moveListObserver.observe(moveList, { attributes: true, attributeFilter: ['class'], subtree: true });
    }

    function syncWithDom(attempt = 0) {
        if (!state.data) return;
        const nodes = getMoveNodes();
        if (!nodes.length) {
            if (attempt < 12) setTimeout(() => syncWithDom(attempt + 1), 500);
            return;
        }
        nodes.forEach((node) => setMoveGlyph(node, null));
        getMainlineMoveNodes().forEach(({ node, index }) => {
            const move = state.data.moves[index];
            if (move && !Number.isFinite(move.evaluation)) {
                const domEvaluation = readDomEvaluation(node);
                if (Number.isFinite(domEvaluation)) {
                    move.evaluation = domEvaluation;
                    move.rawEvaluation = node.querySelector('eval, e')?.textContent.trim() || String(domEvaluation);
                }
            }
            setMoveGlyph(node, move?.type);
        });
        hideVisibleMetadata();
        if (!renderPanel(state.data) && attempt < 12) setTimeout(() => syncWithDom(attempt + 1), 500);
        setupBoardSync();
        updateActivePoint();
    }

    let actionsPerformed = false;
    function performInitialActions(attempt = 0) {
        const closeButton = document.querySelector('button.close-button[aria-label="Cerrar"]');
        if (closeButton) {
            closeButton.click();
        }

        const serverEvalTab = document.querySelector('button.serverEval');
        if (serverEvalTab) {
            if (!serverEvalTab.classList.contains('active')) {
                serverEvalTab.click();
            }
            actionsPerformed = true;
        } else if (attempt < 15) {
            setTimeout(() => performInitialActions(attempt + 1), 500);
        }
    }

    async function refresh() {
        const path = location.pathname;
        try {
            const url = `${location.origin}${path.replace(/\/$/, '')}.pgn`;
            const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/x-chess-pgn' } });
            if (!response.ok) throw new Error(`PGN no disponible (${response.status})`);
            state.path = path;
            state.data = parsePgn(await response.text());
            state.statCycles.clear();
            if (!state.data.moves.some((move) => move.type || Number.isFinite(move.evaluation))) {
                console.warn('[Análisis local] El PGN no contiene [%eval] ni [#TIPO#].');
            }
            syncWithDom();
            actionsPerformed = false;
            performInitialActions();
        } catch (error) {
            console.warn('[Análisis local] No se pudo cargar el PGN del estudio.', error);
        }
    }

    injectStyles();
    refresh();
    setInterval(() => {
        if (location.pathname !== state.path) refresh();
        else updateActivePoint();
    }, 800);
})();
