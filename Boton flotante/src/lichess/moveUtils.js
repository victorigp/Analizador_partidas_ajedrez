// Utilidades para selección, navegación y marcaje de nodos de movimientos en Lichess

import { MOVE_TYPES } from './constants.js';
import { state } from './state.js';
import { parseEval } from './parsers.js';
import { getMoveTypeIconHtml } from './icons.js';

let afterMoveActivated = null;

export function setAfterMoveActivated(callback) {
    afterMoveActivated = callback;
}

export function getMoveNodes() {
    const selectors = [
        '.analyse__moves move:not(.empty)', '.analyse__moves u8:not(.empty)',
        '.study__moves move:not(.empty)', '.study__moves u8:not(.empty)',
        '.gamebook move:not(.empty)', '.gamebook u8:not(.empty)',
        '.tview2 move:not(.empty)', '.tview2 u8:not(.empty)',
        'rmoves move:not(.empty)', 'rmoves u8:not(.empty)',
        'l4x move:not(.empty)', 'l4x u8:not(.empty)',
    ];
    return [...new Set([...document.querySelectorAll(selectors.join(','))])];
}

export function normalizeSan(san) {
    return (san || '').replace(/\s/g, '').replace(/[!?]+$/g, '');
}

export function getMainlineMoveNodes() {
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

export function readDomEvaluation(node) {
    const evaluationNode = node.querySelector('eval, e');
    if (!evaluationNode) return null;
    return parseEval(evaluationNode.textContent.trim());
}

export function hideVisibleMetadata() {
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

    const moveList = document.querySelector('.analyse__moves, .study__moves, .gamebook, rmoves, l4x, .tview2, .analyse') || document.body;
    if (moveList) {
        const walker = document.createTreeWalker(moveList, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.nodeValue && node.nodeValue.includes('WhiteEloAccuracy:')) {
                node.nodeValue = node.nodeValue.replace(/,?\s*WhiteEloAccuracy:[^•\n\r]*?(?=\s*(?:•|$))/i, '');
            }
        }
    }
}

export function setMoveGlyph(node, type) {
    node.querySelectorAll('.custom-move-glyph').forEach((glyph) => glyph.remove());
    node.querySelectorAll('glyph:not(.custom-move-glyph)').forEach((glyph) => {
        glyph.style.display = 'none';
        glyph.classList.add('local-analysis-native-hidden');
    });
    const currentCustom = node.querySelector('.custom-move-glyph');
    if (!type || !MOVE_TYPES[type]) {
        if (currentCustom) currentCustom.remove();
        node.removeAttribute('data-local-analysis-type');
        node.style.removeProperty('--local-move-color');
        return;
    }
    if (currentCustom && currentCustom.dataset.glyphType === type.toLowerCase()) {
        return;
    }
    if (currentCustom) currentCustom.remove();
    const definition = MOVE_TYPES[type];
    const glyph = document.createElement('glyph');
    glyph.className = 'custom-move-glyph';
    glyph.dataset.glyphType = type.toLowerCase();
    glyph.dataset.color = definition.color;
    glyph.title = definition.label;
    node.style.setProperty('--local-move-color', definition.color);
    glyph.innerHTML = getMoveTypeIconHtml(type);
    const moveText = node.querySelector('san, kw') || node;
    moveText.insertAdjacentElement('afterend', glyph);
    node.dataset.localAnalysisType = type.toLowerCase();
}

export function activateMove(index) {
    const node = getMainlineMoveNodes().find((item) => item.index === index)?.node;
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try {
        node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    } catch (_) { }
    node.click();
    setTimeout(() => {
        if (afterMoveActivated) {
            afterMoveActivated();
        }
    }, 80);
}
