// Vista de configuración y gestión de claves/parámetros

import { eyeOpenSvg, eyeClosedSvg, backSvg } from '../ui/svgs.js';
import { inputStyle } from '../utils/helpers.js';
import { clearSaved } from '../utils/storage.js';

export function createSettingsView({
    p_threads,
    p_hash,
    p_player,
    p_port,
    p_explorer,
    lichess_token,
    lichess_cookie,
    gemini_keys,
    onBack,
    onSave,
    onClear
}) {
    const settingsView = document.createElement('div');
    Object.assign(settingsView.style, {
        padding: '30px 0 0 30px', position: 'absolute', top: '0', left: '100%',
        width: '100%', height: '100%', boxSizing: 'border-box',
        backgroundColor: '#262421', transition: 'left 0.3s ease',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
    });

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
                ${backSvg}
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
            <div style="margin-bottom: 15px;">
                <label style="font-weight: bold; color: #fff;">Puerto Servidor Local:</label>
                <input type="number" id="modal-port" min="1024" max="65535" value="${p_port}" style="${inputStyle}">
            </div>
            <div style="margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between;">
                <label style="font-weight: bold; color: #fff;">Explorador de aperturas (Lichess):</label>
                <input type="checkbox" id="modal-explorer" ${p_explorer === 'true' || p_explorer === true ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;">
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

    // Eventos y manejadores de Settings
    const backBtn = settingsView.querySelector('#modal-back');
    backBtn.onmouseenter = () => backBtn.querySelector('svg').style.stroke = '#fff';
    backBtn.onmouseleave = () => backBtn.querySelector('svg').style.stroke = '#bababa';
    backBtn.onclick = () => {
        if (onBack) onBack();
    };

    // Toggle ojos para inputs tipo password y botones de info
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
            const btn = settingsView.querySelector('#add-gemini-btn');
            const container = settingsView.querySelector('#gemini-keys-container');
            const rows = container.querySelectorAll('.gemini-key-row');
            if (rows.length < 10) {
                const newRow = document.createElement('div');
                newRow.className = 'gemini-key-row';
                newRow.style = 'position: relative; margin-top: 5px; display: flex; align-items: center;';
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
            const btn = settingsView.querySelector('#add-gemini-btn');
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
        }
    });

    // Reacciones visuales a botones dinámicos
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

    // Botón LIMPIAR
    const clearBtn = settingsView.querySelector('#modal-clear');
    clearBtn.onclick = () => {
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

        ['confirm-no', 'confirm-yes'].forEach((id) => {
            const btn = confirmOverlay.querySelector(`#${id}`);
            btn.onmousedown = () => btn.style.transform = 'translateY(2px)';
            btn.onmouseup = () => btn.style.transform = 'translateY(0)';
            btn.onmouseleave = () => btn.style.transform = 'translateY(0)';
        });

        confirmOverlay.querySelector('#confirm-no').onclick = () => confirmOverlay.remove();
        confirmOverlay.querySelector('#confirm-yes').onclick = () => {
            clearSaved('agy_');

            settingsView.querySelector('#modal-threads').value = 1;
            settingsView.querySelector('#modal-hash').value = 512;
            settingsView.querySelector('#modal-port').value = 8765;
            settingsView.querySelector('#modal-player').value = '';
            settingsView.querySelector('#modal-lichess-token').value = '';
            settingsView.querySelector('#modal-lichess-cookie').value = '';

            const depthEl = document.getElementById('modal-depth');
            const depthValEl = document.getElementById('modal-depth-val');
            if (depthEl) depthEl.value = 18;
            if (depthValEl) depthValEl.textContent = '18';

            const container = settingsView.querySelector('#gemini-keys-container');
            if (container) {
                const rows = container.querySelectorAll('.gemini-key-row');
                rows.forEach((row, idx) => {
                    if (idx === 0) row.querySelector('input').value = '';
                    else row.remove();
                });
                const addBtn = settingsView.querySelector('#add-gemini-btn');
                if (addBtn) {
                    addBtn.disabled = false;
                    addBtn.style.opacity = '1';
                    addBtn.style.cursor = 'pointer';
                }
            }

            confirmOverlay.remove();
            if (onClear) onClear();
        };
    };

    // Botón GUARDAR
    const saveBtn = settingsView.querySelector('#modal-save');
    saveBtn.onclick = () => {
        if (onSave) onSave();
    };

    return settingsView;
}
