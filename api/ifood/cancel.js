import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requestCancellation } from '../../lib/ifood.js';

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
    return res.status(403).json({ error: 'Apenas administradores podem cancelar pedidos' });
  }

  const { orderId, reason, cancellationCode } = req.body || {};
  if (!orderId || !reason || !cancellationCode) {
    return res.status(400).json({ error: 'orderId, reason e cancellationCode são obrigatórios' });
  }

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, ifood_order_id, status')
    .eq('id', orderId)
    .single();
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (['entregue', 'cancelado'].includes(order.status)) {
    return res.status(409).json({ error: 'Esse pedido já foi finalizado' });
  }

  try {
    const ifoodRes = await requestCancellation(order.ifood_order_id, reason, cancellationCode);
    if (!ifoodRes.ok && ifoodRes.status !== 202) {
      const text = await ifoodRes.text();
      return res.status(502).json({ error: `iFood recusou o cancelamento: ${text}` });
    }
  } catch (err) {
    console.error('Erro ao solicitar cancelamento no iFood', err);
    return res.status(502).json({ error: 'Erro ao solicitar cancelamento no iFood' });
  }

  const { error } = await supabaseAdmin
    .from('orders')
    .update({ status: 'cancelado' })
    .eq('id', order.id);
  if (error) {
    console.error('Solicitação aceita pelo iFood, mas falhou ao atualizar o pedido local', error);
  }

  return res.status(200).json({ ok: true, pending: true });
}
