// src/components/CountdownTimer.jsx
// Temporizador genérico — recebe um instante alvo e mostra quanto tempo falta,
// atualizando a cada segundo. Fica vermelho quando atrasado, amarelo quando
// está acabando (< 2 min), cinza no resto do tempo.
import { useEffect, useState } from 'react';

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function CountdownTimer({ target, label }) {
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

  return (
    <p
      className={`text-sm font-semibold ${
        isLate ? 'text-red-600' : isUrgent ? 'text-amber-600' : 'text-gray-500'
      }`}
    >
      {label}: {isLate ? 'Atrasado' : formatRemaining(remainingMs)}
    </p>
  );
}
