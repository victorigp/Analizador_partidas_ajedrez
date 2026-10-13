// Sincronización del DOM de Lichess, observador de movimientos y actualización de paneles

import { state, runtime } from './state.js';
import { parsePgn } from './parsers.js';
import {
    getMoveNodes,
    getMainlineMoveNodes,
    readDomEvaluation,
    hideVisibleMetadata,
    setMoveGlyph,
    setAfterMoveActivated
} from './moveUtils.js';
import { createChart } from './chart.js';
import { createSummary } from './summary.js';
import { syncBoardGlyph } from './boardGlyph.js';

// Conectar callback para cuando se activa una jugada
setAfterMoveActivated(() => {
    updateActivePoint();
    syncBoardGlyph();
});

export function renderPanel(data) {
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

export function updateActivePoint() {
    const activeIndex = getMainlineMoveNodes().find((item) => item.node.classList.contains('active') || item.node.classList.contains('a'))?.index;
    document.querySelectorAll('.local-analysis-point').forEach((point) => {
        point.classList.toggle('is-active', Number(point.dataset.moveIndex) === activeIndex);
    });
    syncBoardGlyph();
}

export function setupBoardSync() {
    const moveList = document.querySelector('.analyse__moves, .study__moves, .gamebook, rmoves, l4x, .tview2');
    if (!moveList || moveList === runtime.observedMoveList) return;
    runtime.moveListObserver?.disconnect();
    runtime.observedMoveList = moveList;
    runtime.moveListObserver = new MutationObserver((mutations) => {
        const hasNativeGlyph = mutations.some((mutation) => {
            if (mutation.type !== 'childList') return false;
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches('glyph:not(.custom-move-glyph)')) return true;
                if (node.querySelector('glyph:not(.custom-move-glyph)')) return true;
            }
            return false;
        });
        if (hasNativeGlyph) {
            clearTimeout(runtime.moveListSyncTimer);
            runtime.moveListSyncTimer = setTimeout(() => syncWithDom(), 0);
            return;
        }
        const hasNewNodes = mutations.some((mutation) => {
            if (mutation.type === 'childList') {
                return [...mutation.addedNodes].some((node) => {
                    if (node.nodeType !== 1) return false;
                    return node.matches('move, u8, node')
                        || Boolean(node.querySelector('move, u8'));
                });
            }
            return false;
        });
        if (hasNewNodes) {
            clearTimeout(runtime.moveListSyncTimer);
            runtime.moveListSyncTimer = setTimeout(() => syncWithDom(), 50);
            return;
        }
        if (mutations.some((mutation) => mutation.type === 'attributes' && /^(MOVE|U8|NODE)$/i.test(mutation.target.tagName))) {
            setTimeout(updateActivePoint, 40);
        }
    });
    runtime.moveListObserver.observe(moveList, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
}

export function syncWithDom(attempt = 0) {
    if (!state.data) return;
    const nodes = getMoveNodes();
    if (!nodes.length) {
        if (attempt < 12) setTimeout(() => syncWithDom(attempt + 1), 500);
        return;
    }
    const mainlineMoves = getMainlineMoveNodes();
    const mainlineMap = new Map();
    mainlineMoves.forEach(({ node, index }) => mainlineMap.set(node, index));

    nodes.forEach((node) => {
        const index = mainlineMap.get(node);
        if (index !== undefined) {
            const move = state.data.moves[index];
            if (move && !Number.isFinite(move.evaluation)) {
                const domEvaluation = readDomEvaluation(node);
                if (Number.isFinite(domEvaluation)) {
                    move.evaluation = domEvaluation;
                    move.rawEvaluation = node.querySelector('eval, e')?.textContent.trim() || String(domEvaluation);
                }
            }
            setMoveGlyph(node, move?.type);
        } else {
            setMoveGlyph(node, null);
        }
    });
    hideVisibleMetadata();
    if (!renderPanel(state.data) && attempt < 12) setTimeout(() => syncWithDom(attempt + 1), 500);
    setupBoardSync();
    updateActivePoint();
}

export function performInitialActions(onDone) {
    const closeButton = document.querySelector('button.close-button[aria-label="Cerrar"]');
    if (closeButton) {
        closeButton.click();
    }

    const serverEvalTab = document.querySelector('button.serverEval');
    if (serverEvalTab) {
        if (!serverEvalTab.classList.contains('active')) {
            serverEvalTab.click();
            runtime.actionsPerformed = true;
            setTimeout(() => {
                if (onDone) onDone();
            }, 150);
            return;
        }
        runtime.actionsPerformed = true;
        if (onDone) onDone();
    } else {
        if (onDone) onDone();
    }
}

export async function refresh() {
    const path = location.pathname;
    try {
        const url = `${location.origin}${path.replace(/\/$/, '')}.pgn`;
        const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/x-chess-pgn' } });
        if (!response.ok) throw new Error(`PGN no disponible (${response.status})`);
        state.path = path;
        state.data = parsePgn(await response.text());
        state.statCycles.clear();
        runtime.actionsPerformed = false;
        performInitialActions(() => {
            syncWithDom();
        });
    } catch (error) {
        // Ignorar error al cargar PGN del estudio
    }
}
