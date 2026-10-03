// ==UserScript==
// @name         Lichess Auto Analyzer
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automatiza el clic de "Solicitar analisis" en Lichess cuando la URL incluye ?auto_analyze=1
// @author       Antigravity
// @match        https://lichess.org/study/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Si venimos de un reload tras terminar el analisis, activamos la pestaña
    if (sessionStorage.getItem('lichess_show_analysis') === '1') {
        sessionStorage.removeItem('lichess_show_analysis');
        console.log("[AutoAnalyzer] Recarga completada. Abriendo la pestaña de analisis...");
        
        function openAnalysisTab() {
            const serverEvalTab = document.querySelector('button.serverEval');
            if (serverEvalTab) {
                if (!serverEvalTab.classList.contains('active')) {
                    serverEvalTab.click();
                }
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

    console.log("[AutoAnalyzer] Detectado ?auto_analyze=1. Esperando a que cargue la interfaz...");

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
                console.log("[AutoAnalyzer] Boton de solicitar analisis encontrado! Pulsando...");
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
                console.log("[AutoAnalyzer] Loader detectado. El analisis esta en progreso...");
                loaderSeen = true;
            }
            
            // Lichess añade un "check" (✓) al boton cuando el analisis termina. 
            // Esta es la forma 100% segura de saber que ha terminado.
            if (analysisDone) {
                console.log("[AutoAnalyzer] Marca de analisis terminado (✓) detectada! Recargando la pagina...");
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

})();
