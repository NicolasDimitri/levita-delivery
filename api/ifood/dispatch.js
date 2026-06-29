// api/ifood/dispatch.js
// Avisa o iFood que o pedido saiu pra entrega (deliveredBy: MERCHANT).
// Essa ação é INDEPENDENTE de atribuir um entregador — o admin pode fazer
// uma, a outra, ou as duas, em qualquer ordem. Atribuir entregador é feito
// direto pelo frontend (supabase.from('orders').update(...)), sem passar
// por essa função, já que não precisa chamar a API do iFood pra isso.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { dispatchOrder } from '../../lib/ifood.js';

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
    return res.status(403).json({ error: 'Apenas administradores podem despachar pedidos' });
  }

  const { orderId } = req.body || {};
  if (!orderId) {
    return res.status(400).json({ error: 'orderId é obrigatório' });
  }

  const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  try {
    const ifoodRes = await dispatchOrder(order.ifood_order_id);
    if (!ifoodRes.ok) {
      const text = await ifoodRes.text();
      return res.status(502).json({ error: `iFood recusou o despacho: ${text}` });
    }
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: 'Erro ao despachar pedido no iFood' });
  }

  await supabaseAdmin.from('orders').update({ ifood_dispatched_at: new Date().toISOString() }).eq('id', order.id);

  return res.status(200).json({ ok: true });
}
