// ==UserScript==
// @name         Analizador Ajedrez (Chess.com y Lichess)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Inicia el análisis desde Chess.com y muestra el análisis local en Lichess.
// @author       Victor
// @match        *://*.chess.com/game/*
// @match        https://lichess.org/study/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    const currentUrl = window.location.href;

    // Se añade el acceso al programa local desde una partida de Chess.com.
    if (currentUrl.includes('chess.com/game/')) {
        const button = document.createElement('button');
        button.textContent = '🤖 Analizar con IA';
        Object.assign(button.style, {
            position: 'fixed', bottom: '30px', right: '30px', padding: '15px 25px',
            fontSize: '16px', fontWeight: 'bold', color: '#fff', backgroundColor: '#7fa650',
            border: 'none', borderRadius: '8px', boxShadow: '0 6px 12px rgba(0,0,0,0.4)',
            cursor: 'pointer', zIndex: '999999', transition: 'transform .2s, background-color .2s',
        });
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.05)';
            button.style.backgroundColor = '#8bc453';
        });
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
            button.style.backgroundColor = '#7fa650';
        });

        button.addEventListener('click', () => {
            if (document.getElementById('agy-analysis-modal')) return;

            // Load saved settings or defaults
            const getSaved = (key, def) => {
                const val = localStorage.getItem('agy_' + key);
                return val !== null ? val : def;
            };

            // Find current game players and try to guess White
            const players = new Set();
            document.querySelectorAll('[data-test-element="user-tagline-username"], .user-username-component').forEach(el => {
                if (el.textContent.trim()) players.add(el.textContent.trim());
            });
            const playerArray = Array.from(players);

            // Heuristic to find white: bottom player is usually white unless flipped, but let's just default to the first player if unsure
            let whitePlayer = playerArray.length > 0 ? playerArray[0] : '';
            const bottomPlayerEl = document.querySelector('.board-layout-bottom [data-test-element="user-tagline-username"], .board-layout-bottom .user-username-component');
            if (bottomPlayerEl && bottomPlayerEl.textContent.trim()) {
                whitePlayer = bottomPlayerEl.textContent.trim();
            }
            const blackPlayer = playerArray.find(p => p !== whitePlayer) || '';

            let p_player = getSaved('chesscom_player', '');
            let p_depth = getSaved('stockfish_depth', '18');
            let p_model = getSaved('gemini_model', 'gemini-flash-lite-latest');
            let p_threads = getSaved('stockfish_threads', '1');
            let p_hash = getSaved('stockfish_hash', '512');

            // Secret fields
            let lichess_username = getSaved('lichess_username', '');
            let lichess_password = getSaved('lichess_password', '');
            let lichess_token = getSaved('lichess_token', '');

            let lichess_cookie = '';
            if (typeof GM_getValue !== 'undefined') {
                lichess_cookie = GM_getValue('agy_lichess_cookie', getSaved('lichess_cookie', ''));
            } else {
                lichess_cookie = getSaved('lichess_cookie', '');
            }

            let gemini_keys = [];
            for (let i = 0; i <= 10; i++) {
                let keyName = i === 0 ? 'gemini_api_key' : `gemini_api_key_${i}`;
                let keyVal = getSaved(keyName, '');
                if (keyVal) gemini_keys.push(keyVal);
            }
            if (gemini_keys.length === 0) gemini_keys.push(''); // ensure at least one input

            let defaultTarget = whitePlayer;
            if (p_player && playerArray.includes(p_player)) {
                defaultTarget = p_player;
            }

            // Create Modal Overlay
            const overlay = document.createElement('div');
            overlay.id = 'agy-analysis-modal';
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
                backgroundColor: 'rgba(0,0,0,0.6)', zIndex: '9999999',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Helvetica, Arial, sans-serif'
            });

            const styleNode = document.createElement('style');
            styleNode.textContent = `
                #agy-analysis-modal * { scrollbar-color: #bababa #262421 !important; scrollbar-width: thin !important; }
                #agy-analysis-modal ::-webkit-scrollbar { width: 8px !important; height: 8px !important; }
                #agy-analysis-modal ::-webkit-scrollbar-track { background: #262421 !important; }
                #agy-analysis-modal ::-webkit-scrollbar-thumb { background: #bababa !important; border-radius: 4px !important; }
                #agy-analysis-modal ::-webkit-scrollbar-thumb:hover { background: #fff !important; }
            `;
            overlay.appendChild(styleNode);

            const modal = document.createElement('div');
            Object.assign(modal.style, {
                backgroundColor: '#262421', color: '#bababa', borderRadius: '10px',
                width: '450px', maxHeight: '90vh', boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                position: 'relative', overflow: 'hidden', display: 'flex'
            });

            const closeBtn = document.createElement('div');
            closeBtn.innerHTML = '✖';
            Object.assign(closeBtn.style, {
                position: 'absolute', top: '15px', right: '15px', cursor: 'pointer',
                fontSize: '18px', color: '#888', transition: 'color 0.2s', zIndex: '20'
            });
            closeBtn.onmouseenter = () => closeBtn.style.color = '#fff';
            closeBtn.onmouseleave = () => closeBtn.style.color = '#888';
            closeBtn.onclick = () => {
                overlay.remove();
                fetch('http://localhost:8765/exit', { method: 'POST' }).catch(() => { });
            };

            const inputStyle = `
                width: 100%; box-sizing: border-box; padding: 10px; margin-top: 5px;
                background-color: #121110; border: 1px solid #403d39; color: #fff;
                border-radius: 5px; font-size: 14px; outline: none;
            `;

            // ----- Main View -----
            const mainView = document.createElement('div');
            Object.assign(mainView.style, {
                padding: '30px', transition: 'transform 0.3s ease', width: '100%',
                flexShrink: 0, overflowY: 'auto'
            });

            mainView.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 25px; gap: 10px;">
                    <span style="font-size: 40px;">🤖</span>
                    <h2 style="margin: 0; color: #fff; font-size: 28px;">Analizar partida con IA</h2>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="font-weight: bold; color: #fff;">Jugador Objetivo:</label>
                    <select id="modal-target" style="${inputStyle}">
                        ${playerArray.map(p => `<option value="${p}" ${p === defaultTarget ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </div>
                <div style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between;">
                        <label style="font-weight: bold; color: #fff;">Profundidad de Stockfish:</label>
                        <span id="modal-depth-val" style="color: #fff; font-weight: bold;">${p_depth}</span>
                    </div>
                    <input type="range" id="modal-depth" min="1" max="30" value="${p_depth}" style="width: 100%; margin-top: 10px; cursor: pointer;">
                </div>
                <div style="margin-bottom: 30px;">
                    <label style="font-weight: bold; color: #fff;">Modelo de IA:</label>
                    <div style="display: flex; align-items: center; margin-top: 5px;">
                        <select id="modal-model" style="${inputStyle} margin-top: 0; flex: 1;">
                            <option value="">Configura la GEMINI_API_KEY</option>
                        </select>
                        <div id="modal-model-status" style="margin-left: 10px; width: 24px; display: flex; justify-content: center; align-items: center; font-size: 18px;" title="Estado del modelo"></div>
                    </div>
                </div>
                <div style="display: flex; justify-content: center; align-items: center; position: relative; margin-top: 20px;">
                    <button id="modal-start" style="background-color: #81b64c; color: #fff; border: none; padding: 12px 32px; border-radius: 6px; font-weight: bold; font-size: 16px; cursor: pointer; transition: background-color 0.2s, transform 0.1s; box-shadow: 0 4px 0 #5a8231;">
                        INICIAR
                    </button>
                    <div id="modal-gear" style="cursor: pointer; padding: 5px; position: absolute; right: 0;" title="Configuración">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#bababa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                    </div>
                </div>
            `;

            // ----- Settings View -----
            const settingsView = document.createElement('div');
            Object.assign(settingsView.style, {
                padding: '30px 0 0 30px', position: 'absolute', top: '0', left: '100%',
                width: '100%', height: '100%', boxSizing: 'border-box',
                backgroundColor: '#262421', transition: 'left 0.3s ease',
                display: 'flex', flexDirection: 'column', overflow: 'hidden'
            });

            // Helper to generate secret inputs with eye toggles
            const eyeOpenSvg = `<svg class="eye-open" style="display:none;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
            const eyeClosedSvg = `<svg class="eye-closed" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

            const makeSecretInput = (id, label, value) => `
                <div style="margin-bottom: 15px; position: relative;">
                    <label style="font-weight: bold; color: #fff;">${label}:</label>
                    <div style="display: flex; align-items: center; margin-top: 5px;">
                        <div style="position: relative; flex: 1;">
                            <input type="password" id="${id}" value="${value}" style="${inputStyle} padding-right: 35px; margin-top: 0; box-sizing: border-box;">
                            <div class="toggle-eye" data-target="${id}" style="position: absolute; right: 10px; top: 10px; cursor: pointer; color: #bababa; display: flex; align-items: center;">
                                ${eyeOpenSvg}
                                ${eyeClosedSvg}
                            </div>
                        </div>
                        <button type="button" class="info-btn" data-info="${id}" style="margin-left: 10px; margin-bottom: 3px; background-color: #3b82f6; color: #fff; border: none; border-radius: 4px; width: 33px; height: 33px; padding-bottom: 4px; box-sizing: border-box; cursor: pointer; transition: background-color 0.2s, transform 0.1s; box-shadow: 0 4px 0 #2563eb; font-weight: bold; font-size: 18px; font-family: serif; font-style: italic; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">i</button>
                    </div>
                </div>
            `;

            settingsView.innerHTML = `
                <div style="display: flex; align-items: center; margin-bottom: 20px; padding-right: 30px; flex-shrink: 0;">
                    <div id="modal-back" style="cursor: pointer; margin-right: 15px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#bababa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12"></line>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                    </div>
                    <h3 style="margin: 0; color: #fff;">Configuración Base</h3>
                </div>
                
                <div style="flex: 1; overflow-y: auto; padding-right: 20px; padding-bottom: 30px;">
                    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                        <div style="flex: 1;">
                            <label style="font-weight: bold; color: #fff;">Hilos Stockfish:</label>
                            <input type="number" id="modal-threads" min="1" max="128" value="${p_threads}" style="${inputStyle}">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-weight: bold; color: #fff;">Hash (MB):</label>
                            <input type="number" id="modal-hash" min="16" max="32768" value="${p_hash}" style="${inputStyle}">
                        </div>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="font-weight: bold; color: #fff;">Jugador Chess.com (defecto):</label>
                        <input type="text" id="modal-player" value="${p_player}" style="${inputStyle}">
                    </div>
                    ${makeSecretInput('modal-lichess-token', 'Token de Lichess', lichess_token)}
                    ${makeSecretInput('modal-lichess-cookie', 'Cookie de Lichess', lichess_cookie)}
                    
                    <div id="gemini-keys-container">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <label style="font-weight: bold; color: #fff;">GEMINI_API_KEY(s):</label>
                        </div>
                        ${gemini_keys.map((k, i) => `
                            <div style="margin-top: 5px; display: flex; align-items: center;" class="gemini-key-row">
                                <div style="position: relative; flex: 1; display: flex; align-items: center;">
                                    <input type="password" value="${k}" style="${inputStyle} padding-right: 35px; width: 100%; margin-top: 0; box-sizing: border-box;">
                                    <div class="toggle-eye" style="position: absolute; right: 10px; cursor: pointer; color: #bababa; display: flex; align-items: center;">
                                        ${eyeOpenSvg}
                                        ${eyeClosedSvg}
                                    </div>
                                </div>
                                ${i === 0 ? `<button id="add-gemini-btn" style="margin-left: 10px; margin-bottom: 3px; background-color: #81b64c; color: #fff; border: none; border-radius: 4px; width: 33px; height: 33px; padding-bottom: 4px; box-sizing: border-box; cursor: pointer; transition: background-color 0.2s, transform 0.1s; box-shadow: 0 4px 0 #5a8231; font-weight: bold; font-size: 22px; line-height: 1; display: flex; align-items: center; justify-content: center; ${gemini_keys.length >= 10 ? 'opacity: 0.5; cursor: not-allowed;' : ''}" ${gemini_keys.length >= 10 ? 'disabled' : ''}>+</button>`
                    : `<button class="remove-gemini-btn" style="margin-left: 10px; margin-bottom: 3px; background-color: #d8504f; color: #fff; border: none; border-radius: 4px; width: 33px; height: 33px; padding-bottom: 4px; box-sizing: border-box; cursor: pointer; transition: background-color 0.2s, transform 0.1s; box-shadow: 0 4px 0 #a93c3b; font-weight: bold; font-size: 24px; line-height: 1; display: flex; align-items: center; justify-content: center;">-</button>`}
                            </div>
                        `).join('')}
                    </div>
    
                    <div style="display: flex; justify-content: center; gap: 15px; align-items: center; margin-top: 30px;">
                        <button id="modal-save" style="background-color: #81b64c; color: #fff; border: none; padding: 12px 32px; border-radius: 6px; font-weight: bold; font-size: 16px; cursor: pointer; transition: background-color 0.2s, transform 0.1s; box-shadow: 0 4px 0 #5a8231;">
                            GUARDAR
                        </button>
                        <button id="modal-clear" style="background-color: #d8504f; color: #fff; border: none; padding: 12px 32px; border-radius: 6px; font-weight: bold; font-size: 16px; cursor: pointer; transition: background-color 0.2s, transform 0.1s; box-shadow: 0 4px 0 #a93c3b;">
                            LIMPIAR
                        </button>
                    </div>
                </div>
            `;

            // ----- Progress View -----
            const progressView = document.createElement('div');
            Object.assign(progressView.style, {
                padding: '30px', position: 'absolute', top: '0', left: '100%',
                width: '100%', height: '100%', boxSizing: 'border-box',
                backgroundColor: '#262421', transition: 'left 0.3s ease',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
            });

            progressView.innerHTML = `
                <div style="text-align: center; margin-bottom: 25px;">
                    <span style="font-size: 40px; display: inline-block; animation: float 3s ease-in-out infinite;">🤖</span>
                    <h2 style="margin: 10px 0 0; color: #fff; font-size: 24px;">Analizando partida con IA</h2>
                </div>
                
                <div id="progress-spinner-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 20px;">
                    <div class="loader" style="width: 40px; height: 40px; border: 4px solid rgba(255, 255, 255, 0.1); border-left-color: #81b64c; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 15px;"></div>
                    <div id="progress-text" style="color: #bababa; font-size: 16px; font-weight: bold; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">Iniciando proceso local...</div>
                    <div id="progress-subtext" style="color: #888; font-size: 14px; margin-top: 5px; text-align: center; white-space: normal; word-break: break-word; max-width: 100%; padding: 0 10px;"></div>
                </div>

                <div id="progress-interactive" style="display: none; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
                    <div id="progress-question" style="color: #fff; font-size: 16px; font-weight: bold; margin-bottom: 20px; text-align: center; max-width: 90%;"></div>
                    <div style="display: flex; gap: 15px;" id="progress-buttons">
                        <button id="btn-yes" style="background-color: #81b64c; color: #fff; border: none; padding: 10px 30px; border-radius: 6px; font-weight: bold; font-size: 16px; cursor: pointer; transition: transform 0.1s; box-shadow: 0 4px 0 #5a8231;">SÍ</button>
                        <button id="btn-no" style="background-color: #d8504f; color: #fff; border: none; padding: 10px 30px; border-radius: 6px; font-weight: bold; font-size: 16px; cursor: pointer; transition: transform 0.1s; box-shadow: 0 4px 0 #a93c3b;">NO</button>
                    </div>
                    <form id="prog-input-form" style="display: none; width: 100%; max-width: 300px; display: flex;">
                        <input type="text" id="prog-input" autocomplete="off" style="flex: 1; padding: 10px; border-radius: 6px 0 0 6px; border: 1px solid #403d39; background: #121110; color: #fff; outline: none; font-family: monospace;">
                        <button type="submit" style="background-color: #81b64c; color: #fff; border: none; padding: 10px 20px; border-radius: 0 6px 6px 0; font-weight: bold; cursor: pointer;">ENVIAR</button>
                    </form>
                </div>
                <style>
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }
                </style>
            `;

            const sendInput = async (val) => {
                try {
                    await fetch('http://localhost:8765/input', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ input: val })
                    });
                    progressView.querySelector('#progress-interactive').style.display = 'none';
                    progressView.querySelector('#progress-spinner-container').style.display = 'flex';
                    progressView.querySelector('#progress-text').textContent = "Reanudando proceso...";
                } catch (err) {
                    console.error("Error al enviar input a Python:", err);
                }
            };

            progressView.querySelector('#btn-yes').addEventListener('click', () => sendInput('s'));
            progressView.querySelector('#btn-no').addEventListener('click', () => sendInput('n'));
            progressView.querySelector('#prog-input-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const textInput = progressView.querySelector('#prog-input');
                if (textInput.value) {
                    sendInput(textInput.value);
                    textInput.value = '';
                }
            });

            progressView.addEventListener('mousedown', (e) => {
                const btn = e.target.closest('button');
                if (btn && !btn.disabled) {
                    btn.style.transform = 'translateY(2px)';
                    const origShadow = btn.style.boxShadow;
                    if (!btn.dataset.origShadow && origShadow) btn.dataset.origShadow = origShadow;
                    if (origShadow) btn.style.boxShadow = origShadow.replace('0px 4px', '0px 2px').replace('0 4px', '0 2px');
                }
            });
            const resetProgBtn = (e) => {
                const btn = e.target.closest('button');
                if (btn && !btn.disabled) {
                    btn.style.transform = 'translateY(0)';
                    if (btn.dataset.origShadow) btn.style.boxShadow = btn.dataset.origShadow;
                }
            };
            progressView.addEventListener('mouseup', resetProgBtn);
            progressView.addEventListener('mouseout', (e) => {
                if (e.target.tagName === 'BUTTON') resetProgBtn(e);
            });

            // Ocultar form por defecto tras inyectar el HTML
            progressView.querySelector('#prog-input-form').style.display = 'none';

            modal.appendChild(closeBtn);
            modal.appendChild(mainView);
            modal.appendChild(settingsView);
            modal.appendChild(progressView);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // API Logic
            const checkModelStatus = async (selectEl, statusEl) => {
                if (!selectEl || !statusEl) return;
                const modelName = selectEl.value;
                const apiKey = typeof gemini_keys !== 'undefined' ? gemini_keys[0] : null;
                if (!modelName || !apiKey) {
                    statusEl.innerHTML = '';
                    return;
                }
                statusEl.innerHTML = '<div class="loader" style="width: 16px; height: 16px; border: 2px solid rgba(255, 255, 255, 0.1); border-left-color: #888; border-radius: 50%; animation: spin 1s linear infinite;"></div>';
                statusEl.title = 'Comprobando modelo...';

                try {
                    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] })
                    });
                    if (res.ok) {
                        statusEl.innerHTML = '<span style="color: #81b64c; font-weight: bold; font-size: 20px;">✓</span>';
                        statusEl.title = 'Modelo apto y cuota disponible';
                    } else {
                        const errText = await res.text();
                        if (errText.includes('429') || errText.includes('quota')) {
                            statusEl.innerHTML = '<span style="color: #d8504f; font-weight: bold; font-size: 18px;">✖</span>';
                            statusEl.title = 'Cuota agotada';
                        } else {
                            statusEl.innerHTML = '<span style="color: #f59e0b; font-weight: bold; font-size: 18px;">!</span>';
                            statusEl.title = 'Error del modelo';
                        }
                    }
                } catch (e) {
                    statusEl.innerHTML = '<span style="color: #d8504f; font-weight: bold; font-size: 18px;">✖</span>';
                    statusEl.title = 'Error de conexión';
                }
            };

            const loadModels = async (apiKey) => {
                const modelSelect = document.getElementById('modal-model');

                if (!apiKey) {
                    modelSelect.innerHTML = '<option value="">Configura la GEMINI_API_KEY</option>';
                    return;
                }

                modelSelect.innerHTML = '<option value="">Cargando modelos...</option>';

                try {
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                    const data = await response.json();

                    if (data.models && data.models.length > 0) {
                        modelSelect.innerHTML = '';
                        let hasFlashLite = false;

                        data.models.forEach(m => {
                            if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent') && !m.name.toLowerCase().includes('vision')) {
                                const modelName = m.name.replace('models/', '');
                                if (modelName === 'gemini-flash-lite-latest') hasFlashLite = true;

                                const opt = document.createElement('option');
                                opt.value = modelName;
                                opt.text = modelName;
                                modelSelect.appendChild(opt);
                            }
                        });

                        if (modelSelect.options.length === 0) {
                            modelSelect.innerHTML = '<option value="">Sin modelos válidos</option>';
                            return;
                        }

                        // Select logic
                        let modelToSelect = p_model;
                        const optionValues = Array.from(modelSelect.options).map(o => o.value);

                        if (!modelToSelect || !optionValues.includes(modelToSelect)) {
                            modelToSelect = hasFlashLite ? 'gemini-flash-lite-latest' : optionValues[0];
                        }
                        modelSelect.value = modelToSelect;
                        checkModelStatus(modelSelect, document.getElementById('modal-model-status'));
                    } else {
                        modelSelect.innerHTML = '<option value="">Error cargando modelos</option>';
                    }
                } catch (e) {
                    console.error("Error fetching Gemini models:", e);
                    modelSelect.innerHTML = '<option value="">Error conexión API</option>';
                }
            };

            // Trigger initial API load if key exists
            const initialKey = gemini_keys[0];
            loadModels(initialKey);

            const modalModelEl = document.getElementById('modal-model');
            const modalModelStatusEl = document.getElementById('modal-model-status');
            if (modalModelEl && modalModelStatusEl) {
                modalModelEl.addEventListener('change', () => checkModelStatus(modalModelEl, modalModelStatusEl));
            }

            // Logic and Events
            const depthRange = document.getElementById('modal-depth');
            const depthVal = document.getElementById('modal-depth-val');
            depthRange.addEventListener('input', (e) => {
                depthVal.textContent = e.target.value;
            });
            const lichessTokenEl = document.getElementById('modal-lichess-token');
            const lichessCookieEl = document.getElementById('modal-lichess-cookie');

            // Button animations
            ['modal-start', 'modal-save'].forEach(id => {
                const btn = document.getElementById(id);
                if (!btn) return;
                btn.onmouseenter = (e) => { if (!e.target.disabled) e.target.style.backgroundColor = '#8bc453'; };
                btn.onmouseleave = (e) => { if (!e.target.disabled) e.target.style.backgroundColor = '#81b64c'; };
                btn.onmousedown = (e) => {
                    if (!e.target.disabled) {
                        e.target.style.transform = 'translateY(2px)';
                        e.target.style.boxShadow = '0 2px 0 #5a8231';
                    }
                };
                btn.onmouseup = (e) => {
                    if (!e.target.disabled) {
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = '0 4px 0 #5a8231';
                    }
                };
            });

            const gearBtn = document.getElementById('modal-gear');
            const backBtn = document.getElementById('modal-back');
            gearBtn.onmouseenter = () => gearBtn.querySelector('svg').style.stroke = '#fff';
            gearBtn.onmouseleave = () => gearBtn.querySelector('svg').style.stroke = '#bababa';
            backBtn.onmouseenter = () => backBtn.querySelector('svg').style.stroke = '#fff';
            backBtn.onmouseleave = () => backBtn.querySelector('svg').style.stroke = '#bababa';

            gearBtn.onclick = () => {
                mainView.style.transform = 'translateX(-100%)';
                settingsView.style.left = '0';
            };
            backBtn.onclick = () => {
                mainView.style.transform = 'translateX(0)';
                settingsView.style.left = '100%';
            };

            // Eye toggles
            settingsView.addEventListener('click', (e) => {
                const eye = e.target.closest('.toggle-eye');
                if (eye) {
                    const input = eye.parentElement.querySelector('input');
                    if (input) {
                        input.type = input.type === 'password' ? 'text' : 'password';
                        eye.style.color = input.type === 'text' ? '#fff' : '#bababa';
                        eye.querySelector('.eye-open').style.display = input.type === 'text' ? 'block' : 'none';
                        eye.querySelector('.eye-closed').style.display = input.type === 'password' ? 'block' : 'none';
                    }
                }

                const infoBtn = e.target.closest('.info-btn');
                if (infoBtn) {
                    const targetId = infoBtn.dataset.info;

                    const infoOverlay = document.createElement('div');
                    Object.assign(infoOverlay.style, {
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        backgroundColor: 'rgba(38,36,33,0.95)', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '30px', boxSizing: 'border-box'
                    });

                    let instructions = '';
                    if (targetId === 'modal-lichess-token') {
                        instructions = `
                            <p style="margin-top: 0; font-weight: bold; font-size: 14px; color: #fff;">Cómo obtener el Token de Lichess:</p>
                            <ol style="padding-left: 20px; font-size: 13px; color: #ccc;">
                                <li>Inicia sesión en Lichess.org</li>
                                <li>Ve a Preferencias > API access tokens</li>
                                <li>Haz clic en el botón <b style="color:#3b82f6">+</b> (Generate a new token)</li>
                                <li>Dale los permisos de: <b>Read studies</b> y <b>Write studies</b></li>
                                <li>Copia el token generado y pégalo aquí.</li>
                            </ol>
                        `;
                    } else if (targetId === 'modal-lichess-cookie') {
                        instructions = `
                            <p style="margin-top: 0; font-weight: bold; font-size: 14px; color: #fff;">Cómo obtener la Cookie lila2:</p>
                            <ol style="padding-left: 20px; font-size: 13px; color: #ccc;">
                                <li>Abre Lichess.org y asegúrate de tener sesión iniciada.</li>
                                <li>Pulsa <b>F12</b> para abrir herramientas de desarrollador.</li>
                                <li>Ve a la pestaña <b>Application</b> (o Almacenamiento) > <b>Cookies</b>.</li>
                                <li>Busca la cookie <b>'lila2'</b> y copia su valor.</li>
                            </ol>
                        `;
                    }

                    infoOverlay.innerHTML = `
                        <div style="background: #1e1d1b; padding: 15px; border-radius: 6px; text-align: left; margin-bottom: 20px; width: 100%; max-width: 400px; box-sizing: border-box;">
                            ${instructions}
                        </div>
                        <button id="info-btn-volver" style="background-color: #6b7280; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: transform 0.1s; box-shadow: 0 4px 0 #4b5563;">VOLVER</button>
                    `;
                    settingsView.appendChild(infoOverlay);

                    const volverBtn = infoOverlay.querySelector('#info-btn-volver');
                    volverBtn.onclick = () => infoOverlay.remove();
                }

                if (e.target.closest('#add-gemini-btn')) {
                    const btn = document.getElementById('add-gemini-btn');
                    const container = document.getElementById('gemini-keys-container');
                    const rows = container.querySelectorAll('.gemini-key-row');
                    if (rows.length < 10) {
                        const newRow = document.createElement('div');
                        newRow.className = 'gemini-key-row';
                        newRow.style = "position: relative; margin-top: 5px; display: flex; align-items: center;";
                        newRow.innerHTML = `
                            <div style="position: relative; flex: 1; display: flex; align-items: center;">
                                <input type="password" value="" style="${inputStyle} padding-right: 35px; width: 100%; margin-top: 0; box-sizing: border-box;">
                                <div class="toggle-eye" style="position: absolute; right: 10px; cursor: pointer; color: #bababa; display: flex; align-items: center;">
                                    ${eyeOpenSvg}
                                    ${eyeClosedSvg}
                                </div>
                            </div>
                            <button class="remove-gemini-btn" style="margin-left: 10px; margin-bottom: 3px; background-color: #d8504f; color: #fff; border: none; border-radius: 4px; width: 33px; height: 33px; padding-bottom: 4px; box-sizing: border-box; cursor: pointer; transition: background-color 0.2s, transform 0.1s; box-shadow: 0 4px 0 #a93c3b; font-weight: bold; font-size: 24px; line-height: 1; display: flex; align-items: center; justify-content: center;">-</button>
                        `;
                        container.appendChild(newRow);
                        if (rows.length + 1 >= 10) {
                            btn.disabled = true;
                            btn.style.opacity = '0.5';
                            btn.style.cursor = 'not-allowed';
                        }
                    }
                }

                if (e.target.closest('.remove-gemini-btn')) {
                    e.target.closest('.gemini-key-row').remove();
                    const btn = document.getElementById('add-gemini-btn');
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                }
            });

            // Make dynamic buttons react nicely
            settingsView.addEventListener('mousedown', (e) => {
                const btn = e.target.closest('button');
                if (btn && !btn.disabled && (btn.id === 'add-gemini-btn' || btn.classList.contains('remove-gemini-btn') || btn.classList.contains('info-btn') || btn.id === 'info-btn-volver')) {
                    btn.style.transform = 'translateY(2px)';
                    const origShadow = btn.style.boxShadow;
                    if (!btn.dataset.origShadow && origShadow) btn.dataset.origShadow = origShadow;
                    if (origShadow) btn.style.boxShadow = origShadow.replace('0px 4px', '0px 2px').replace('0 4px', '0 2px');
                }
            });
            const resetSetBtn = (e) => {
                const btn = e.target.closest('button');
                if (btn && !btn.disabled && (btn.id === 'add-gemini-btn' || btn.classList.contains('remove-gemini-btn') || btn.classList.contains('info-btn') || btn.id === 'info-btn-volver')) {
                    btn.style.transform = 'translateY(0)';
                    if (btn.dataset.origShadow) btn.style.boxShadow = btn.dataset.origShadow;
                }
            };
            settingsView.addEventListener('mouseup', resetSetBtn);
            settingsView.addEventListener('mouseout', (e) => {
                if (e.target.tagName === 'BUTTON') resetSetBtn(e);
            });

            ['modal-settings-btn', 'modal-start', 'modal-save', 'modal-clear', 'modal-cancel'].forEach(id => {
                const b = document.getElementById(id);
                if (b) {
                    b.addEventListener('mousedown', () => {
                        b.style.transform = 'translateY(2px)';
                        if (id === 'modal-start' || id === 'modal-save') b.style.boxShadow = '0 2px 0 #5a8231';
                        else if (id === 'modal-clear') b.style.boxShadow = '0 0px 0 #a93c3b';
                        else if (id === 'modal-cancel') b.style.boxShadow = '0 2px 0 #333';
                    });
                    b.addEventListener('mouseup', () => {
                        b.style.transform = 'translateY(0)';
                        if (id === 'modal-start' || id === 'modal-save') b.style.boxShadow = '0 4px 0 #5a8231';
                        else if (id === 'modal-clear') b.style.boxShadow = '0 2px 0 #a93c3b';
                        else if (id === 'modal-cancel') b.style.boxShadow = '0 4px 0 #333';
                    });
                    b.addEventListener('mouseleave', () => {
                        b.style.transform = 'translateY(0)';
                        if (id === 'modal-start' || id === 'modal-save') b.style.boxShadow = '0 4px 0 #5a8231';
                        else if (id === 'modal-clear') b.style.boxShadow = '0 2px 0 #a93c3b';
                        else if (id === 'modal-cancel') b.style.boxShadow = '0 4px 0 #333';
                    });
                }
            });

            document.getElementById('modal-clear').onclick = () => {
                const confirmOverlay = document.createElement('div');
                Object.assign(confirmOverlay.style, {
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(38,36,33,0.95)', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '30px', boxSizing: 'border-box'
                });
                confirmOverlay.innerHTML = `
                    <h3 style="color: #fff; text-align: center; margin-top: 0; margin-bottom: 20px; line-height: 1.4;">¿Estás seguro de que deseas borrar los datos?</h3>
                    <div style="display: flex; gap: 15px;">
                        <button id="confirm-no" style="background-color: #555; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: transform 0.1s; box-shadow: 0 4px 0 #333;">CANCELAR</button>
                        <button id="confirm-yes" style="background-color: #d8504f; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: transform 0.1s; box-shadow: 0 4px 0 #a93c3b;">SÍ, BORRAR</button>
                    </div>
                `;
                settingsView.appendChild(confirmOverlay);

                ['confirm-no', 'confirm-yes'].forEach(id => {
                    const btn = document.getElementById(id);
                    btn.onmousedown = () => btn.style.transform = 'translateY(2px)';
                    btn.onmouseup = () => btn.style.transform = 'translateY(0)';
                    btn.onmouseleave = () => btn.style.transform = 'translateY(0)';
                });

                document.getElementById('confirm-no').onclick = () => confirmOverlay.remove();
                document.getElementById('confirm-yes').onclick = () => {
                    Object.keys(localStorage).forEach(key => {
                        if (key.startsWith('agy_')) localStorage.removeItem(key);
                    });

                    document.getElementById('modal-threads').value = 1;
                    document.getElementById('modal-hash').value = 512;
                    document.getElementById('modal-player').value = '';
                    document.getElementById('modal-lichess-token').value = '';
                    document.getElementById('modal-lichess-cookie').value = '';

                    const depthEl = document.getElementById('modal-depth');
                    const depthValEl = document.getElementById('modal-depth-val');
                    if (depthEl) depthEl.value = 18;
                    if (depthValEl) depthValEl.textContent = '18';

                    const container = document.getElementById('gemini-keys-container');
                    if (container) {
                        const rows = container.querySelectorAll('.gemini-key-row');
                        rows.forEach((row, idx) => {
                            if (idx === 0) row.querySelector('input').value = '';
                            else row.remove();
                        });
                        const addBtn = document.getElementById('add-gemini-btn');
                        if (addBtn) {
                            addBtn.disabled = false;
                            addBtn.style.opacity = '1';
                            addBtn.style.cursor = 'pointer';
                        }
                    }

                    confirmOverlay.remove();
                };
            };

            document.getElementById('modal-save').onclick = () => {
                const newPlayer = document.getElementById('modal-player').value;
                const targetPlayer = document.getElementById('modal-target').value;
                const depth = document.getElementById('modal-depth').value;
                const model = document.getElementById('modal-model').value;

                localStorage.setItem('agy_stockfish_depth', depth);
                localStorage.setItem('agy_gemini_model', model);
                localStorage.setItem('agy_chesscom_player', targetPlayer);

                // If they provided a fallback in settings, maybe save it too? 
                // Actually the script uses newPlayer if they update the default.
                // We'll leave newPlayer in 'agy_chesscom_player' alone, wait! 
                // 'agy_chesscom_player' is used for BOTH. Let's just save newPlayer there if it was modified.
                if (newPlayer) localStorage.setItem('agy_chesscom_player', newPlayer);

                localStorage.setItem('agy_stockfish_threads', document.getElementById('modal-threads').value);
                localStorage.setItem('agy_stockfish_hash', document.getElementById('modal-hash').value);

                localStorage.setItem('agy_lichess_token', document.getElementById('modal-lichess-token').value);

                const cookieVal = document.getElementById('modal-lichess-cookie').value;
                if (typeof GM_setValue !== 'undefined') {
                    GM_setValue('agy_lichess_cookie', cookieVal);
                }
                localStorage.setItem('agy_lichess_cookie', cookieVal);

                const keyRows = document.querySelectorAll('.gemini-key-row input');
                let firstKey = '';
                // Clear old keys
                for (let i = 0; i < 10; i++) {
                    localStorage.removeItem(i === 0 ? 'agy_gemini_api_key' : `agy_gemini_api_key_${i}`);
                }

                keyRows.forEach((input, index) => {
                    if (input.value) {
                        if (!firstKey) firstKey = input.value;
                        const k = index === 0 ? 'gemini_api_key' : `gemini_api_key_${index}`;
                        localStorage.setItem('agy_' + k, input.value);
                    }
                });

                // Update the target select if the user changed the default player
                const targetSelect = document.getElementById('modal-target');
                if (newPlayer && Array.from(targetSelect.options).some(o => o.value === newPlayer)) {
                    targetSelect.value = newPlayer;
                }

                // Trigger model load if key changed or was just saved
                loadModels(firstKey);

                backBtn.onclick();
            };

            document.getElementById('modal-start').onclick = () => {
                const targetPlayer = document.getElementById('modal-target').value;
                const depth = document.getElementById('modal-depth').value;
                const model = document.getElementById('modal-model').value;
                const threads = document.getElementById('modal-threads').value;
                const hash = document.getElementById('modal-hash').value;
                const lichessToken = document.getElementById('modal-lichess-token').value;
                const lichessCookie = document.getElementById('modal-lichess-cookie').value;
                const apiKey = document.querySelector('.gemini-key-row input').value;

                if (!targetPlayer || !depth || !model || model.startsWith('Error') || !threads || !hash || !lichessToken || !lichessCookie || !apiKey) {
                    const warningOverlay = document.createElement('div');
                    Object.assign(warningOverlay.style, {
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        backgroundColor: 'rgba(38,36,33,0.95)', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '30px', boxSizing: 'border-box'
                    });
                    warningOverlay.innerHTML = `
                        <h3 style="color: #fff; text-align: center; margin-top: 0; margin-bottom: 20px; line-height: 1.4;">Faltan campos por rellenar en el apartado de configuración.</h3>
                        <button id="warning-btn-ok" style="background-color: #3b82f6; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: transform 0.1s; box-shadow: 0 4px 0 #2563eb;">ACEPTAR</button>
                    `;
                    mainView.appendChild(warningOverlay);

                    const okBtn = warningOverlay.querySelector('#warning-btn-ok');
                    okBtn.onmousedown = () => okBtn.style.transform = 'translateY(2px)';
                    okBtn.onmouseup = () => okBtn.style.transform = 'translateY(0)';
                    okBtn.onmouseleave = () => okBtn.style.transform = 'translateY(0)';
                    okBtn.onclick = () => warningOverlay.remove();
                    return;
                }

                // Save main view settings
                localStorage.setItem('agy_stockfish_depth', depth);
                localStorage.setItem('agy_gemini_model', model);
                localStorage.setItem('agy_chesscom_player', targetPlayer);

                // Construct full configuration payload
                const configData = {
                    CHESSCOM_PLAYER: targetPlayer,
                    STOCKFISH_DEPTH: depth,
                    GEMINI_MODEL: model,
                    STOCKFISH_THREADS: document.getElementById('modal-threads').value,
                    STOCKFISH_HASH: document.getElementById('modal-hash').value,
                    LICHESS_TOKEN: document.getElementById('modal-lichess-token').value,
                    LICHESS_COOKIE: document.getElementById('modal-lichess-cookie').value
                };

                const keyRows = document.querySelectorAll('.gemini-key-row input');
                keyRows.forEach((input, index) => {
                    if (input.value) {
                        const k = index === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${index}`;
                        configData[k] = input.value;
                    }
                });

                // Base64 encode JSON and make it URL safe
                const payloadBase64 = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(configData)))));

                // Usamos solo origin y pathname para evitar que # o ? previos corrompan el payload
                const baseUrl = window.location.origin + window.location.pathname;
                const uri = `ajedrez://${baseUrl}?payload=${payloadBase64}`;
                window.location.href = uri;

                // Transition to progress view instead of terminal view
                mainView.style.transform = 'translateX(-100%)';
                progressView.style.left = '0';

                const progText = progressView.querySelector('#progress-text');
                const progSubtext = progressView.querySelector('#progress-subtext');
                const progInteractive = progressView.querySelector('#progress-interactive');
                const progSpinner = progressView.querySelector('#progress-spinner-container');
                const progQuestion = progressView.querySelector('#progress-question');

                // Reset state in case this is a retry from the main menu
                progSpinner.style.display = 'flex';
                progInteractive.style.display = 'none';
                progText.textContent = 'Iniciando proceso local...';
                progSubtext.textContent = '';
                progSubtext.style.color = '#888';
                const oldModelContainer = progressView.querySelector('#prog-model-container');
                if (oldModelContainer) oldModelContainer.remove();
                const oldCookieView = progressView.querySelector('#manual-cookie-view');
                if (oldCookieView) oldCookieView.remove();
                const inputFormReset = progressView.querySelector('#prog-input-form');
                if (inputFormReset) inputFormReset.style.display = 'none';
                const btnGroupReset = progressView.querySelector('#progress-buttons');
                if (btnGroupReset) btnGroupReset.style.display = 'none';

                let currentStepStartTime = Date.now();
                let currentStepBaseText = 'Iniciando proceso local...';
                let currentMove = '';

                const updateTimerText = () => {
                    const elapsed = Math.floor((Date.now() - currentStepStartTime) / 1000);
                    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
                    const s = String(elapsed % 60).padStart(2, '0');

                    if (currentStepBaseText.includes('Stockfish')) {
                        progText.textContent = `[${m}:${s}] Analizando jugada ${currentMove || '...'} con Stockfish...`;
                    } else {
                        progText.textContent = `[${m}:${s}] ${currentStepBaseText}`;
                    }
                };

                let stepTimerInterval = setInterval(updateTimerText, 1000);

                let pollFailures = 0;
                let lastLogCount = 0;

                const pollInterval = setInterval(async () => {
                    try {
                        const res = await fetch('http://localhost:8765/status');
                        if (res.ok) {
                            const data = await res.json();
                            if (data.logs && data.logs.length > lastLogCount) {
                                const newLogs = data.logs.slice(lastLogCount);
                                lastLogCount = data.logs.length;

                                for (let log of newLogs) {
                                    if (log.includes('PASO 1:')) { currentStepBaseText = 'Extrayendo PGN de la partida...'; currentStepStartTime = Date.now(); progSubtext.textContent = ''; updateTimerText(); }
                                    else if (log.includes('PASO 2:')) { currentStepBaseText = 'Analizando movimientos con Stockfish...'; currentStepStartTime = Date.now(); progSubtext.textContent = ''; updateTimerText(); }
                                    else if (log.includes('Analizando jugada')) {
                                        const match = log.match(/jugada\s+(\d+\/\d+)/);
                                        if (match) currentMove = match[1];
                                        updateTimerText();
                                    }
                                    else if (log.includes('PASO 3:')) { currentStepBaseText = 'Generando comentarios con IA...'; currentStepStartTime = Date.now(); progSubtext.textContent = ''; updateTimerText(); }
                                    else if (log.includes('PASO 4:')) { currentStepBaseText = 'Creando estudio interactivo...'; currentStepStartTime = Date.now(); progSubtext.textContent = ''; updateTimerText(); }
                                    else if (log.includes('[Error]')) { progSubtext.textContent = log.trim(); progSubtext.style.color = '#d8504f'; }
                                    else if (log.includes('[Aviso]')) { progSubtext.textContent = log.trim(); progSubtext.style.color = '#f59e0b'; }
                                    else if (log.includes('[WEB_INPUT_REQUIRED]')) {
                                        progSpinner.style.display = 'none';
                                        progInteractive.style.display = 'flex';

                                        const promptText = log.split('[WEB_INPUT_REQUIRED]')[1].trim();

                                        const btnGroup = progressView.querySelector('#progress-buttons');
                                        const inputForm = progressView.querySelector('#prog-input-form');
                                        const inputEl = progressView.querySelector('#prog-input');
                                        let manualCookieView = progressView.querySelector('#manual-cookie-view');

                                        // Ocultar elementos interactivos previos
                                        btnGroup.style.display = 'none';
                                        inputForm.style.display = 'none';
                                        if (manualCookieView) manualCookieView.style.display = 'none';

                                        if (promptText.includes('[MODEL_SELECTION]')) {
                                            const lastErrorMsg = progSubtext.textContent || "La IA no pudo procesar la solicitud.";
                                            progQuestion.innerHTML = `Error al generar los comentarios con el modelo seleccionado:<br><span style="color: #f59e0b; font-weight: normal; font-size: 14px; display: inline-block; margin-top: 5px;">${lastErrorMsg}</span>`;
                                            progQuestion.style.display = 'block';

                                            const oldContainer = document.getElementById('prog-model-container');
                                            if (oldContainer) oldContainer.remove();

                                            const modelContainer = document.createElement('div');
                                            modelContainer.id = 'prog-model-container';
                                            Object.assign(modelContainer.style, { width: '100%', maxWidth: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center' });

                                            const originalSelect = document.getElementById('modal-model');
                                            const newSelect = originalSelect.cloneNode(true);
                                            newSelect.value = originalSelect.value;
                                            newSelect.id = 'prog-model-select';
                                            Object.assign(newSelect.style, {
                                                width: '100%', boxSizing: 'border-box', padding: '10px',
                                                backgroundColor: '#121110', border: '1px solid #403d39',
                                                color: '#fff', borderRadius: '5px', fontSize: '14px',
                                                outline: 'none', margin: '0', flex: 1
                                            });

                                            const progModelStatus = document.createElement('div');
                                            progModelStatus.id = 'prog-model-status';
                                            Object.assign(progModelStatus.style, {
                                                marginLeft: '10px', width: '24px', display: 'flex',
                                                justifyContent: 'center', alignItems: 'center', fontSize: '18px'
                                            });

                                            const comboRow = document.createElement('div');
                                            Object.assign(comboRow.style, {
                                                display: 'flex', alignItems: 'center', width: '100%', marginBottom: '15px'
                                            });
                                            comboRow.appendChild(newSelect);
                                            comboRow.appendChild(progModelStatus);

                                            newSelect.addEventListener('change', () => checkModelStatus(newSelect, progModelStatus));
                                            checkModelStatus(newSelect, progModelStatus);

                                            const btnRow = document.createElement('div');
                                            Object.assign(btnRow.style, { display: 'flex', gap: '15px', width: '100%' });

                                            const createBtn = (text, bg, shadow, action) => {
                                                const btn = document.createElement('button');
                                                btn.textContent = text;
                                                Object.assign(btn.style, {
                                                    flex: 1, backgroundColor: bg, color: '#fff', border: 'none',
                                                    padding: '12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px',
                                                    cursor: 'pointer', boxShadow: `0 4px 0 ${shadow}`, transition: 'transform 0.1s, box-shadow 0.1s'
                                                });

                                                btn.onclick = () => {
                                                    fetch('http://localhost:8765/input', { method: 'POST', body: JSON.stringify({ input: action }) });
                                                    if (action === 'SALIR') {
                                                        progressView.style.left = '100%';
                                                        mainView.style.transform = 'translateX(0)';
                                                        clearInterval(stepTimerInterval);
                                                        clearInterval(pollInterval);
                                                        return;
                                                    }
                                                    progInteractive.style.display = 'none';
                                                    progSpinner.style.display = 'flex';
                                                    progSubtext.textContent = '';
                                                };
                                                return btn;
                                            };

                                            btnRow.appendChild(createBtn('Volver', '#6b7280', '#4b5563', 'SALIR'));

                                            const btnReintentar = createBtn('Reintentar', '#81b64c', '#5a8231', '');
                                            btnReintentar.onclick = () => {
                                                fetch('http://localhost:8765/input', { method: 'POST', body: JSON.stringify({ input: newSelect.value }) });
                                                progInteractive.style.display = 'none';
                                                progSpinner.style.display = 'flex';
                                                progSubtext.textContent = '';
                                            };
                                            btnRow.appendChild(btnReintentar);

                                            modelContainer.appendChild(comboRow);
                                            modelContainer.appendChild(btnRow);
                                            progInteractive.appendChild(modelContainer);
                                        } else if (promptText.includes('[MANUAL_COOKIE]')) {
                                            progQuestion.textContent = "";
                                            progQuestion.style.display = 'none';
                                            if (!manualCookieView) {
                                                const eyeOpenSvg = `<svg class="eye-open" style="display:none;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
                                                const eyeClosedSvg = `<svg class="eye-closed" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

                                                const mcHtml = `
                                                    <div id="manual-cookie-view" style="width: 100%; display: flex; flex-direction: column; align-items: center;">
                                                        <div style="background: #1e1d1b; padding: 15px; border-radius: 6px; text-align: left; font-size: 13px; color: #ccc; margin-bottom: 10px; max-width: 400px; box-sizing: border-box; width: 100%;">
                                                            <p style="margin-top: 0; color: #fff; font-weight: bold; font-size: 14px;">Instrucciones:</p>
                                                            <ol style="padding-left: 20px; margin-bottom: 0;">
                                                                <li style="margin-bottom: 5px;">Abre Lichess.org y asegúrate de tener sesión iniciada.</li>
                                                                <li style="margin-bottom: 5px;">Pulsa <b>F12</b> para abrir herramientas de desarrollador.</li>
                                                                <li style="margin-bottom: 5px;">Pestaña <b>Application</b> (o Almacenamiento) > <b>Cookies</b>.</li>
                                                                <li>Busca la cookie <b>'lila2'</b> y copia su valor.</li>
                                                            </ol>
                                                        </div>
                                                        <form id="mc-form" style="display: flex; width: 100%; max-width: 400px; flex-direction: column; gap: 15px;">
                                                            <div style="position: relative; display: flex; align-items: center;">
                                                                <input type="password" id="mc-input" placeholder="Pega tu cookie aquí..." autocomplete="off" style="flex: 1; padding: 10px; border-radius: 6px; border: 1px solid #403d39; background: #121110; color: #fff; outline: none; padding-right: 40px; font-family: monospace;">
                                                                <div id="mc-eye" style="position: absolute; right: 10px; cursor: pointer; color: #bababa; display: flex; align-items: center;">
                                                                    ${eyeOpenSvg}
                                                                    ${eyeClosedSvg}
                                                                </div>
                                                            </div>
                                                            <div style="display: flex; justify-content: center; gap: 15px;">
                                                                <button type="button" id="mc-btn-volver" style="background-color: #6b7280; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 0 #4b5563;">VOLVER</button>
                                                                <button type="submit" id="mc-btn-cont" style="background-color: #81b64c; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 0 #5a8231;">CONTINUAR</button>
                                                            </div>
                                                        </form>
                                                    </div>
                                                `;
                                                progInteractive.insertAdjacentHTML('beforeend', mcHtml);
                                                manualCookieView = progressView.querySelector('#manual-cookie-view');

                                                manualCookieView.querySelector('#mc-eye').onclick = (e) => {
                                                    const inp = manualCookieView.querySelector('#mc-input');
                                                    const eyeOpen = manualCookieView.querySelector('.eye-open');
                                                    const eyeClosed = manualCookieView.querySelector('.eye-closed');
                                                    if (inp.type === 'password') {
                                                        inp.type = 'text';
                                                        eyeOpen.style.display = 'block';
                                                        eyeClosed.style.display = 'none';
                                                    } else {
                                                        inp.type = 'password';
                                                        eyeOpen.style.display = 'none';
                                                        eyeClosed.style.display = 'block';
                                                    }
                                                };

                                                manualCookieView.querySelector('#mc-btn-volver').onclick = () => sendInput('volver');

                                                manualCookieView.querySelector('#mc-form').onsubmit = (e) => {
                                                    e.preventDefault();
                                                    const val = manualCookieView.querySelector('#mc-input').value.trim();
                                                    if (val) {
                                                        if (typeof GM_setValue !== 'undefined') {
                                                            GM_setValue('agy_lichess_cookie', val);
                                                        }
                                                        localStorage.setItem('agy_lichess_cookie', val);
                                                        // También guardarlo en el form principal oculto por si acaso
                                                        const modalCookieInput = document.getElementById('modal-lichess-cookie');
                                                        if (modalCookieInput) modalCookieInput.value = val;

                                                        sendInput(val);
                                                    }
                                                };
                                            }
                                            manualCookieView.style.display = 'flex';
                                            manualCookieView.querySelector('#mc-input').value = '';
                                            setTimeout(() => manualCookieView.querySelector('#mc-input').focus(), 50);
                                        }
                                        else if (promptText.includes('(S/N)')) {
                                            progQuestion.style.display = 'block';
                                            progQuestion.style.whiteSpace = 'pre-wrap';
                                            progQuestion.textContent = promptText.replace('(S/N)', '').replace(':', '').trim();
                                            btnGroup.style.display = 'flex';
                                        } else {
                                            progQuestion.style.display = 'block';
                                            progQuestion.style.whiteSpace = 'pre-wrap';
                                            progQuestion.textContent = promptText;
                                            inputForm.style.display = 'flex';
                                            setTimeout(() => inputEl.focus(), 50);
                                        }
                                    }
                                }
                            }
                            pollFailures = 0;
                        } else {
                            pollFailures++;
                        }
                    } catch (e) {
                        console.error("Poll Error:", e);
                        pollFailures++;
                    }
                    if (pollFailures > 10) {
                        clearInterval(pollInterval);
                        progSpinner.style.display = 'none';
                        progInteractive.style.display = 'flex';
                        progInteractive.innerHTML = '<div style="color: #d8504f; font-weight: bold; text-align: center;">Proceso finalizado.</div>';
                    }
                }, 500);
            };
        });

        document.body.appendChild(button);
        return;
    }


    // Se pinta la interfaz local al abrir el estudio final de Lichess.
    if (!currentUrl.includes('lichess.org/study/')) return;

    // Recuperar LICHESS_COOKIE si viene del script de extraccion (main.py -> crear_estudio.py)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('agy_cookie')) {
        try {
            const decodedCookie = decodeURIComponent(escape(atob(urlParams.get('agy_cookie'))));
            if (typeof GM_setValue !== 'undefined') {
                GM_setValue('agy_lichess_cookie', decodedCookie);
            }
            localStorage.setItem('agy_lichess_cookie', decodedCookie);

            // Limpiar la URL para que no quede colgando el chorro en base64
            const newUrl = window.location.href.split('?')[0];
            window.history.replaceState({}, document.title, newUrl);
        } catch (e) {
            console.error('Error procesando agy_cookie', e);
        }
    }

    // Se cambian aquí los símbolos textuales de cada clasificación.
    const MOVE_TYPES = {
        BRILLIANT: { label: 'Brillante', symbol: '!!', color: '#1baca6' },
        GREAT: { label: 'Genial', symbol: '!', color: '#4f9ed8' },
        BOOK: { label: 'Libro', color: '#a88865' },
        BEST: { label: 'Mejor', symbol: '=', color: '#81b64c' },
        EXCELLENT: { label: 'Excelente', symbol: '!', color: '#96bc4b' },
        GOOD: { label: 'Bueno', symbol: '!?', color: '#b2d35e' },
        INACCURACY: { label: 'Imprecisión', symbol: '?!', color: '#e5b74b' },
        MISTAKE: { label: 'Error', symbol: '?', color: '#e58b45' },
        MISS: { label: 'Omisión', symbol: '×', color: '#e66b5b' },
        BLUNDER: { label: 'Error grave', symbol: '??', color: '#d8504f' },
    };
    const TYPE_ORDER = Object.keys(MOVE_TYPES);
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const state = { path: '', data: null, statCycles: new Map() };

    function injectStyles() {
        if (document.getElementById('local-analysis-styles')) return;
        const style = document.createElement('style');
        style.id = 'local-analysis-styles';
        style.textContent = `
            #local-analysis-chart-panel { background: transparent; box-sizing: border-box; color: var(--c-font, #bababa); overflow: hidden; }
            .local-analysis-title { align-items: baseline; display: flex; gap: .6em; justify-content: space-between; padding: 0 0 .35em; }
            .local-analysis-title strong, .local-analysis-player { color: var(--c-font, #ddd); }
            .local-analysis-title small { font-size: .82em; opacity: .75; }
            .local-analysis-chart { display: block; height: 220px; width: 100%; }
            .local-analysis-baseline { stroke: currentColor; opacity: .25; stroke-width: 1; }
            .local-analysis-line { fill: none; stroke: #e58b45; stroke-width: 2.5; }
            .local-analysis-point { cursor: pointer; stroke: var(--c-bg-zebra, #262421); stroke-width: 1.5; }
            .local-analysis-point.is-active { stroke: white; stroke-width: 3; }
            .local-analysis-axis { fill: currentColor; font-size: 11px; opacity: .68; }
            #local-analysis-status { color: #fff; font-size: 1.05em; font-weight: bold; line-height: 1.4; margin: .15em 0 .65em; padding: .45em 0; text-align: center; }
            #local-analysis-summary-panel { background: var(--c-bg-zebra, #262421); border-radius: 6px; margin-top: .5em; overflow: hidden; box-shadow: 0 2px 2px #00000014, 0 3px 1px -2px #0000002e, 0 1px 5px #0000001a; }
            .advice-summary.local-analysis-summary { background: var(--c-bg-box); display: grid; grid-template-columns: 1fr; margin: 0; padding: 0; }
            .advice-summary.local-analysis-summary .advice-summary__side { background: transparent; min-width: 0; padding: .55em .8em .75em; }
            .advice-summary.local-analysis-summary .advice-summary__side + .advice-summary__side { border-top: 1px solid rgba(255, 255, 255, .08); }
            .local-analysis-player { font-weight: bold; margin-bottom: .5em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; font-size: 1.4em; }
            .local-analysis-count { cursor: pointer; display: flex; font-size: 1.25em; justify-content: space-between; line-height: 1.45; user-select: none; }
            .local-analysis-count:hover { opacity: .8; }
            .local-analysis-count span:last-child { font-weight: bold; }
            glyph.custom-move-glyph { align-items: center; background: none !important; box-shadow: none !important; display: inline-flex !important; font-family: 'Noto Sans', sans-serif; font-size: .9em !important; font-weight: bold; justify-content: center; margin-left: 4px !important; vertical-align: middle !important; }
            move[data-local-analysis-type].active san, u8[data-local-analysis-type].active kw, move[data-local-analysis-type].active .custom-move-glyph, u8[data-local-analysis-type].active .custom-move-glyph { color: white !important; fill: white !important; }
            move[data-local-analysis-type="brilliant"].active, u8[data-local-analysis-type="brilliant"].active { background-color: #1baca6 !important; }
            move[data-local-analysis-type="great"].active, u8[data-local-analysis-type="great"].active { background-color: #4f9ed8 !important; }
            move[data-local-analysis-type="book"].active, u8[data-local-analysis-type="book"].active { background-color: #a88865 !important; }
            move[data-local-analysis-type="best"].active, u8[data-local-analysis-type="best"].active { background-color: #81b64c !important; }
            move[data-local-analysis-type="excellent"].active, u8[data-local-analysis-type="excellent"].active { background-color: #96bc4b !important; }
            move[data-local-analysis-type="good"].active, u8[data-local-analysis-type="good"].active { background-color: #b2d35e !important; }
            move[data-local-analysis-type="inaccuracy"].active, u8[data-local-analysis-type="inaccuracy"].active { background-color: #e5b74b !important; }
            move[data-local-analysis-type="mistake"].active, u8[data-local-analysis-type="mistake"].active { background-color: #e58b45 !important; }
            move[data-local-analysis-type="miss"].active, u8[data-local-analysis-type="miss"].active { background-color: #e66b5b !important; }
            move[data-local-analysis-type="blunder"].active, u8[data-local-analysis-type="blunder"].active { background-color: #d8504f !important; }
            move[data-local-analysis-type]:not(.active) san, u8[data-local-analysis-type]:not(.active) kw, move[data-local-analysis-type]:not(.active) .custom-move-glyph, u8[data-local-analysis-type]:not(.active) .custom-move-glyph { color: var(--local-move-color) !important; fill: var(--local-move-color) !important; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function parseHeaders(pgn) {
        const headers = {};
        for (const match of pgn.matchAll(/^\[([^\s]+)\s+"(.*)"\]\s*$/gm)) headers[match[1]] = match[2];

        const annotator = headers['Annotator'] || '';
        if (annotator.includes('Accuracy')) {
            const parts = annotator.split(',');
            for (const part of parts) {
                const [key, value] = part.split(':').map(s => s.trim());
                if (key && value) {
                    headers[key] = value;
                }
            }
        }
        return headers;
    }

    function parseEval(value) {
        if (!value) return null;
        const mate = value.match(/^(?:#?M|#)([+-]?\d+)$/i);
        if (mate) return Number(mate[1]) < 0 ? -12 : 12;
        const numeric = Number.parseFloat(value);
        return Number.isFinite(numeric) ? numeric : null;
    }

    function parseMetadata(comment) {
        const evalMatch = comment.match(/\[%eval\s+([^\]\s]+)\]/i);
        const localEvalMatch = comment.match(/\[#LOCAL_EVAL\s*:\s*([^#\]\s]+)#\]/i);
        const typeMatch = comment.match(/\[#(BRILLIANT|GREAT|BOOK|BEST|EXCELLENT|GOOD|INACCURACY|MISTAKE|MISS|BLUNDER)#\]/i);
        if (!evalMatch && !localEvalMatch && !typeMatch) return null;
        const evaluationText = localEvalMatch?.[1] || evalMatch?.[1] || null;
        return {
            evaluation: parseEval(evaluationText),
            rawEvaluation: evaluationText,
            type: typeMatch ? typeMatch[1].toUpperCase() : null,
        };
    }

    function appendMoveToken(rawToken, moves) {
        let token = rawToken.replace(/^\d+\.(?:\.\.)?/, '').replace(/^\.\.\./, '').trim();
        token = token.replace(/\$\d+$/, '').replace(/[!?]+$/, '');
        if (!token || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(token) || !/^[a-hKQRBNO]/.test(token)) return;
        moves.push({ san: token, evaluation: null, rawEvaluation: null, type: null });
    }

    function parsePgn(pgn) {
        const headers = parseHeaders(pgn);
        const body = pgn.replace(/^\[[^\n]*\]\s*$/gm, '');
        const moves = [];
        let index = 0;
        let variationDepth = 0;
        let lastMoveIndex = -1;
        while (index < body.length) {
            const char = body[index];
            if (char === '{') {
                const end = body.indexOf('}', index + 1);
                const metadata = parseMetadata(body.slice(index + 1, end === -1 ? body.length : end));
                if (variationDepth === 0 && lastMoveIndex >= 0 && metadata) Object.assign(moves[lastMoveIndex], metadata);
                index = end === -1 ? body.length : end + 1;
            } else if (char === '(') {
                variationDepth += 1;
                index += 1;
            } else if (char === ')') {
                variationDepth = Math.max(0, variationDepth - 1);
                index += 1;
            } else if (/\s/.test(char)) {
                index += 1;
            } else {
                const start = index;
                while (index < body.length && !/[\s{}()]/.test(body[index])) index += 1;
                if (variationDepth === 0) {
                    const lengthBefore = moves.length;
                    appendMoveToken(body.slice(start, index), moves);
                    if (moves.length > lengthBefore) lastMoveIndex = moves.length - 1;
                }
            }
        }
        return { headers, moves };
    }

    function getMoveNodes() {
        const selectors = [
            '.analyse__moves move:not(.empty)', '.analyse__moves u8:not(.empty)',
            '.study__moves move:not(.empty)', '.study__moves u8:not(.empty)',
            '.gamebook move:not(.empty)', '.gamebook u8:not(.empty)',
        ];
        return [...new Set([...document.querySelectorAll(selectors.join(','))])];
    }

    function normalizeSan(san) {
        return (san || '').replace(/\s/g, '').replace(/[!?]+$/g, '');
    }

    function getMainlineMoveNodes() {
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

    function readDomEvaluation(node) {
        const evaluationNode = node.querySelector('eval, e');
        if (!evaluationNode) return null;
        return parseEval(evaluationNode.textContent.trim());
    }

    function hideVisibleMetadata() {
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
    }

    const BOOK_SVG = '<svg style="width: 0.85em; height: 0.85em;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M96 0C43 0 0 43 0 96V416c0 53 43 96 96 96H384h32c17.7 0 32-14.3 32-32s-14.3-32-32-32V384c17.7 0 32-14.3 32-32V32c0-17.7-14.3-32-32-32H384 96zm0 384H352v64H96c-17.7 0-32-14.3-32-32s14.3-32 32-32zm32-240c0-8.8 7.2-16 16-16H336c8.8 0 16 7.2 16 16s-7.2 16-16 16H144c-8.8 0-16-7.2-16-16zm16 48H336c8.8 0 16 7.2 16 16s-7.2 16-16 16H144c-8.8 0-16-7.2-16-16s7.2-16 16-16z"/></svg>';

    function setMoveGlyph(node, type) {
        node.querySelectorAll('.custom-move-glyph').forEach((glyph) => glyph.remove());
        node.querySelectorAll('.local-analysis-native-hidden').forEach((glyph) => {
            glyph.style.display = '';
            glyph.classList.remove('local-analysis-native-hidden');
        });
        node.removeAttribute('data-local-analysis-type');
        node.style.removeProperty('--local-move-color');
        if (!type || !MOVE_TYPES[type]) return;
        const definition = MOVE_TYPES[type];
        node.querySelectorAll('glyph:not(.custom-move-glyph)').forEach((glyph) => {
            glyph.style.display = 'none';
            glyph.classList.add('local-analysis-native-hidden');
        });
        const glyph = document.createElement('glyph');
        glyph.className = 'custom-move-glyph';
        glyph.dataset.glyphType = type.toLowerCase();
        glyph.dataset.color = definition.color;
        glyph.title = definition.label;
        node.style.setProperty('--local-move-color', definition.color);
        if (type === 'BOOK') glyph.innerHTML = BOOK_SVG;
        else glyph.textContent = definition.symbol;
        const moveText = node.querySelector('san, kw') || node;
        moveText.insertAdjacentElement('afterend', glyph);
        node.dataset.localAnalysisType = type.toLowerCase();
    }

    function activateMove(index) {
        const node = getMainlineMoveNodes().find((item) => item.index === index)?.node;
        if (!node) return;
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try {
            node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
            node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        } catch (_) { }
        node.click();
        setTimeout(() => {
            updateActivePoint();
            syncBoardGlyph();
        }, 80);
    }

    function svgElement(name, attributes = {}) {
        const element = document.createElementNS(SVG_NS, name);
        Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
        return element;
    }

    function createChart(moves) {
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

    function createSummary(data) {
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
                row.className = 'custom-move-stat advice-summary__error local-analysis-count';
                row.style.color = MOVE_TYPES[type].color;
                row.title = 'Haz clic para ir a esta jugada';
                const label = document.createElement('span');
                label.textContent = MOVE_TYPES[type].label;
                const value = document.createElement('span');
                value.textContent = String(count);
                row.append(label, value);
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

    function activateCategory(sideIndex, type) {
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

    function renderPanel(data) {
        const studyMessage = document.querySelector('.study__message');
        if (!studyMessage) return false;
        let chartPanel = document.getElementById('local-analysis-chart-panel');
        if (!chartPanel) {
            chartPanel = document.createElement('section');
            chartPanel.id = 'local-analysis-chart-panel';
        }
        const title = document.createElement('div');
        title.className = 'local-analysis-title';
        const heading = document.createElement('strong');
        heading.textContent = 'Análisis local de Stockfish';
        chartPanel.replaceChildren(title, createChart(data.moves));

        let status = document.getElementById('local-analysis-status');
        if (!status) {
            status = document.createElement('div');
            status.id = 'local-analysis-status';
        }
        status.innerHTML = '<br>Esta partida ya está analizada localmente con STOCKFISH.<br>No hace falta solicitar el análisis del ordenador de más abajo.<br>';

        studyMessage.prepend(chartPanel);
        chartPanel.insertAdjacentElement('afterend', status);

        const training = document.querySelector('.analyse__round-training');
        let summaryPanel = document.getElementById('local-analysis-summary-panel');
        if (!summaryPanel) {
            summaryPanel = document.createElement('section');
            summaryPanel.id = 'local-analysis-summary-panel';
        }
        summaryPanel.replaceChildren(createSummary(data));
        if (training) training.appendChild(summaryPanel);
        else chartPanel.appendChild(summaryPanel);
        return true;
    }

    function getDestSquareFromSan(san, moveColor) {
        const clean = san?.replace(/[+#!?]/g, '').trim();
        if (!clean) return null;
        if (clean === 'O-O') return moveColor === 'white' ? 'g1' : 'g8';
        if (clean === 'O-O-O') return moveColor === 'white' ? 'c1' : 'c8';
        const match = clean.match(/([a-h][1-8])(?:=[QRBN])?$/);
        return match ? match[1] : null;
    }

    function squareToTransform(square, isFlipped) {
        const file = square.charCodeAt(0) - 97;
        const rank = Number(square[1]) - 1;
        const x = isFlipped ? 7 - file : file;
        const y = isFlipped ? rank : 7 - rank;
        return `translate(${x * 100}%, ${y * 100}%)`;
    }

    function syncBoardGlyph() {
        const board = document.querySelector('cg-board');
        if (!board || !state.data) return;
        board.querySelectorAll('.local-board-glyph').forEach((glyph) => glyph.remove());
        board.querySelectorAll('glyph').forEach((glyph) => { glyph.style.display = ''; });
        const activeEntry = getMainlineMoveNodes().find((item) => item.node.classList.contains('active'));
        const activeIndex = activeEntry?.index;
        const move = state.data.moves[activeIndex];
        if (!move || !MOVE_TYPES[move.type]) return;
        const destination = getDestSquareFromSan(move.san, activeIndex % 2 === 0 ? 'white' : 'black');
        if (!destination) return;
        board.querySelectorAll('glyph').forEach((glyph) => { glyph.style.display = 'none'; });
        const isFlipped = document.querySelector('.cg-wrap')?.classList.contains('orientation-black');
        const marker = document.createElement('div');
        marker.className = 'local-board-glyph';
        Object.assign(marker.style, {
            left: '0', position: 'absolute', top: '0', transform: squareToTransform(destination, isFlipped), width: '12.5%', height: '12.5%',
            zIndex: '10', pointerEvents: 'none',
        });
        const bubble = document.createElement('div');
        Object.assign(bubble.style, {
            alignItems: 'center', backgroundColor: MOVE_TYPES[move.type].color, borderRadius: '50%',
            color: 'white', display: 'flex', fontFamily: '"Noto Sans", sans-serif', fontSize: 'clamp(11px, 2.2vw, 29px)', fontWeight: 'bold',
            height: '40%', justifyContent: 'center', position: 'absolute', right: '-11%', top: '-11%', width: '40%', zIndex: '11',
        });
        if (move.type === 'BOOK') {
            bubble.innerHTML = BOOK_SVG;
            bubble.querySelector('svg')?.setAttribute('style', 'fill:white;height:68%;width:68%;');
        } else {
            bubble.textContent = MOVE_TYPES[move.type].symbol;
        }
        marker.appendChild(bubble);
        board.appendChild(marker);
    }

    function updateActivePoint() {
        const activeIndex = getMainlineMoveNodes().find((item) => item.node.classList.contains('active'))?.index;
        document.querySelectorAll('.local-analysis-point').forEach((point) => {
            point.classList.toggle('is-active', Number(point.dataset.moveIndex) === activeIndex);
        });
        syncBoardGlyph();
    }

    let moveListObserver = null;
    let observedMoveList = null;

    function setupBoardSync() {
        const moveList = document.querySelector('.analyse__moves, .study__moves, .gamebook, rmoves, l4x, .tview2');
        if (!moveList || moveList === observedMoveList) return;
        moveListObserver?.disconnect();
        observedMoveList = moveList;
        moveListObserver = new MutationObserver((mutations) => {
            if (mutations.some((mutation) => mutation.type === 'attributes' && /^(MOVE|U8)$/.test(mutation.target.tagName))) {
                setTimeout(updateActivePoint, 50);
            }
        });
        moveListObserver.observe(moveList, { attributes: true, attributeFilter: ['class'], subtree: true });
    }

    function syncWithDom(attempt = 0) {
        if (!state.data) return;
        const nodes = getMoveNodes();
        if (!nodes.length) {
            if (attempt < 12) setTimeout(() => syncWithDom(attempt + 1), 500);
            return;
        }
        nodes.forEach((node) => setMoveGlyph(node, null));
        getMainlineMoveNodes().forEach(({ node, index }) => {
            const move = state.data.moves[index];
            if (move && !Number.isFinite(move.evaluation)) {
                const domEvaluation = readDomEvaluation(node);
                if (Number.isFinite(domEvaluation)) {
                    move.evaluation = domEvaluation;
                    move.rawEvaluation = node.querySelector('eval, e')?.textContent.trim() || String(domEvaluation);
                }
            }
            setMoveGlyph(node, move?.type);
        });
        hideVisibleMetadata();
        if (!renderPanel(state.data) && attempt < 12) setTimeout(() => syncWithDom(attempt + 1), 500);
        setupBoardSync();
        updateActivePoint();
    }

    let actionsPerformed = false;
    function performInitialActions(attempt = 0) {
        const closeButton = document.querySelector('button.close-button[aria-label="Cerrar"]');
        if (closeButton) {
            closeButton.click();
        }

        const serverEvalTab = document.querySelector('button.serverEval');
        if (serverEvalTab) {
            if (!serverEvalTab.classList.contains('active')) {
                serverEvalTab.click();
            }
            actionsPerformed = true;
        } else if (attempt < 15) {
            setTimeout(() => performInitialActions(attempt + 1), 500);
        }
    }

    async function refresh() {
        const path = location.pathname;
        try {
            const url = `${location.origin}${path.replace(/\/$/, '')}.pgn`;
            const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/x-chess-pgn' } });
            if (!response.ok) throw new Error(`PGN no disponible (${response.status})`);
            state.path = path;
            state.data = parsePgn(await response.text());
            state.statCycles.clear();
            if (!state.data.moves.some((move) => move.type || Number.isFinite(move.evaluation))) {
                console.warn('[Análisis local] El PGN no contiene [%eval] ni [#TIPO#].');
            }
            syncWithDom();
            actionsPerformed = false;
            performInitialActions();
        } catch (error) {
            console.warn('[Análisis local] No se pudo cargar el PGN del estudio.', error);
        }
    }

    injectStyles();
    refresh();
    setInterval(() => {
        if (location.pathname !== state.path) refresh();
        else updateActivePoint();
    }, 800);
})();
