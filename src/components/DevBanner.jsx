// src/components/DevBanner.jsx
// Aparece em todas as telas quando o app está rodando em desenvolvimento.
// Em produção (Vercel) não renderiza nada.
import { isDev } from '../lib/env';

export default function DevBanner() {
  if (!isDev) return null;

  return (
    <div className="w-full bg-amber-400 py-1 text-center text-xs font-semibold text-amber-900">
      ⚠️ AMBIENTE DE DESENVOLVIMENTO — dados de teste, não use em produção
    </div>
  );
}
