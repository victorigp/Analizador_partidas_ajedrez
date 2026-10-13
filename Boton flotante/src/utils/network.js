// Peticiones de red locales compatibles con TamperMonkey y navegadores
export const localFetch = (url, options = {}) => {
    return new Promise((resolve, reject) => {
        const gmXhr = (typeof GM_xmlhttpRequest !== 'undefined') ? GM_xmlhttpRequest :
            (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : null;
        if (gmXhr) {
            gmXhr({
                method: options.method || 'GET',
                url: url,
                headers: options.headers || {},
                data: options.body || undefined,
                timeout: 4000,
                onload: (res) => {
                    resolve({
                        ok: res.status >= 200 && res.status < 300,
                        status: res.status,
                        statusText: res.statusText,
                        text: () => Promise.resolve(res.responseText),
                        json: () => {
                            try {
                                return Promise.resolve(JSON.parse(res.responseText));
                            } catch (e) {
                                return Promise.reject(e);
                            }
                        }
                    });
                },
                onerror: (err) => reject(new Error(err && (err.error || err.statusText) ? (err.error || err.statusText) : 'Error de conexion GM')),
                ontimeout: () => reject(new Error('Timeout de conexion local'))
            });
        } else {
            fetch(url, options).then(resolve).catch(reject);
        }
    });
};
