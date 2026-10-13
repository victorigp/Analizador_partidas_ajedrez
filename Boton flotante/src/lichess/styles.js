// Inyección de estilos CSS para los componentes de análisis en Lichess

export function injectStyles() {
    let style = document.getElementById('local-analysis-styles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'local-analysis-styles';
        (document.head || document.documentElement).appendChild(style);
    }
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
        .local-analysis-count { align-items: center; cursor: pointer; display: flex; font-size: 1.15em; gap: 8px; justify-content: space-between; line-height: 1.45; padding: 2px 0; user-select: none; margin: 4px 0; }
        .local-analysis-count:hover { opacity: .8; }
        .local-analysis-count .stat-label { color: var(--c-font, inherit); font-weight: 500; min-width: 120px; }
        .local-analysis-count .stat-count { font-weight: bold; font-size: 1.1em; }
        .custom-move-badge { border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; box-sizing: border-box; }
        move[data-local-analysis-type], u8[data-local-analysis-type] { align-items: center !important; }
        glyph.custom-move-glyph { align-self: center !important; margin-top: auto !important; margin-bottom: auto !important; align-items: center; background: none !important; box-shadow: none !important; display: inline-flex !important; justify-content: center; margin-left: 4px !important; vertical-align: middle !important; box-sizing: border-box;}
        glyph.custom-move-glyph[data-glyph-type="book"], glyph.custom-move-glyph[data-glyph-type="best"], glyph.custom-move-glyph[data-glyph-type="excellent"], glyph.custom-move-glyph[data-glyph-type="good"], glyph.custom-move-glyph[data-glyph-type="miss"] {width: 16px; height: 16px;}
        glyph.custom-move-glyph[data-glyph-type="book"] svg, glyph.custom-move-glyph[data-glyph-type="best"] svg, glyph.custom-move-glyph[data-glyph-type="excellent"] svg, glyph.custom-move-glyph[data-glyph-type="good"] svg, glyph.custom-move-glyph[data-glyph-type="miss"] svg {width: 100% !important; height: 100% !important; fill: currentColor; display: block; transform: scale(1.65);}
        glyph.custom-move-glyph[data-glyph-type="brilliant"], glyph.custom-move-glyph[data-glyph-type="great"], glyph.custom-move-glyph[data-glyph-type="inaccuracy"], glyph.custom-move-glyph[data-glyph-type="mistake"], glyph.custom-move-glyph[data-glyph-type="blunder"] {font-family: 'Noto Sans', sans-serif; font-size: 18px !important; font-weight: bold; line-height: 1; align-self: center !important;}
        move[data-local-analysis-type].active san, u8[data-local-analysis-type].active kw, move[data-local-analysis-type].active .custom-move-glyph, u8[data-local-analysis-type].active .custom-move-glyph { color: white !important; fill: white !important; }
        move[data-local-analysis-type="brilliant"].active, u8[data-local-analysis-type="brilliant"].active { background-color: #26c2a3 !important; }
        move[data-local-analysis-type="great"].active, u8[data-local-analysis-type="great"].active { background-color: #749bbf !important; }
        move[data-local-analysis-type="book"].active, u8[data-local-analysis-type="book"].active { background-color: #d5a47d !important; }
        move[data-local-analysis-type="best"].active, u8[data-local-analysis-type="best"].active { background-color: #81b64c !important; }
        move[data-local-analysis-type="excellent"].active, u8[data-local-analysis-type="excellent"].active { background-color: #84a956 !important; }
        move[data-local-analysis-type="good"].active, u8[data-local-analysis-type="good"].active { background-color: #95b776 !important; }
        move[data-local-analysis-type="inaccuracy"].active, u8[data-local-analysis-type="inaccuracy"].active { background-color: #f7c631 !important; }
        move[data-local-analysis-type="mistake"].active, u8[data-local-analysis-type="mistake"].active { background-color: #ffa459 !important; }
        move[data-local-analysis-type="miss"].active, u8[data-local-analysis-type="miss"].active { background-color: #ff7769 !important; }
        move[data-local-analysis-type="blunder"].active, u8[data-local-analysis-type="blunder"].active { background-color: #fa412d !important; }
        move[data-local-analysis-type]:not(.active) san, u8[data-local-analysis-type]:not(.active) kw, move[data-local-analysis-type]:not(.active) .custom-move-glyph, u8[data-local-analysis-type]:not(.active) .custom-move-glyph { color: var(--local-move-color) !important; fill: var(--local-move-color) !important; }
        /* Ocultar glifos nativos del servidor de Lichess para evitar duplicación y superposición */
        glyph:not(.custom-move-glyph),
        move glyph:not(.custom-move-glyph),
        u8 glyph:not(.custom-move-glyph),
        .analyse__moves glyph:not(.custom-move-glyph),
        .study__moves glyph:not(.custom-move-glyph),
        .tview2 glyph:not(.custom-move-glyph),
        rmoves glyph:not(.custom-move-glyph),
        cg-board glyph,
        .cg-wrap glyph:not(.local-board-glyph) {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
        }
    `;
    (document.head || document.documentElement).appendChild(style);
}
