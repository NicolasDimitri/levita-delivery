import { test } from 'node:test';
import assert from 'node:assert/strict';

test('loads the official widget once and initializes it once for concurrent requests', async () => {
  const scripts = [];
  const calls = [];
  const widget = {
    init: async config => { calls.push(config); },
    hide: () => { calls.push('hide'); },
  };
  global.window = { setTimeout, clearTimeout };
  global.document = {
    createElement: () => ({ remove() {} }),
    head: { appendChild: script => { scripts.push(script); } },
  };
  try {
    const { initializeIfoodWidget, hideIfoodWidget } = await import('./ifoodWidget.js?once');
    const first = initializeIfoodWidget('widget-id', ['store-1', 'store-2']);
    const second = initializeIfoodWidget('widget-id', ['store-1', 'store-2']);
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].src, 'https://widgets.ifood.com.br/widget.js');
    window.iFoodWidget = widget;
    scripts[0].onload();
    assert.deepEqual(await Promise.all([first, second]), [widget, widget]);
    assert.deepEqual(calls, [{ widgetId: 'widget-id', merchantIds: ['store-1', 'store-2'], autoShow: false }]);
    await initializeIfoodWidget('widget-id', ['store-1', 'store-2']);
    hideIfoodWidget();
    assert.equal(calls.length, 2);
    assert.equal(calls[1], 'hide');
  } finally {
    delete global.window;
    delete global.document;
  }
});

test('reports script loading errors and permits retry', async () => {
  const scripts = [];
  global.window = { setTimeout, clearTimeout };
  global.document = {
    createElement: () => ({ remove() {} }),
    head: { appendChild: script => { scripts.push(script); } },
  };
  try {
    const { initializeIfoodWidget } = await import('./ifoodWidget.js?retry');
    const first = initializeIfoodWidget('widget-id', ['store-1']);
    scripts[0].onerror();
    await assert.rejects(first, /carregar o widget/);
    const second = initializeIfoodWidget('widget-id', ['store-1']);
    assert.equal(scripts.length, 2);
    window.iFoodWidget = { init: async () => {} };
    scripts[1].onload();
    await second;
  } finally {
    delete global.window;
    delete global.document;
  }
});
