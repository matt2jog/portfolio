// Dev-only HMR capture for debugging Vite HMR "Internal Server Error" payloads
// This file is imported only in DEV mode from main.tsx

// Expose globals to collect HMR error payloads and page-level diagnostics
;(window as any).__hmrErrors = (window as any).__hmrErrors || [];
;(window as any).__pageErrors = (window as any).__pageErrors || [];

function persistArray(key: string, arr: any[]) {
  try { localStorage.setItem(key, JSON.stringify(arr.slice(-200))); } catch (e) { }
}

function pushHmr(item: any) {
  try { (window as any).__hmrErrors.push(item); persistArray('__hmrErrors', (window as any).__hmrErrors); } catch (e) { }
}
function pushPageError(item: any) {
  try { (window as any).__pageErrors.push(item); persistArray('__pageErrors', (window as any).__pageErrors); } catch (e) { }
}

// Try to salvage previously persisted errors on load
try {
  const prevH = JSON.parse(localStorage.getItem('__hmrErrors') || '[]');
  if (Array.isArray(prevH) && prevH.length) (window as any).__hmrErrors = prevH.concat((window as any).__hmrErrors || []);
} catch (e) {}
try {
  const prevP = JSON.parse(localStorage.getItem('__pageErrors') || '[]');
  if (Array.isArray(prevP) && prevP.length) (window as any).__pageErrors = prevP.concat((window as any).__pageErrors || []);
} catch (e) {}

// Wrap WebSocket to inspect HMR messages
(function wrapWebSocket() {
  const OriginalWebSocket = (window as any).WebSocket;
  if (!OriginalWebSocket || (OriginalWebSocket as any).__patchedForHMR) return;

  const NewWS = function(this: any, url: string, protocols?: any) {
    const ws = protocols ? new (OriginalWebSocket as any)(url, protocols) : new (OriginalWebSocket as any)(url);

    ws.addEventListener('message', (ev: any) => {
      try {
        const dataStr = ev && ev.data ? (typeof ev.data === 'string' ? ev.data : '') : '';
        if (dataStr && dataStr.toLowerCase().includes('error')) {
          try {
            const parsed = JSON.parse(dataStr);
            pushHmr({ at: Date.now(), kind: 'ws', url, raw: dataStr, parsed });
            console.warn('[hmr-capture] HMR message with error captured', parsed);
          } catch (e) {
            pushHmr({ at: Date.now(), kind: 'ws', url, raw: dataStr });
            console.warn('[hmr-capture] HMR text message with error captured', dataStr);
          }
        }
      } catch (e) {
        // ignore
      }
    });

    return ws;
  } as any;

  // preserve prototype and constants
  NewWS.prototype = OriginalWebSocket.prototype;
  (NewWS as any).CONNECTING = OriginalWebSocket.CONNECTING;
  (NewWS as any).OPEN = OriginalWebSocket.OPEN;
  (NewWS as any).CLOSING = OriginalWebSocket.CLOSING;
  (NewWS as any).CLOSED = OriginalWebSocket.CLOSED;
  (NewWS as any).__patchedForHMR = true;

  (window as any).WebSocket = NewWS;
})();

// Also wrap fetch to sniff HMR update responses that may embed stack traces
(function wrapFetch() {
  if ((window as any).__fetchPatchedForHMR) return;
  const origFetch = window.fetch.bind(window);

  window.fetch = async function(input: any, init?: any) {
    const resp = await origFetch(input, init);
    try {
      const url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (url && (url.includes('/@hmr') || url.includes('/@vite/'))) {
        const clone = resp.clone();
        const txt = await clone.text();
        if (txt && (txt.toLowerCase().includes('internal server error') || txt.toLowerCase().includes('stack') || txt.toLowerCase().includes('error'))) {
          pushHmr({ at: Date.now(), kind: 'fetch', url, snippet: txt.slice(0, 4000) });
          console.warn('[hmr-capture] fetched HMR payload with error for', url, txt.slice(0, 200));
        }
      }
    } catch (e) {
      // ignore fetch inspect errors
    }
    return resp;
  } as any;
  (window as any).__fetchPatchedForHMR = true;
})();

// Page-level error handlers
window.addEventListener('error', (ev: ErrorEvent) => {
  try {
    const info = { at: Date.now(), kind: 'error', message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno, stack: ev.error && ev.error.stack };
    pushPageError(info);
    console.warn('[hmr-capture] page error captured', info);
  } catch (e) { }
});
window.addEventListener('unhandledrejection', (ev: any) => {
  try {
    const info = { at: Date.now(), kind: 'unhandledrejection', reason: (ev && ev.reason) ? (typeof ev.reason === 'string' ? ev.reason : (ev.reason && ev.reason.stack) || '' ) : '' };
    pushPageError(info);
    console.warn('[hmr-capture] unhandled rejection captured', info);
  } catch (e) { }
});

// Hook console.error so we also capture important logs
(function wrapConsoleError(){
  const orig = console.error.bind(console);
  console.error = function(...args: any[]) {
    try { pushPageError({ at: Date.now(), kind: 'console.error', args: args.map(a => (typeof a === 'string' ? a : (a && a.stack) || String(a))) }); } catch (e) {}
    orig(...args);
  };
})();

// Defensive wrapper for global sendError if something (extension/HMR, etc) calls it and it throws
(function wrapSendError(){
  const orig = (window as any).sendError;
  (window as any).sendError = function(...args: any[]) {
    try {
      if (typeof orig === 'function') return orig.apply(this, args);
    } catch (e) {
      try { pushPageError({ at: Date.now(), kind: 'sendError-throw', args: args.map(a => typeof a === 'string' ? a : (a && a.stack) || String(a)), err: ''+e }); } catch (e2) {}
      console.warn('[hmr-capture] sendError threw and was captured', e);
    }
  };
})();

// Keep helpers available to manually dump the captured errors
;(window as any).dumpHmrErrors = () => {
  try { return { hmr: JSON.parse(JSON.stringify((window as any).__hmrErrors || [])), pageErrors: JSON.parse(JSON.stringify((window as any).__pageErrors || [])) }; } catch (e) { return { hmr: (window as any).__hmrErrors || [], pageErrors: (window as any).__pageErrors || [] }; }
};

console.debug('[hmr-capture] active — HMR payloads and page errors will be recorded (persisted to localStorage)');

// Make this file an ES module so it can be imported dynamically without TS complaining
export {};

