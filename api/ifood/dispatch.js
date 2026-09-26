// api/ifood/dispatch.js
// Avisa o iFood que o pedido saiu para entrega (deliveredBy: MERCHANT).

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { dispatchOrder } from '../../lib/ifood.js';

export default async function handler(req, res) {
  console.log('=== [API /api/ifood/dispatch] REQUISIÇÃO RECEBIDA ===', {
    method: req.method,
    url: req.url,
    hasAuth: Boolean(req.headers.authorization),
    query: req.query
  });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    console.log('=== [API /api/ifood/dispatch] FALHA NA AUTENTICAÇÃO ===');
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

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, ifood_order_id, status, driver_id')
    .eq('id', orderId)
    .single();
  if (orderError || !order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.status !== 'pronto') {
    return res.status(409).json({ error: 'O pedido precisa estar pronto antes do despacho' });
  }
  if (!order.driver_id) {
    return res.status(400).json({ error: 'Atribua um entregador antes de despachar o pedido' });
  }
  const { data: assignedDriver, error: assignedDriverError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', order.driver_id)
    .eq('role', 'driver')
    .single();
  if (assignedDriverError || !assignedDriver) {
    return res.status(409).json({ error: 'O pedido não está atribuído a um entregador válido' });
  }

  try {
    const ifoodRes = await dispatchOrder(order.ifood_order_id);
    console.log('=== [API /api/ifood/dispatch] RESPOSTA DO IFOOD (dispatchOrder) ===', {
      status: ifoodRes.status,
      ok: ifoodRes.ok
    });
    if (!ifoodRes.ok) {
      const text = await ifoodRes.text();
      console.log('=== [API /api/ifood/dispatch] CORPO DE ERRO DO IFOOD ===', { length: text.length });
      return res.status(502).json({ error: `iFood recusou o despacho: ${text}` });
    }
  } catch (err) {
    console.error('=== [API /api/ifood/dispatch] EXCEÇÃO AO CHAMAR IFOOD ===');
    console.error(err);
    return res.status(502).json({ error: 'Erro ao despachar pedido no iFood' });
  }

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from('orders')
    .update({ ifood_dispatched_at: new Date().toISOString(), status: 'em_rota' })
    .eq('id', order.id)
    .eq('status', 'pronto')
    .eq('driver_id', order.driver_id)
    .select('id')
    .maybeSingle();
  if (updateError) {
    console.error('O iFood aceitou o despacho, mas a atualização local falhou', updateError);
    return res.status(500).json({ error: 'iFood despachou o pedido, mas o sistema não conseguiu atualizar o status local' });
  }
  if (!updatedOrder) {
    return res.status(500).json({ error: 'iFood despachou o pedido, mas o status local não foi atualizado' });
  }

  console.log('=== [API /api/ifood/dispatch] SUCESSO — respondendo 200 ===');
  return res.status(200).json({ ok: true });
}