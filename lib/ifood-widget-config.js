export async function getWidgetConfig(req, res, supabase, merchantIdsValue) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return res.status(401).json({ error: 'Não autenticado' });

  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('role').eq('id', userData.user.id).single();
  if (profileError) {
    console.error('Não foi possível verificar o perfil para o widget do iFood', profileError.message);
    return res.status(500).json({ error: 'Não foi possível verificar suas permissões.' });
  }
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem usar o chat.' });

  const merchantIds = (merchantIdsValue || '').split(',').map(id => id.trim()).filter(Boolean);
  if (merchantIds.length === 0 || merchantIds.length > 10) {
    return res.status(503).json({ error: 'Configure de 1 a 10 lojas em IFOOD_MERCHANT_IDS.' });
  }
  return res.status(200).json({ merchantIds });
}
