// Botón flotante para Chess.com y orquestador del modal

import { getSaved, setSaved, removeSaved, getLichessCookie, setLichessCookie } from '../utils/storage.js';
import { inputStyle, getServerPort } from '../utils/helpers.js';
import { localFetch } from '../utils/network.js';
import { gearSvg } from '../ui/svgs.js';
import { getChessComPGN } from './pgnExtractor.js';
import { createSettingsView } from '../modal/settings.js';
import { createProgressView } from '../modal/progress.js';
import { checkModelStatus, loadModels, startStatusPolling, sendInput } from '../modal/interactive.js';

export function createFloatingButton() {
    const currentUrl = window.location.href;
    const isChessCom = currentUrl.includes('chess.com/game/') ||
        currentUrl.includes('chess.com/games/') ||
        currentUrl.includes('chess.com/analysis/') ||
        currentUrl.includes('chess.com/play/') ||
        currentUrl.includes('chess.com/live/');

    if (!isChessCom) return;

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

        // Cargar configuración guardada
        const topPlayerEl = document.querySelector('.board-layout-top [data-test-element="user-tagline-username"]');
        const bottomPlayerEl = document.querySelector('.board-layout-bottom [data-test-element="user-tagline-username"]');
        const whitePlayer = topPlayerEl?.textContent?.trim() || '';
        const blackPlayer = bottomPlayerEl?.textContent?.trim() || '';
        const playerArray = [whitePlayer, blackPlayer].filter((p) => p);

        let p_player = getSaved('chesscom_player', '');
        let p_depth = getSaved('stockfish_depth', '18');
        let p_model = getSaved('gemini_model', 'gemini-flash-lite-latest');
        let p_threads = getSaved('stockfish_threads', '1');
        let p_hash = getSaved('stockfish_hash', '512');
        let p_port = getSaved('server_port', '8765');
        let p_explorer = getSaved('opening_explorer_enabled', 'true');

        let lichess_token = getSaved('lichess_token', '');
        let lichess_cookie = getLichessCookie('');

        let gemini_keys = [];
        for (let i = 0; i <= 10; i++) {
            let keyName = i === 0 ? 'gemini_api_key' : `gemini_api_key_${i}`;
            let keyVal = getSaved(keyName, '');
            if (keyVal) gemini_keys.push(keyVal);
        }
        if (gemini_keys.length === 0) gemini_keys.push('');

        let defaultTarget = whitePlayer;
        if (p_player && playerArray.includes(p_player)) {
            defaultTarget = p_player;
        }

        // Overlay del modal
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

        let pollingController = null;

        const closeBtn = document.createElement('div');
        closeBtn.innerHTML = '✖';
        Object.assign(closeBtn.style, {
            position: 'absolute', top: '15px', right: '15px', cursor: 'pointer',
            fontSize: '18px', color: '#888', transition: 'color 0.2s', zIndex: '20'
        });
        closeBtn.onmouseenter = () => closeBtn.style.color = '#fff';
        closeBtn.onmouseleave = () => closeBtn.style.color = '#888';
        closeBtn.onclick = () => {
            if (pollingController) pollingController.stop();
            overlay.remove();
            localFetch(`http://127.0.0.1:${getServerPort(p_port)}/exit`, { method: 'POST' }).catch(() => { });
        };

        // Vista principal
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
                    ${playerArray.map((p) => `<option value="${p}" ${p === defaultTarget ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between;">
                    <label style="font-weight: bold; color: #fff;">Profundidad de Stockfish:</label>
                    <span id="modal-depth-val" style="color: #fff; font-weight: bold;">${p_depth}</span>
                </div>
                <input type="range" id="modal-depth" min="1" max="100" value="${p_depth}" style="width: 100%; margin-top: 10px; cursor: pointer;">
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
                    ${gearSvg}
                </div>
            </div>
        `;

        const returnToMainMenu = () => {
            if (pollingController) pollingController.stop();
            mainView.style.transform = 'translateX(0)';
            progressView.style.left = '100%';
        };

        // Crear vista de configuración
        const settingsView = createSettingsView({
            p_threads,
            p_hash,
            p_player,
            p_port,
            p_explorer,
            lichess_token,
            lichess_cookie,
            gemini_keys,
            onBack: () => {
                mainView.style.transform = 'translateX(0)';
                settingsView.style.left = '100%';
            },
            onClear: () => {
                p_port = '8765';
                p_explorer = 'true';
            },
            onSave: () => {
                const newPlayer = settingsView.querySelector('#modal-player').value.trim();
                const depth = document.getElementById('modal-depth').value;
                const model = document.getElementById('modal-model').value;

                setSaved('stockfish_depth', depth);
                setSaved('gemini_model', model);
                if (newPlayer) {
                    setSaved('chesscom_player', newPlayer);
                } else {
                    removeSaved('chesscom_player');
                }

                setSaved('stockfish_threads', settingsView.querySelector('#modal-threads').value);
                setSaved('stockfish_hash', settingsView.querySelector('#modal-hash').value);

                const savedPort = settingsView.querySelector('#modal-port') ? settingsView.querySelector('#modal-port').value.trim() : '8765';
                setSaved('server_port', savedPort);
                p_port = savedPort;

                const savedExplorer = settingsView.querySelector('#modal-explorer')?.checked ? 'true' : 'false';
                setSaved('opening_explorer_enabled', savedExplorer);
                p_explorer = savedExplorer;

                setSaved('lichess_token', settingsView.querySelector('#modal-lichess-token').value);

                const cookieVal = settingsView.querySelector('#modal-lichess-cookie').value;
                setLichessCookie(cookieVal);

                const keyRows = settingsView.querySelectorAll('.gemini-key-row input');
                let firstKey = '';
                for (let i = 0; i < 10; i++) {
                    removeSaved(i === 0 ? 'gemini_api_key' : `gemini_api_key_${i}`);
                }

                keyRows.forEach((input, index) => {
                    if (input.value) {
                        if (!firstKey) firstKey = input.value;
                        const k = index === 0 ? 'gemini_api_key' : `gemini_api_key_${index}`;
                        setSaved(k, input.value);
                    }
                });

                const targetSelect = document.getElementById('modal-target');
                if (newPlayer && Array.from(targetSelect.options).some((o) => o.value === newPlayer)) {
                    targetSelect.value = newPlayer;
                }

                loadModels(firstKey, document.getElementById('modal-model'), model, document.getElementById('modal-model-status'));

                mainView.style.transform = 'translateX(0)';
                settingsView.style.left = '100%';
            }
        });

        // Crear vista de progreso
        const progressView = createProgressView({
            onReturnToMainMenu: returnToMainMenu,
            onSendInput: (val) => sendInput(val, getServerPort(p_port), progressView)
        });

        modal.appendChild(closeBtn);
        modal.appendChild(mainView);
        modal.appendChild(settingsView);
        modal.appendChild(progressView);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Inicializar carga de modelos Gemini
        const initialKey = gemini_keys[0];
        const modalModelEl = document.getElementById('modal-model');
        const modalModelStatusEl = document.getElementById('modal-model-status');

        loadModels(initialKey, modalModelEl, p_model, modalModelStatusEl);

        if (modalModelEl && modalModelStatusEl) {
            modalModelEl.addEventListener('change', () => {
                const currentFirstKey = settingsView.querySelector('.gemini-key-row input')?.value || initialKey;
                checkModelStatus(modalModelEl, modalModelStatusEl, currentFirstKey);
            });
        }

        // Control del slider de profundidad
        const depthRange = document.getElementById('modal-depth');
        const depthVal = document.getElementById('modal-depth-val');
        depthRange.addEventListener('input', (e) => {
            depthVal.textContent = e.target.value;
        });

        // Transición con engranaje
        const gearBtn = document.getElementById('modal-gear');
        gearBtn.onmouseenter = () => gearBtn.querySelector('svg').style.stroke = '#fff';
        gearBtn.onmouseleave = () => gearBtn.querySelector('svg').style.stroke = '#bababa';
        gearBtn.onclick = () => {
            mainView.style.transform = 'translateX(-100%)';
            settingsView.style.left = '0';
        };

        // Animaciones de botones principales
        ['modal-start'].forEach((id) => {
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

        // Click en INICIAR
        document.getElementById('modal-start').onclick = async () => {
            const targetPlayer = document.getElementById('modal-target').value;
            const depth = document.getElementById('modal-depth').value;
            const model = document.getElementById('modal-model').value;
            const threads = settingsView.querySelector('#modal-threads').value;
            const hash = settingsView.querySelector('#modal-hash').value;
            const lichessToken = settingsView.querySelector('#modal-lichess-token').value;
            const lichessCookie = settingsView.querySelector('#modal-lichess-cookie').value;
            const apiKey = settingsView.querySelector('.gemini-key-row input').value;

            const currentPort = getServerPort(p_port);

            if (!targetPlayer || !depth || !model || model.startsWith('Error') || !threads || !hash || !currentPort || !lichessToken || !lichessCookie || !apiKey) {
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

            // Guardar configuración seleccionada
            setSaved('stockfish_depth', depth);
            setSaved('gemini_model', model);

            // Cambiar a vista de progreso
            mainView.style.transform = 'translateX(-100%)';
            progressView.style.left = '0';

            // Extraer PGN de Chess.com
            let pgn = null;
            let gameId = null;
            if (currentUrl.includes('chess.com/')) {
                gameId = window.location.pathname.split('/').pop();
                pgn = await getChessComPGN();
            }

            const configuredPlayer = settingsView.querySelector('#modal-player')?.value?.trim() || getSaved('chesscom_player', '');

            const configData = {
                CHESSCOM_PLAYER: configuredPlayer,
                TARGET_PLAYER: targetPlayer,
                STOCKFISH_DEPTH: depth,
                GEMINI_MODEL: model,
                STOCKFISH_THREADS: threads,
                STOCKFISH_HASH: hash,
                SERVER_PORT: currentPort,
                OPENING_EXPLORER_ENABLED: settingsView.querySelector('#modal-explorer')?.checked ? 'true' : 'false',
                LICHESS_TOKEN: lichessToken,
                LICHESS_COOKIE: lichessCookie
            };

            if (gameId) configData.CHESSCOM_GAME_ID = gameId;
            if (pgn) configData.PGN = pgn;

            const keyRows = settingsView.querySelectorAll('.gemini-key-row input');
            keyRows.forEach((input, index) => {
                if (input.value) {
                    const k = index === 0 ? 'GEMINI_API_KEY' : `GEMINI_API_KEY_${index}`;
                    configData[k] = input.value;
                }
            });

            // Codificar JSON a base64 seguro para URL
            const payloadBase64 = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(configData)))));
            const baseUrl = window.location.origin + window.location.pathname;
            const uri = `ajedrez://${baseUrl}?payload=${payloadBase64}`;

            const link = document.createElement('a');
            link.href = uri;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => link.remove(), 2000);

            // Iniciar bucle de polling
            const getFirstApiKey = () => settingsView.querySelector('.gemini-key-row input')?.value || '';
            pollingController = startStatusPolling({
                serverPort: currentPort,
                progressView,
                mainView,
                getApiKey: getFirstApiKey,
                onReturnToMainMenu: returnToMainMenu
            });
        };
    });

    document.body.appendChild(button);
}
