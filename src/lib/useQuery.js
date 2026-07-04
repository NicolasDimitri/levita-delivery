// src/lib/useQuery.js
// Hook genérico pra queries ao Supabase que precisam de estado de loading/erro
// e podem ser recarregadas (refresh). Evita o padrão repetido de
// useState(loading) + useState(data) + useCallback(load) em cada componente.
import { useState, useCallback, useEffect } from 'react';

export function useQuery(queryFn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await queryFn();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, refresh: run };
}
