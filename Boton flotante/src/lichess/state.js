// Estado compartido para la interfaz de análisis de Lichess

export const state = {
    path: '',
    data: null,
    statCycles: new Map()
};

export const runtime = {
    actionsPerformed: false,
    moveListObserver: null,
    observedMoveList: null,
    moveListSyncTimer: null,
    underboardObserver: null,
    observedUnderboard: null,
    tabClickListenerAttached: false
};
