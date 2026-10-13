// Funciones de ayuda generales y estilos reutilizables

export const inputStyle = `
    width: 100%; box-sizing: border-box; padding: 10px; margin-top: 5px;
    background-color: #121110; border: 1px solid #403d39; color: #fff;
    border-radius: 5px; font-size: 14px; outline: none;
`;

export function getServerPort(fallback = '8765') {
    if (typeof document !== 'undefined') {
        const portEl = document.getElementById('modal-port');
        if (portEl && portEl.value && portEl.value.trim()) {
            return portEl.value.trim();
        }
    }
    return String(fallback).trim();
}
