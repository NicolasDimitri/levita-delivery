import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { session, profile } = useAuth();

  // Só redireciona quando o perfil (admin/driver) já estiver carregado no
  // contexto — evita o "volta pro login sozinho" que acontecia quando
  // navegávamos assim que o login respondia, sem esperar o perfil.
  useEffect(() => {
    if (session && profile) {
      navigate(profile.role === 'admin' ? '/admin' : '/entregas', { replace: true });
    }
  }, [session, profile, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setLoading(false);
      setError('E-mail ou senha incorretos.');
      return;
    }

    // não navega aqui — o useEffect acima faz isso assim que o perfil
    // (admin/driver) terminar de carregar no contexto
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Entrar</h1>
        <p className="mb-6 text-sm text-gray-500">Acesse sua conta de administrador ou entregador.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-500 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          É entregador e ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-medium text-brand-600 hover:underline">
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}
