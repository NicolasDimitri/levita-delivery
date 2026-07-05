// src/components/CurrencyInput.jsx
// Formata o valor enquanto o usuário digita, no padrão brasileiro:
// 1 → 0,01 | 123 → 1,23 | 1234567 → 12.345,67
// Aceita apenas dígitos — backspace remove o último.
// Expõe um número (float) para o pai via onChange.
import { useEffect, useState } from 'react';

function digitsToFloat(digits) {
  return parseInt(digits || '0', 10) / 100;
}

function formatDigits(digits) {
  const num = parseInt(digits || '0', 10);
  return (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CurrencyInput({ label, value = 0, onChange, required, className = '' }) {
  // digits = string de centavos, ex: "12345" = R$123,45
  const [digits, setDigits] = useState(Math.round(value * 100).toString());

  // sincroniza quando o pai reseta o valor pra 0 (ex: form reset)
  useEffect(() => {
    if (value === 0) setDigits('0');
  }, [value]);

  function handleKeyDown(e) {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      const raw = digits === '0' ? e.key : digits + e.key;
      // remove zeros à esquerda, mas nunca fica vazio
      const next = raw.replace(/^0+/, '') || '0';
      setDigits(next);
      onChange(digitsToFloat(next));
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      const next = digits.length > 1 ? digits.slice(0, -1) : '0';
      setDigits(next);
      onChange(digitsToFloat(next));
    }
    // ignora qualquer outra tecla (letras, pontos, vírgulas etc.)
  }

  const inputClass = `w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm
    focus:border-brand-500 focus:outline-none text-left tabular-nums ${className}`;

  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </label>
      )}
      <input
        type="text"
        inputMode="numeric"
        required={required}
        value={'R$ ' + formatDigits(digits)}
        onKeyDown={handleKeyDown}
        onChange={() => {}} // controlado via onKeyDown
        className={inputClass}
      />
    </div>
  );
}
