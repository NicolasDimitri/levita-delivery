// api/ifood/dispatch.js
// Avisa o iFood que o pedido saiu pra entrega (deliveredBy: MERCHANT).
// Essa ação é INDEPENDENTE de atribuir um entregador — o admin pode fazer
// uma, a outra, ou as duas, em qualquer ordem. Atribuir entregador é feito
// direto pelo frontend (supabase.from('orders').update(...)), sem passar
// por essa função, já que não precisa chamar a API do iFood pra isso.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { dispatchOrder } from '../../lib/ifood.js';

export default async function handler(req, res) {
  console.log('=== [API /api/ifood/dispatch] REQUISIÇÃO RECEBIDA ===');
  console.log(JSON.stringify({
    method: req.method,
    url: req.url,
    headers: req.headers,
    query: req.query,
    body: req.body,
    cookies: req.cookies
  }, null, 2));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    console.log('=== [API /api/ifood/dispatch] FALHA NA AUTENTICAÇÃO ===');
    console.log(JSON.stringify({ userError, userData }, null, 2));
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
    console.log('=== [API /api/ifood/dispatch] RESPOSTA DO IFOOD (dispatchOrder) ===');
    console.log(JSON.stringify({ status: ifoodRes.status, ok: ifoodRes.ok, headers: Object.fromEntries(ifoodRes.headers.entries()) }, null, 2));
    if (!ifoodRes.ok) {
      const text = await ifoodRes.text();
      console.log('=== [API /api/ifood/dispatch] CORPO DE ERRO DO IFOOD ===');
      console.log(text);
      return res.status(502).json({ error: `iFood recusou o despacho: ${text}` });
    }
  } catch (err) {
    console.error('=== [API /api/ifood/dispatch] EXCEÇÃO AO CHAMAR IFOOD ===');
    console.error(err);
    return res.status(502).json({ error: 'Erro ao despachar pedido no iFood' });
  }

  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({ ifood_dispatched_at: new Date().toISOString(), status: 'em_rota' })
    .eq('id', order.id);
  if (updateError) {
    console.error('=== [API /api/ifood/dispatch] ERRO AO ATUALIZAR ORDERS NO SUPABASE ===');
    console.error(JSON.stringify(updateError, null, 2));
  }

  console.log('=== [API /api/ifood/dispatch] SUCESSO — respondendo 200 ===');
  return res.status(200).json({ ok: true });
}