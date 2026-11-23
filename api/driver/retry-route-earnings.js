import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { calculatePendingEarnings } from '../../lib/driverRouteEarnings.js';

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
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem tentar novamente' });
  if (!req.body?.orderId) return res.status(400).json({ error: 'Pedido não informado' });

  const { data: order, error: orderError } = await supabaseAdmin.from('orders')
    .select('id, latitude, longitude')
    .eq('id', req.body.orderId).maybeSingle();
  if (orderError) {
    console.error('Erro ao buscar pedido para cálculo de repasse', orderError);
    return res.status(500).json({ error: 'Não foi possível consultar o pedido' });
  }
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  try {
    const result = await calculatePendingEarnings(supabaseAdmin, order);
    if (result.pending) return res.status(422).json({ error: result.error });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Erro ao salvar repasse', error);
    return res.status(500).json({ error: 'Não foi possível salvar o repasse' });
  }
}
