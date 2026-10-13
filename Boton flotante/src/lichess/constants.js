// Constantes de clasificaciones de jugadas y namespaces

export const MOVE_TYPES = {
    BRILLIANT: { label: 'Brillante', symbol: '!!', color: '#26c2a3' },
    GREAT: { label: 'Genial', symbol: '!', color: '#749bbf' },
    BOOK: { label: 'Libro', symbol: '', color: '#d5a47d' },
    BEST: { label: 'Mejor', symbol: '★', color: '#81b64c' },
    EXCELLENT: { label: 'Excelente', symbol: '👍', color: '#84a956' },
    GOOD: { label: 'Bueno', symbol: '✓', color: '#95b776' },
    INACCURACY: { label: 'Imprecisión', symbol: '?!', color: '#f7c631' },
    MISTAKE: { label: 'Error', symbol: '?', color: '#ffa459' },
    MISS: { label: 'Omisión', symbol: '✕', color: '#ff7769' },
    BLUNDER: { label: 'Error grave', symbol: '??', color: '#fa412d' },
};

export const TYPE_ORDER = Object.keys(MOVE_TYPES);
export const SVG_NS = 'http://www.w3.org/2000/svg';
