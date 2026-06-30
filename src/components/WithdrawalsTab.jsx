// src/components/WithdrawalsTab.jsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function WithdrawalsTab({ withdrawals, drivers, onChanged }) {
  const pending = withdrawals.filter((w) => w.status === 'pendente');
  const paid = withdrawals.filter((w) => w.status === 'pago');

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-sm font-semibold text-gray-600">
          Pendentes <span className="text-gray-400">({pending.length})</span>
        </p>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
            Nenhuma solicitação de saque pendente.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pending.map((w) => (
              <WithdrawalCard key={w.id} withdrawal={w} drivers={drivers} onChanged={onChanged} />
            ))}
          </div>
        )}
      </div>

      {paid.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-gray-600">Pagos recentemente</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {paid.map((w) => (
              <WithdrawalCard key={w.id} withdrawal={w} drivers={drivers} onChanged={onChanged} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WithdrawalCard({ withdrawal, drivers, onChanged }) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const driverName = drivers.find((d) => d.id === withdrawal.driver_id)?.name || 'Entregador não identificado';
  const isPaid = withdrawal.status === 'pago';

  async function handleCopyPix() {
    try {
      await navigator.clipboard.writeText(withdrawal.pix_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // navigator.clipboard pode falhar em http (não-https) ou navegadores antigos
      alert('Não foi possível copiar automaticamente. Chave PIX: ' + withdrawal.pix_key);
    }
  }

  async function handleConfirmPayment() {
    if (!window.confirm(`Confirmar que o PIX de R$ ${Number(withdrawal.total_value).toFixed(2)} foi enviado para ${driverName}?`)) {
      return;
    }
    setConfirming(true);
    setError('');
    const { error: updateError } = await supabase
      .from('withdrawal_requests')
      .update({ status: 'pago', paid_at: new Date().toISOString() })
      .eq('id', withdrawal.id);

    setConfirming(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onChanged?.();
  }

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${isPaid ? 'border-gray-200 opacity-70' : 'border-gray-200'}`}>
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="font-semibold">{driverName}</p>
          <p className="text-xs text-gray-400">
            Solicitado em {new Date(withdrawal.requested_at).toLocaleString('pt-BR')}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {isPaid ? 'Pago' : 'Pendente'}
        </span>
      </div>

      <p className="mb-1 text-2xl font-semibold text-green-700">R$ {Number(withdrawal.total_value).toFixed(2)}</p>

      <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Chave PIX</p>
        <p className="break-all text-sm text-gray-700">{withdrawal.pix_key}</p>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {isPaid ? (
        <p className="text-sm text-gray-500">
          Pago em {withdrawal.paid_at ? new Date(withdrawal.paid_at).toLocaleString('pt-BR') : '—'}
        </p>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={handleCopyPix}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {copied ? 'PIX copiado!' : 'Copiar PIX'}
          </button>
          <button
            onClick={handleConfirmPayment}
            disabled={confirming}
            className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {confirming ? 'Confirmando...' : 'Confirmar pagamento'}
          </button>
        </div>
      )}
    </div>
  );
}