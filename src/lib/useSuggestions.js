// src/lib/useSuggestions.js
// Busca valores já salvos anteriormente em uma coluna (ex.: descrições ou
// nomes de quem emprestou) para alimentar os inputs com autocomplete.
// Assim, na primeira vez que algo é digitado ele é só salvo normalmente;
// da segunda vez em diante ele já aparece como sugestão.
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// cache simples em memória — evita refazer a mesma busca toda vez que um
// formulário é aberto durante a mesma sessão.
const cache = {};

export function useSuggestions(table, column) {
  const key = `${table}.${column}`;
  const [suggestions, setSuggestions] = useState(cache[key] || []);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data, error } = await supabase.from(table).select(column).not(column, 'is', null);
      if (!active || error || !data) return;
      const unique = [...new Set(data.map(r => (r[column] || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      cache[key] = unique;
      setSuggestions(unique);
    }

    load();
    return () => { active = false; };
  }, [table, column]);

  return suggestions;
}
