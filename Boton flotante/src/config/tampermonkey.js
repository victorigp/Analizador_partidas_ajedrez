// Metadata de UserScript para TamperMonkey
export const tampermonkeyHeader = `// ==UserScript==
// @name         Analizador Ajedrez (Chess.com y Lichess)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Inicia el análisis desde Chess.com y muestra el análisis local en Lichess.
// @author       Victor
// @match        *://*.chess.com/game/*
// @match        *://*.chess.com/games/*
// @match        *://*.chess.com/analysis/*
// @match        *://*.chess.com/live/*
// @match        *://*.chess.com/play/*
// @match        https://lichess.org/study/*
// @connect      127.0.0.1
// @connect      localhost
// @connect      *
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/victorigp/Analizador_partidas_ajedrez/master/Boton%20flotante/dist/chess_button_analyzer.js
// @downloadURL  https://raw.githubusercontent.com/victorigp/Analizador_partidas_ajedrez/master/Boton%20flotante/dist/chess_button_analyzer.js
// ==/UserScript==`;
