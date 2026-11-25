const SCRIPT_URL = 'https://widgets.ifood.com.br/widget.js';
const TIMEOUT_MS = 15000;

let scriptPromise;
let initializationPromise;

function loadScript() {
  if (window.iFoodWidget) return Promise.resolve(window.iFoodWidget);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let timer;
    const fail = () => {
      window.clearTimeout(timer);
      script.remove();
      scriptPromise = undefined;
      reject(new Error('Não foi possível carregar o widget do iFood.'));
    };
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.iFoodWidget) resolve(window.iFoodWidget);
      else fail();
    };
    script.onerror = fail;
    timer = window.setTimeout(fail, TIMEOUT_MS);
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export async function initializeIfoodWidget(widgetId, merchantIds) {
  if (!initializationPromise) {
    const widget = await loadScript();
    if (!initializationPromise) {
      initializationPromise = widget.init({ widgetId, merchantIds, autoShow: false });
    }
  }
  const widget = window.iFoodWidget;
  await Promise.race([
    initializationPromise,
    new Promise((_, reject) => {
      const timer = window.setTimeout(() => reject(new Error('O widget do iFood demorou para iniciar. Recarregue a página.')), TIMEOUT_MS);
      initializationPromise.then(() => window.clearTimeout(timer), () => window.clearTimeout(timer));
    }),
  ]);
  return widget;
}

export function hideIfoodWidget() {
  window.iFoodWidget?.hide();
}
