// src/lib/ui.jsx
// Primitivos de UI reutilizáveis que aparecem em vários componentes.
// Importar daqui evita duplicar as mesmas classes Tailwind em todo lugar.

import { useEffect, useRef, useState } from 'react';
import { centsToBRLString } from './constants';

export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center font-semibold rounded-xl transition active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed';
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'w-full py-4 text-sm' };
  const variants = {
    primary:   'bg-brand-500 text-white hover:bg-brand-600',
    secondary: 'border-2 border-gray-200 text-gray-600 hover:bg-gray-50',
    success:   'bg-green-600 text-white hover:bg-green-700',
    danger:    'bg-red-600 text-white hover:bg-red-700',
    blue:      'bg-blue-600 text-white hover:bg-blue-700',
    ghost:     'text-gray-400 hover:text-gray-700 text-xs',
    selected:  'border-2 border-brand-500 bg-brand-50 text-brand-700',
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Badge({ children, color = 'gray' }) {
  const colors = {
    gray:   'bg-gray-100 text-gray-600',
    red:    'bg-red-100 text-red-700',
    green:  'bg-green-100 text-green-700',
    blue:   'bg-blue-100 text-blue-700',
    amber:  'bg-amber-100 text-amber-700',
    purple: 'bg-purple-100 text-purple-700',
    teal:   'bg-teal-100 text-teal-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    pink:   'bg-pink-100 text-pink-700',
    orange: 'bg-orange-100 text-orange-700',
    yellow: 'bg-yellow-100 text-yellow-800',
    emerald:'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[color] ?? colors.gray}`}>
      {children}
    </span>
  );
}

export function EmptyState({ message = 'Nenhum item encontrado.' }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-gray-300 p-10 text-center">
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

export function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex overflow-x-auto border-b border-gray-200">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`shrink-0 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            active === t.id
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Input({ label, className = '', ...props }) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</label>}
      <input
        className={`w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none ${className}`}
        {...props}
      />
    </div>
  );
}

export function ToggleGroup({ options, value, onChange }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 2)}, 1fr)` }}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-xl border-2 py-3 text-sm font-semibold transition ${
            value === o.value
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-gray-200 bg-white text-gray-500'
          }`}
        >
          {o.icon && <span className="mr-1">{o.icon}</span>}
          {o.label}
          {o.sub && <p className="text-xs font-normal opacity-70 mt-0.5">{o.sub}</p>}
        </button>
      ))}
    </div>
  );
}

export function Card({ children, className = '', highlight }) {
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${highlight ? 'border-brand-200' : 'border-gray-100'} ${className}`}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{children}</p>;
}

export function ErrorMsg({ message }) {
  if (!message) return null;
  return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{message}</p>;
}

/**
 * Input de valor monetário. Conforme o usuário digita números (ignora tudo
 * o mais), o conteúdo já aparece formatado como "12.334,88" (milhar com
 * ponto, centavos com vírgula). `value` e `onChange` trabalham sempre em
 * reais (número), igual a um input comum — a máscara é só visual.
 */
export function CurrencyInput({ label, value, onChange, placeholder = '0,00', required, className = '' }) {
  const [display, setDisplay] = useState(value ? centsToBRLString(Math.round(Number(value) * 100)) : '');

  useEffect(() => {
    if (value === '' || value === null || value === undefined) setDisplay('');
  }, [value]);

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    if (!digits) { setDisplay(''); onChange(''); return; }
    const cents = parseInt(digits, 10);
    setDisplay(centsToBRLString(cents));
    onChange(cents / 100);
  }

  return (
    <div>
      {label && <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</label>}
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
        <input
          type="text"
          inputMode="numeric"
          required={required}
          placeholder={placeholder}
          value={display}
          onChange={handleChange}
          className={`w-full rounded-xl border-2 border-gray-200 py-3 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none ${className}`}
        />
      </div>
    </div>
  );
}

/**
 * Input de texto com autocomplete. `suggestions` é a lista de valores já
 * salvos anteriormente (ex.: descrições ou nomes já usados) — assim que o
 * usuário começa a digitar, as opções que combinam aparecem em um dropdown.
 */
export function AutocompleteInput({ label, value, onChange, suggestions = [], placeholder, required, className = '' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered = (value
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase())
    : suggestions
  ).slice(0, 6);

  return (
    <div className="relative" ref={wrapRef}>
      {label && <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</label>}
      <input
        type="text"
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
        className={`w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none ${className}`}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {filtered.map(s => (
            <button key={s} type="button"
              onMouseDown={() => { onChange(s); setOpen(false); }}
              className="block w-full truncate px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-brand-50">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Painel deslizante (bottom sheet) usado pelos formulários flutuantes. */
export function Sheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-2xl sm:rounded-3xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-base font-bold text-gray-800">{title}</p>
          <button onClick={onClose} type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Par de botões flutuantes fixos na parte inferior da tela (Gasto / Pagar). */
export function FloatingActions({ onNewExpense, onPay }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center gap-3 px-4 pb-6 pt-10"
      style={{ background: 'linear-gradient(to top, rgba(249,250,251,0.98), rgba(249,250,251,0))' }}>
      <button type="button" onClick={onNewExpense}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 bg-white text-2xl font-bold text-gray-600 shadow-lg transition active:scale-95">
        +
      </button>
      <button type="button" onClick={onPay}
        className="pointer-events-auto flex items-center gap-2 rounded-full bg-green-600 px-7 py-4 text-sm font-bold text-white shadow-lg transition active:scale-95 hover:bg-green-700">
        💸 Pagar
      </button>
    </div>
  );
}
