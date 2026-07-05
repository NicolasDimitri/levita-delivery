// src/lib/ui.jsx
// Primitivos de UI reutilizáveis que aparecem em vários componentes.
// Importar daqui evita duplicar as mesmas classes Tailwind em todo lugar.

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
