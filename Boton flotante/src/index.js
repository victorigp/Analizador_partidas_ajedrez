// Punto de entrada principal para Chess.com y Lichess

import { createFloatingButton } from './chesscom/button.js';
import { setLichessCookie } from './utils/storage.js';
import { injectStyles } from './lichess/styles.js';
import { state } from './lichess/state.js';
import { refresh, updateActivePoint } from './lichess/domSync.js';

function init() {
    const currentUrl = window.location.href;

    // Inicializar botón en Chess.com si corresponde
    createFloatingButton();

    // Comprobar si estamos en Lichess Study
    if (!currentUrl.includes('lichess.org/study/')) return;

    // Recuperar LICHESS_COOKIE si viene del script de extracción (main.py -> crear_estudio.py)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('agy_cookie')) {
        try {
            const decodedCookie = decodeURIComponent(escape(atob(urlParams.get('agy_cookie'))));
            setLichessCookie(decodedCookie);

            // Limpiar la URL para que no quede colgando el parámetro en base64
            const newUrl = window.location.href.split('?')[0];
            window.history.replaceState({}, document.title, newUrl);
        } catch (e) {
            // Ignorar error al procesar agy_cookie
        }
    }

    // Inyectar estilos CSS e inicializar análisis local en Lichess
    injectStyles();
    refresh();

    setInterval(() => {
        if (location.pathname !== state.path) {
            refresh();
        } else {
            updateActivePoint();
        }
    }, 800);
}

init();
