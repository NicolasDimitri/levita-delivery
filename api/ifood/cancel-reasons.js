import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { getCancellationReasons } from '../../lib/ifood.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
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
    return res.status(403).json({ error: 'Apenas administradores podem consultar motivos' });
  }

  const orderId = String(req.query?.orderId || '');
  if (!orderId) return res.status(400).json({ error: 'orderId é obrigatório' });

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('ifood_order_id')
    .eq('id', orderId)
    .single();
  if (orderError || !order) return res.status(404).json({ error: 'Pedido não encontrado' });

  try {
    const reasons = await getCancellationReasons(order.ifood_order_id);
    return res.status(200).json({ reasons: Array.isArray(reasons) ? reasons : reasons?.reasons || [] });
  } catch (err) {
    console.error('Erro ao buscar motivos de cancelamento do iFood', err);
    return res.status(502).json({ error: 'Erro ao consultar motivos de cancelamento no iFood' });
  }
}
