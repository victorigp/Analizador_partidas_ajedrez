// ==UserScript==
// @name         Analizador Ajedrez (Chess.com & Lichess)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Añade un botón flotante en Chess.com y automatiza el análisis en Lichess
// @author       Victor
// @match        *://*.chess.com/game/*
// @match        https://lichess.org/study/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const currentUrl = window.location.href;

    // --- LÓGICA PARA CHESS.COM ---
    if (currentUrl.includes('chess.com/game/')) {
        // 1. Crear el botón flotante
        const button = document.createElement('button');
        button.innerHTML = '🤖 Analizar con IA';
        button.style.position = 'fixed';
        button.style.bottom = '30px';
        button.style.right = '30px';
        button.style.padding = '15px 25px';
        button.style.fontSize = '16px';
        button.style.fontWeight = 'bold';
        button.style.color = '#fff';
        button.style.backgroundColor = '#7fa650'; // Verde estilo Chess.com
        button.style.border = 'none';
        button.style.borderRadius = '8px';
        button.style.boxShadow = '0 6px 12px rgba(0,0,0,0.4)';
        button.style.cursor = 'pointer';
        button.style.zIndex = '999999';
        button.style.transition = 'transform 0.2s, background-color 0.2s';

        // Efecto hover (cambia al pasar el ratón)
        button.onmouseover = function () {
            this.style.transform = 'scale(1.05)';
            this.style.backgroundColor = '#8bc453';
        };
        button.onmouseout = function () {
            this.style.transform = 'scale(1)';
            this.style.backgroundColor = '#7fa650';
        };

        // 2. Al hacer clic, lanza el protocolo personalizado
        button.onclick = function () {
            const gameUrl = window.location.href;
            window.location.href = "ajedrez://" + gameUrl;
        };

        // 3. Añadir el botón al cuerpo de la página
        document.body.appendChild(button);
    }

    // --- LÓGICA PARA LICHESS.ORG ---
    else if (currentUrl.includes('lichess.org/study/')) {

        function createOverlay() {
            if (document.getElementById('auto-analyzer-overlay')) return;
            const overlay = document.createElement('div');
            overlay.id = 'auto-analyzer-overlay';
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            overlay.style.color = 'white';
            overlay.style.display = 'flex';
            overlay.style.justifyContent = 'center';
            overlay.style.alignItems = 'center';
            overlay.style.fontSize = '24px';
            overlay.style.fontWeight = 'bold';
            overlay.style.zIndex = '9999999';
            overlay.innerText = 'Finalizando proceso, espere unos segundos por favor.';
            document.body.appendChild(overlay);
        }

        function removeOverlay() {
            const overlay = document.getElementById('auto-analyzer-overlay');
            if (overlay) overlay.remove();
        }

        // Si venimos de un reload tras terminar el analisis, activamos la pestaña
        if (sessionStorage.getItem('lichess_show_analysis') === '1') {
            sessionStorage.removeItem('lichess_show_analysis');
            createOverlay();

            function openAnalysisTab() {
                const serverEvalTab = document.querySelector('button.serverEval');
                if (serverEvalTab) {
                    if (!serverEvalTab.classList.contains('active')) {
                        serverEvalTab.click();
                    }

                    function checkReady() {
                        const loader = document.querySelector('#acpl-chart-container-loader');
                        const canvas = document.querySelector('canvas.study__server-eval-canvas');
                        if (canvas && !loader) {
                            removeOverlay();
                        } else {
                            setTimeout(checkReady, 500);
                        }
                    }
                    setTimeout(checkReady, 100);

                    return; // Terminado con exito
                }
                setTimeout(openAnalysisTab, 500);
            }
            setTimeout(openAnalysisTab, 1000);
            return;
        }

        // Comprobamos si la URL contiene nuestro parametro secreto
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.has('auto_analyze')) {
            return;
        }

        createOverlay();

        // Limpiamos la URL para que quede bonita
        urlParams.delete('auto_analyze');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newUrl);

        let analysisRequested = false;
        let loaderSeen = false;

        // Funcion recursiva para gestionar todo el ciclo de analisis
        function handleAnalysisCycle() {
            // 1. Cerrar modales (como el de "Nuevo capitulo") si existen
            const closeModals = document.querySelectorAll('.modal-close, button[data-icon="L"]');
            closeModals.forEach(btn => btn.click());

            // 2. Si todavia no hemos pulsado "Solicitar", lo buscamos
            if (!analysisRequested) {
                const serverEvalTab = document.querySelector('button.serverEval');
                if (serverEvalTab && !serverEvalTab.classList.contains('active')) {
                    serverEvalTab.click();
                }

                const requestBtn = Array.from(document.querySelectorAll('a.button')).find(a => a.textContent.includes('Solicitar un análisis'));

                if (requestBtn) {
                    requestBtn.click();
                    analysisRequested = true;
                } else if (document.querySelector('#acpl-chart-container-loader')) {
                    // Si por alguna razon ya esta el loader cargando, marcamos como solicitado
                    analysisRequested = true;
                }
            }

            // 3. Vigilar el progreso del analisis
            if (analysisRequested) {
                const loader = document.querySelector('#acpl-chart-container-loader');
                const analysisDone = document.querySelector('count.data-count[data-count="✓"]');

                if (loader && !loaderSeen) {
                    loaderSeen = true;
                }

                // Lichess añade un "check" (✓) al boton cuando el analisis termina. 
                // Esta es la forma 100% segura de saber que ha terminado.
                if (analysisDone) {
                    sessionStorage.setItem('lichess_show_analysis', '1');
                    window.location.href = window.location.href; // Forzamos recarga
                    return;
                }
            }

            // Bucle continuo cada 500ms
            setTimeout(handleAnalysisCycle, 500);
        }

        // Iniciamos el chequeo despues de un par de segundos para dejar que los WebSockets conecten
        setTimeout(handleAnalysisCycle, 2000);
    }
})();
