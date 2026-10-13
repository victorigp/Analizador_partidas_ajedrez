// Manejo de peticiones al servidor local, comprobación de Gemini y bucle de polling

import { localFetch } from '../utils/network.js';
import { setLichessCookie } from '../utils/storage.js';
import { eyeOpenSvg, eyeClosedSvg } from '../ui/svgs.js';

export async function sendInput(val, serverPort, progressView) {
    try {
        await localFetch(`http://127.0.0.1:${serverPort}/input`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: val })
        });
        if (progressView) {
            const progInteractive = progressView.querySelector('#progress-interactive');
            const progSpinner = progressView.querySelector('#progress-spinner-container');
            const progText = progressView.querySelector('#progress-text');
            if (progInteractive) progInteractive.style.display = 'none';
            if (progSpinner) progSpinner.style.display = 'flex';
            if (progText) progText.textContent = 'Reanudando proceso...';
        }
    } catch (err) {
        // Ignorar o registrar error de envío de entrada
    }
}

export async function checkModelStatus(selectEl, statusEl, apiKey) {
    if (!selectEl || !statusEl) return;
    const modelName = selectEl.value;
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
            body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] })
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
}

export async function loadModels(apiKey, modelSelect, savedModel, statusEl) {
    if (!modelSelect) return;
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

            data.models.forEach((m) => {
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

            let modelToSelect = savedModel;
            const optionValues = Array.from(modelSelect.options).map((o) => o.value);

            if (!modelToSelect || !optionValues.includes(modelToSelect)) {
                modelToSelect = hasFlashLite ? 'gemini-flash-lite-latest' : optionValues[0];
            }
            modelSelect.value = modelToSelect;
            if (statusEl) checkModelStatus(modelSelect, statusEl, apiKey);
        } else {
            modelSelect.innerHTML = '<option value="">Error cargando modelos</option>';
        }
    } catch (e) {
        modelSelect.innerHTML = '<option value="">Error conexión API</option>';
    }
}

export function startStatusPolling({
    serverPort,
    progressView,
    mainView,
    getApiKey,
    onReturnToMainMenu
}) {
    const progText = progressView.querySelector('#progress-text');
    const progSubtext = progressView.querySelector('#progress-subtext');
    const progInteractive = progressView.querySelector('#progress-interactive');
    const progSpinner = progressView.querySelector('#progress-spinner-container');
    const progQuestion = progressView.querySelector('#progress-question');

    // Reset estado por si es reintento
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
    const processStartTime = Date.now();
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

    const stepTimerInterval = setInterval(updateTimerText, 1000);

    let pollFailures = 0;
    let lastLogCount = 0;
    let hasConnected = false;
    let isSuccess = false;
    let lastPollError = '';
    let lastErrorLog = '';

    const cleanup = () => {
        clearInterval(stepTimerInterval);
        clearInterval(pollInterval);
    };

    const formatTotalTime = (ms) => {
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    };

    const showFinalResult = (success, connectionError = false) => {
        cleanup();
        progSpinner.style.display = 'none';
        progInteractive.style.display = 'flex';
        const totalTimeStr = formatTotalTime(Date.now() - processStartTime);
        const timeHtml = `<span style="color:#888; font-size:13px; font-weight:normal; margin-top:8px; display:inline-block;">Tiempo total: ${totalTimeStr}</span>`;

        if (success) {
            progInteractive.innerHTML = `<div style="color: #81b64c; font-weight: bold; text-align: center; font-size: 16px;">✓ ¡Análisis completado con éxito!<br><span style="color:#aaa; font-size:13px; font-weight:normal; margin-top:8px; display:inline-block;">El estudio se ha abierto en una nueva pestaña de Lichess.</span><br>${timeHtml}</div>`;
        } else if (connectionError) {
            progInteractive.innerHTML = `<div style="color: #d8504f; font-weight: bold; text-align: center; line-height: 1.4;">No se pudo conectar con el servidor local en el puerto ${serverPort || 'desconocido'}.<br><span style="color: #aaa; font-size: 13px; font-weight: normal; margin-top: 6px; display: inline-block;">${lastPollError ? 'Detalle: ' + lastPollError + '<br>' : ''}Verifica que el puerto coincida y que no esté bloqueado.</span><br>${timeHtml}<br><button id="btn-volver-menu" style="background-color: #3b82f6; color: #fff; border: none; padding: 8px 20px; border-radius: 6px; font-weight: bold; margin-top: 15px; cursor: pointer;">VOLVER AL MENÚ</button></div>`;
            progInteractive.querySelector('#btn-volver-menu')?.addEventListener('click', onReturnToMainMenu);
        } else {
            const errorToShow = lastErrorLog || progSubtext.textContent || (currentStepBaseText ? `El proceso se detuvo inesperadamente durante: ${currentStepBaseText}` : '');
            const errorDetail = errorToShow ? `<br><span style="color: #f59e0b; font-size: 13px; font-weight: normal; margin-top: 8px; display: inline-block; max-width: 90%; word-break: break-word;">${errorToShow}</span>` : '';
            progInteractive.innerHTML = `<div style="color: #d8504f; font-weight: bold; text-align: center; line-height: 1.4;">Error en el proceso.${errorDetail}<br>${timeHtml}<br><button id="btn-volver-menu" style="background-color: #3b82f6; color: #fff; border: none; padding: 8px 20px; border-radius: 6px; font-weight: bold; margin-top: 15px; cursor: pointer;">VOLVER AL MENÚ</button></div>`;
            progInteractive.querySelector('#btn-volver-menu')?.addEventListener('click', onReturnToMainMenu);
        }
    };

    const pollInterval = setInterval(async () => {
        try {
            const res = await localFetch(`http://127.0.0.1:${serverPort}/status`);
            if (res.ok) {
                const data = await res.json();
                if (data.logs && data.logs.length > lastLogCount) {
                    const newLogs = data.logs.slice(lastLogCount);
                    lastLogCount = data.logs.length;

                    for (const log of newLogs) {
                        if (log.includes('PASO 1:')) { currentStepBaseText = 'Extrayendo PGN de la partida...'; currentStepStartTime = Date.now(); progSubtext.textContent = ''; updateTimerText(); }
                        else if (log.includes('PASO 2:')) { currentStepBaseText = 'Analizando movimientos con Stockfish...'; currentStepStartTime = Date.now(); progSubtext.textContent = ''; updateTimerText(); }
                        else if (log.includes('Analizando jugada')) {
                            const match = log.match(/jugada\s+(\d+\/\d+)/);
                            if (match) currentMove = match[1];
                            updateTimerText();
                        }
                        else if (log.includes('PASO 3:')) { currentStepBaseText = 'Generando comentarios con IA...'; currentStepStartTime = Date.now(); progSubtext.textContent = ''; updateTimerText(); }
                        else if (log.includes('PASO 4:')) { currentStepBaseText = 'Creando estudio interactivo...'; currentStepStartTime = Date.now(); progSubtext.textContent = ''; updateTimerText(); }
                        else if (log.includes('¡Estudio completado con exito!') || log.includes('Estudio creado correctamente:')) { isSuccess = true; }
                        else if (log.includes('[Error]')) { lastErrorLog = log.trim(); progSubtext.textContent = lastErrorLog; progSubtext.style.color = '#d8504f'; }
                        else if (log.includes('[Aviso]')) { progSubtext.textContent = log.trim(); progSubtext.style.color = '#f59e0b'; }
                        else if (log.includes('[WEB_INPUT_REQUIRED]')) {
                            progSpinner.style.display = 'none';
                            progInteractive.style.display = 'flex';

                            const promptText = log.split('[WEB_INPUT_REQUIRED]')[1].trim();

                            const btnGroup = progressView.querySelector('#progress-buttons');
                            const inputForm = progressView.querySelector('#prog-input-form');
                            const inputEl = progressView.querySelector('#prog-input');
                            let manualCookieView = progressView.querySelector('#manual-cookie-view');

                            btnGroup.style.display = 'none';
                            inputForm.style.display = 'none';
                            if (manualCookieView) manualCookieView.style.display = 'none';

                            if (promptText.includes('[MODEL_SELECTION]')) {
                                const lastErrorMsg = progSubtext.textContent || 'La IA no pudo procesar la solicitud.';
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

                                const apiKey = getApiKey ? getApiKey() : null;
                                newSelect.addEventListener('change', () => checkModelStatus(newSelect, progModelStatus, apiKey));
                                checkModelStatus(newSelect, progModelStatus, apiKey);

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
                                        localFetch(`http://127.0.0.1:${serverPort}/input`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ input: action })
                                        }).catch(() => { });
                                        if (action === 'SALIR') {
                                            progressView.style.left = '100%';
                                            mainView.style.transform = 'translateX(0)';
                                            cleanup();
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
                                    localFetch(`http://127.0.0.1:${serverPort}/input`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ input: newSelect.value })
                                    }).catch(() => { });
                                    progInteractive.style.display = 'none';
                                    progSpinner.style.display = 'flex';
                                    progSubtext.textContent = '';
                                };
                                btnRow.appendChild(btnReintentar);

                                modelContainer.appendChild(comboRow);
                                modelContainer.appendChild(btnRow);
                                progInteractive.appendChild(modelContainer);
                            } else if (promptText.includes('[MANUAL_COOKIE]')) {
                                progQuestion.textContent = '';
                                progQuestion.style.display = 'none';
                                if (!manualCookieView) {
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

                                    manualCookieView.querySelector('#mc-eye').onclick = () => {
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

                                    manualCookieView.querySelector('#mc-btn-volver').onclick = () => sendInput('volver', serverPort, progressView);

                                    manualCookieView.querySelector('#mc-form').onsubmit = (e) => {
                                        e.preventDefault();
                                        const val = manualCookieView.querySelector('#mc-input').value.trim();
                                        if (val) {
                                            setLichessCookie(val);
                                            const modalCookieInput = document.getElementById('modal-lichess-cookie');
                                            if (modalCookieInput) modalCookieInput.value = val;

                                            sendInput(val, serverPort, progressView);
                                        }
                                    };
                                }
                                manualCookieView.style.display = 'flex';
                                manualCookieView.querySelector('#mc-input').value = '';
                                setTimeout(() => manualCookieView.querySelector('#mc-input').focus(), 50);
                            } else if (promptText.includes('(S/N)')) {
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
                hasConnected = true;
                pollFailures = 0;

                if (data.done) {
                    showFinalResult(isSuccess);
                    return;
                }
            } else {
                pollFailures++;
                if (!hasConnected) {
                    progSubtext.textContent = `Conectando con http://127.0.0.1:${serverPort} (${pollFailures}/40)...`;
                }
            }
        } catch (e) {
            lastPollError = (e && e.message) ? e.message : String(e);
            pollFailures++;
            if (!hasConnected) {
                progSubtext.textContent = `Conectando con http://127.0.0.1:${serverPort} (${pollFailures}/40)...`;
            }
        }

        const maxFailures = hasConnected ? 10 : 40;
        if (pollFailures > maxFailures) {
            showFinalResult(isSuccess, !hasConnected);
        }
    }, 500);

    return {
        stop: cleanup
    };
}
