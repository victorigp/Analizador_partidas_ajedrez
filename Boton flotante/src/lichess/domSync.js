// Sincronización del DOM de Lichess, observador de movimientos y actualización de paneles

import { state, runtime } from './state.js';
import { parsePgn, hasLocalAnalysis } from './parsers.js';
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

function getServerEvalContainer() {
    const container = document.querySelector('.analyse__underboard .study__analysis, .analyse__underboard .study__server-eval, .study__analysis, .study__server-eval');
    if (container) return container;
    const legacy = document.querySelector('.study__message');
    if (!legacy || legacy.closest('.study__glyphs, .study__comments')) return null;
    const serverEvalTab = document.querySelector('button.serverEval');
    if (serverEvalTab && !serverEvalTab.classList.contains('active')) return null;
    return legacy;
}

function cleanupLocalAnalysisUi() {
    document.body?.classList.remove('has-local-stockfish-analysis');
    document.getElementById('local-analysis-chart-panel')?.remove();
    document.getElementById('local-analysis-status')?.remove();
    document.getElementById('local-analysis-summary-panel')?.remove();
    document.querySelectorAll('.local-board-glyph').forEach((el) => el.remove());
    document.querySelectorAll('.local-analysis-host').forEach((el) => el.classList.remove('local-analysis-host'));
    document.querySelectorAll('.local-analysis-training-host').forEach((el) => el.classList.remove('local-analysis-training-host'));
    getMoveNodes().forEach((node) => setMoveGlyph(node, null));
    document.querySelectorAll('.local-analysis-native-hidden').forEach((glyph) => {
        glyph.style.removeProperty('display');
        glyph.classList.remove('local-analysis-native-hidden');
    });
}

function renderSummaryPanel(data, fallbackContainer = null) {
    const training = document.querySelector('.analyse__round-training');
    let summaryPanel = document.getElementById('local-analysis-summary-panel');
    if (!summaryPanel) {
        summaryPanel = document.createElement('section');
        summaryPanel.id = 'local-analysis-summary-panel';
    }
    summaryPanel.replaceChildren(createSummary(data));
    if (training) {
        training.classList.add('local-analysis-training-host');
        training.appendChild(summaryPanel);
    } else if (fallbackContainer) {
        fallbackContainer.appendChild(summaryPanel);
    }
}

export function renderPanel(data) {
    if (!hasLocalAnalysis(data)) {
        cleanupLocalAnalysisUi();
        return false;
    }
    document.body?.classList.add('has-local-stockfish-analysis');
    renderSummaryPanel(data);

    const container = getServerEvalContainer();
    if (!container) return false;
    container.classList.add('local-analysis-host');

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
    status.innerHTML = '<br>Esta partida ya está analizada localmente con STOCKFISH.<br>No hace falta solicitar el análisis del ordenador indicado debajo.<br>';

    container.prepend(chartPanel);
    chartPanel.insertAdjacentElement('afterend', status);

    renderSummaryPanel(data, chartPanel);
    return true;
}

export function updateActivePoint() {
    if (!state.data || !hasLocalAnalysis(state.data)) return;
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
    if (!hasLocalAnalysis(state.data)) {
        cleanupLocalAnalysisUi();
        return;
    }
    document.body?.classList.add('has-local-stockfish-analysis');
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
    setupTabSync();
    updateActivePoint();
}

export function setupTabSync() {
    const checkAndRender = () => {
        if (!state.data || !hasLocalAnalysis(state.data)) return;
        const container = getServerEvalContainer();
        if (container && !container.querySelector('#local-analysis-chart-panel')) {
            renderPanel(state.data);
            updateActivePoint();
        } else if (document.querySelector('.analyse__round-training') && !document.getElementById('local-analysis-summary-panel')) {
            renderSummaryPanel(state.data);
        }
    };

    if (!runtime.tabClickListenerAttached && typeof document !== 'undefined') {
        runtime.tabClickListenerAttached = true;
        document.addEventListener('click', (e) => {
            if (e.target.closest('button.serverEval')) {
                setTimeout(checkAndRender, 50);
                setTimeout(checkAndRender, 150);
            }
        });
    }

    const underboard = document.querySelector('.analyse__underboard, .study__underboard')
        || getServerEvalContainer()?.parentElement
        || document.querySelector('.analyse');
    if (!underboard || underboard === runtime.observedUnderboard) return;
    runtime.underboardObserver?.disconnect();
    runtime.observedUnderboard = underboard;
    runtime.underboardObserver = new MutationObserver(checkAndRender);
    runtime.underboardObserver.observe(underboard, { childList: true, subtree: true });
}

export function performInitialActions(onDone, attempt = 0) {
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
    } else if (attempt < 15) {
        setTimeout(() => performInitialActions(onDone, attempt + 1), 150);
    } else {
        if (onDone) onDone();
    }
}

export async function refresh() {
    const path = location.pathname;
    const cleanPath = path.replace(/\/$/, '');
    const segments = cleanPath.split('/').filter(Boolean);
    const activeChapterId = document.querySelector('.study__chapters .active[data-id]')?.getAttribute('data-id');
    const pgnPath = (segments.length === 2 && segments[0] === 'study' && activeChapterId)
        ? `/study/${segments[1]}/${activeChapterId}`
        : cleanPath;
    state.path = path;
    try {
        const url = `${location.origin}${pgnPath}.pgn`;
        const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/x-chess-pgn' } });
        if (!response.ok) throw new Error(`PGN no disponible (${response.status})`);
        state.data = parsePgn(await response.text());
        state.statCycles.clear();
        runtime.actionsPerformed = false;
        if (!hasLocalAnalysis(state.data)) {
            cleanupLocalAnalysisUi();
            return;
        }
        performInitialActions(() => {
            syncWithDom();
        });
    } catch (error) {
        state.path = '';
    }
}
