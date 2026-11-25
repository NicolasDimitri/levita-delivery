import { supabaseAdmin } from './supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: 'Não autenticado' });
  const { data: profile, error: profileError } = await supabaseAdmin.from('profiles')
    .select('role').eq('id', userData.user.id).maybeSingle();
  if (profileError) {
    console.error('Erro ao verificar administrador', profileError);
    return res.status(500).json({ error: 'Não foi possível verificar a autorização' });
  }
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem buscar endereços' });
  const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
  if (address.length < 3 || address.length > 300) return res.status(400).json({ error: 'Informe um endereço válido' });
  if (!process.env.ORS_API_KEY?.trim()) return res.status(503).json({ error: 'ORS_API_KEY não configurada' });

  try {
    const url = new URL('https://api.openrouteservice.org/geocode/search');
    url.searchParams.set('text', address);
    url.searchParams.set('size', '5');
    url.searchParams.set('boundary.country', 'BR');
    const response = await fetch(url, {
      headers: { Authorization: process.env.ORS_API_KEY },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`openrouteservice retornou HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.features)) throw new Error('Resposta de busca inválida');
    const results = data.features.flatMap((feature) => {
      const [longitude, latitude] = feature.geometry?.coordinates || [];
      const label = feature.properties?.label;
      return typeof label === 'string' && Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
        Number.isFinite(longitude) && Math.abs(longitude) <= 180
        ? [{ label, latitude, longitude }] : [];
    });
    return res.status(200).json({ results });
  } catch (error) {
    console.error('Falha ao buscar endereço', error.message);
    return res.status(502).json({ error: 'Não foi possível buscar o endereço. Tente novamente.' });
  }
}
