import { useEffect, useRef, useState } from 'react';
import { hideIfoodWidget, initializeIfoodWidget } from '../lib/ifoodWidget';
import { useApi } from '../lib/useApi';

const widgetId = (import.meta.env.VITE_IFOOD_WIDGET_ID || '').trim();

export default function IfoodChatWidget() {
  const { call } = useApi();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      hideIfoodWidget();
    };
  }, []);

  if (!widgetId) return null;

  async function toggleWidget() {
    if (visible) {
      hideIfoodWidget();
      setVisible(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { merchantIds } = await call('/api/ifood/store-hours-status?widget=1', { method: 'GET' });
      const widget = await initializeIfoodWidget(widgetId, merchantIds);
      if (mounted.current) {
        widget.show();
        setVisible(true);
      }
    } catch (err) {
      console.error('Não foi possível iniciar o widget do iFood', err);
      if (mounted.current) setError(err.message || 'Não foi possível abrir o chat do iFood.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={toggleWidget} disabled={loading} aria-pressed={visible}
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
        {loading ? 'Abrindo chat...' : visible ? 'Ocultar chat iFood' : 'Chat iFood'}
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
