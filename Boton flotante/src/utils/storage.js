// Utilidades de almacenamiento unificado para TamperMonkey y localStorage

export function getSaved(key, def) {
    const val = localStorage.getItem('agy_' + key);
    return val !== null ? val : def;
}

export function setSaved(key, val) {
    if (val === null || val === undefined) {
        localStorage.removeItem('agy_' + key);
    } else {
        localStorage.setItem('agy_' + key, val);
    }
}

export function removeSaved(key) {
    localStorage.removeItem('agy_' + key);
}

export function clearSaved(prefix = 'agy_') {
    Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(prefix)) {
            localStorage.removeItem(key);
        }
    });
}

export function getLichessCookie(defaultValue = '') {
    if (typeof GM_getValue !== 'undefined') {
        return GM_getValue('agy_lichess_cookie', getSaved('lichess_cookie', defaultValue));
    }
    return getSaved('lichess_cookie', defaultValue);
}

export function setLichessCookie(val) {
    if (typeof GM_setValue !== 'undefined') {
        GM_setValue('agy_lichess_cookie', val);
    }
    setSaved('lichess_cookie', val);
}
