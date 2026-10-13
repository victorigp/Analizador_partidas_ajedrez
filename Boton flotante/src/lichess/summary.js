// Panel de resumen de precisión y estadísticas de jugadas

import { TYPE_ORDER, MOVE_TYPES } from './constants.js';
import { state } from './state.js';
import { createMoveTypeBadge } from './icons.js';
import { activateMove } from './moveUtils.js';

export function activateCategory(sideIndex, type) {
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

export function createSummary(data) {
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
            Object.assign(row.style, {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                margin: '4px 0',
                cursor: 'pointer',
                padding: '2px 0'
            });
            row.className = 'local-analysis-count';
            row.title = 'Haz clic para ir a esta jugada';

            const labelContainer = document.createElement('div');
            Object.assign(labelContainer.style, {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flex: 1
            });

            const label = document.createElement('span');
            label.className = 'stat-label';
            label.textContent = MOVE_TYPES[type].label;
            label.style.minWidth = '120px';

            const value = document.createElement('span');
            value.className = 'stat-count';
            value.style.color = MOVE_TYPES[type].color;
            value.textContent = String(count);

            labelContainer.append(label, value);

            const badge = createMoveTypeBadge(type, '20px');
            row.append(labelContainer, badge);
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
