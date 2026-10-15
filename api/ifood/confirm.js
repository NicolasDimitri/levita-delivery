// api/ifood/confirm.js
// O iFood exige confirmação do pedido em poucos minutos (atualmente 8) após o PLACED,
// senão ele cancela automaticamente. Esse endpoint é chamado quando o admin clica
// em "Aceitar pedido" na tela de administração.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { confirmOrder } from '../../lib/ifood.js';

export default async function handler(req, res) {
  console.log('=== [API /api/ifood/confirm] REQUISIÇÃO RECEBIDA ===', {
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
    console.log('=== [API /api/ifood/confirm] FALHA NA AUTENTICAÇÃO ===');
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem confirmar pedidos' });
  }

  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'orderId é obrigatório' });

  const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  try {
    const ifoodRes = await confirmOrder(order.ifood_order_id);
    console.log('=== [API /api/ifood/confirm] RESPOSTA DO IFOOD (confirmOrder) ===', {
      status: ifoodRes.status,
      ok: ifoodRes.ok
    });
    if (!ifoodRes.ok) {
      const text = await ifoodRes.text();
      console.log('=== [API /api/ifood/confirm] CORPO DE ERRO DO IFOOD ===', { length: text.length });
      return res.status(502).json({ error: `iFood recusou a confirmação: ${text}` });
    }
  } catch (err) {
    console.error('=== [API /api/ifood/confirm] EXCEÇÃO AO CHAMAR IFOOD ===');
    console.error(err);
    return res.status(502).json({ error: 'Erro ao confirmar pedido no iFood' });
  }

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from('orders')
    .update({ status: 'em_preparo' })
    .eq('id', order.id)
    .eq('status', 'recebido')
    .select('id')
    .maybeSingle();
  if (updateError) {
    console.error('=== [API /api/ifood/confirm] ERRO AO ATUALIZAR ORDERS NO SUPABASE ===');
    console.error(JSON.stringify(updateError, null, 2));
    return res.status(500).json({ error: 'iFood confirmou o pedido, mas o sistema não conseguiu atualizar o status local' });
  }
  if (!updatedOrder) {
    const { data: latestOrder, error: latestOrderError } = await supabaseAdmin
      .from('orders')
      .select('status')
      .eq('id', order.id)
      .single();
    if (latestOrderError) {
      console.error('Pedido confirmado no iFood, mas não foi possível verificar o status local', latestOrderError);
      return res.status(500).json({ error: 'iFood confirmou o pedido, mas o sistema não conseguiu verificar o status local' });
    }
    if (!['em_preparo', 'pronto', 'em_rota', 'entregue'].includes(latestOrder.status)) {
      return res.status(409).json({ error: 'iFood confirmou o pedido, mas o status local mudou. Atualize a tela.' });
    }
  }

  console.log('=== [API /api/ifood/confirm] SUCESSO — respondendo 200 ===');
  return res.status(200).json({ ok: true });
}