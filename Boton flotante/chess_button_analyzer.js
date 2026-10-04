// ==UserScript==
// @name         Analizador Local Chess.com
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Añade un botón flotante para analizar la partida actual con tu IA local.
// @author       victorigp
// @match        *://*.chess.com/game/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

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
    button.onmouseover = function() {
        this.style.transform = 'scale(1.05)';
        this.style.backgroundColor = '#8bc453';
    };
    button.onmouseout = function() {
        this.style.transform = 'scale(1)';
        this.style.backgroundColor = '#7fa650';
    };

    // 2. Al hacer clic, lanza el protocolo personalizado
    button.onclick = function() {
        // Obtenemos la URL de la partida actual
        const gameUrl = window.location.href;
        
        // Redirigimos usando nuestro protocolo mágico registrado en Windows
        // Esto le dirá a Windows: "Abre EJECUTAR.bat y pásale esto"
        window.location.href = "ajedrez://" + gameUrl;
    };

    // 3. Añadir el botón al cuerpo de la página
    document.body.appendChild(button);
})();
