// Generador del gráfico SVG de evaluación de la partida

import { SVG_NS, MOVE_TYPES } from './constants.js';
import { activateMove } from './moveUtils.js';

export function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
}

export function createChart(moves) {
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
