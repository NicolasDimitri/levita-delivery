// src/components/AutocompleteInput.jsx
// Busca sugestões no Supabase conforme o usuário digita.
// Parâmetros:
//   table   — tabela do Supabase (ex: 'expenses')
//   column  — coluna a buscar (ex: 'description' ou 'lender_name')
//   value, onChange — controlado pelo pai
//   label, placeholder, required — repassados ao input
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function AutocompleteInput({
  table, column, value, onChange,
  label, placeholder, required, className = ''
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // fecha o dropdown ao clicar fora
  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleChange(e) {
    const v = e.target.value;
    onChange(v);
    if (v.length < 1) { setSuggestions([]); setOpen(false); return; }

    const { data } = await supabase
      .from(table)
      .select(column)
      .ilike(column, `${v}%`)
      .limit(6);

    // deduplica e filtra vazios
    const unique = [...new Set((data || []).map(r => r[column]).filter(Boolean))];
    setSuggestions(unique);
    setOpen(unique.length > 0);
  }

  function select(s) {
    onChange(s);
    setOpen(false);
  }

  const inputClass = `w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm
    focus:border-brand-500 focus:outline-none ${className}`;

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </label>
      )}
      <input
        type="text"
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
        className={inputClass}
      />
      {open && (
        <ul className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => select(s)}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
