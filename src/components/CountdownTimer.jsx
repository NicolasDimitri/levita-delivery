// src/components/CountdownTimer.jsx
// Temporizador genérico — recebe um instante alvo e mostra quanto tempo falta,
// atualizando a cada segundo. Fica vermelho quando atrasado, amarelo quando
// está acabando (< 2 min), cinza/azul no resto do tempo.
//
// size="sm" (padrão) -> usado nos cards compactos do admin.
// size="lg" -> usado na tela do entregador, onde o tempo é a informação
// mais importante e precisa de destaque visual maior.
import { useEffect, useState } from 'react';

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function CountdownTimer({ target, label, size = 'sm' }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!target) return null;

  const targetMs = new Date(target).getTime();
  if (Number.isNaN(targetMs)) return null;

  const remainingMs = targetMs - now;
  const isLate = remainingMs <= 0;
  const isUrgent = !isLate && remainingMs < 2 * 60 * 1000;

  if (size === 'lg') {
    const colorClasses = isLate
      ? 'bg-red-50 border-red-200 text-red-700'
      : isUrgent
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : 'bg-blue-50 border-blue-200 text-blue-700';

    return (
      <div className={`rounded-lg border px-4 py-3 text-center ${colorClasses}`}>
        <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
        <p className="text-3xl font-bold tabular-nums leading-tight">
          {isLate ? 'Atrasado' : formatRemaining(remainingMs)}
        </p>
      </div>
    );
  }

  return (
    <p className={`text-sm font-semibold ${isLate ? 'text-red-600' : isUrgent ? 'text-amber-600' : 'text-gray-500'}`}>
      {label}: {isLate ? 'Atrasado' : formatRemaining(remainingMs)}
    </p>
  );
}
