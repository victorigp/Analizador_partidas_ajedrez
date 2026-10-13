// Vista de progreso e interacción durante el análisis

export function createProgressView({ onReturnToMainMenu, onSendInput }) {
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

    // Botones SÍ / NO y formulario de texto interactivo
    progressView.querySelector('#btn-yes').addEventListener('click', () => {
        if (onSendInput) onSendInput('s');
    });

    progressView.querySelector('#btn-no').addEventListener('click', async () => {
        const qText = progressView.querySelector('#progress-question')?.textContent || '';
        if (onSendInput) await onSendInput('n');
        if (qText.toLowerCase().includes('reintentar')) {
            if (onReturnToMainMenu) onReturnToMainMenu();
        }
    });

    progressView.querySelector('#prog-input-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const textInput = progressView.querySelector('#prog-input');
        if (textInput.value) {
            if (onSendInput) onSendInput(textInput.value);
            textInput.value = '';
        }
    });

    // Reacción visual al click
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

    // Ocultar formulario por defecto tras inyectar el HTML
    progressView.querySelector('#prog-input-form').style.display = 'none';

    return progressView;
}
