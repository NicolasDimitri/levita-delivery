import { supabaseAdmin } from '../../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();
  if (profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem atribuir pedidos' });
  }

  const { orderId, driverId } = req.body || {};
  if (!orderId || !driverId) {
    return res.status(400).json({ error: 'orderId e driverId são obrigatórios' });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .single();
  if (orderError || !order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.status !== 'pronto') {
    return res.status(409).json({ error: 'O pedido precisa estar pronto para ser atribuído' });
  }

  const { data: driver, error: driverError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', driverId)
    .eq('role', 'driver')
    .single();
  if (driverError || !driver) return res.status(400).json({ error: 'Entregador inválido' });

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from('orders')
    .update({ driver_id: driver.id, assigned_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('status', 'pronto')
    .select('id')
    .maybeSingle();
  if (updateError) {
    console.error('Falha ao salvar a atribuição do entregador', updateError);
    return res.status(500).json({ error: 'Não foi possível salvar a atribuição do entregador' });
  }
  if (!updatedOrder) {
    return res.status(409).json({ error: 'O status do pedido mudou. Atualize a tela e tente novamente.' });
  }

  return res.status(200).json({ ok: true });
}
