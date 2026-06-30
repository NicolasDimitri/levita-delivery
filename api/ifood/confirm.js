// api/ifood/confirm.js
// O iFood exige confirmação do pedido em poucos minutos (atualmente 8) após o PLACED,
// senão ele cancela automaticamente. Esse endpoint é chamado quando o admin clica
// em "Aceitar pedido" na tela de administração.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { confirmOrder } from '../../lib/ifood.js';

export default async function handler(req, res) {
  console.log('=== [API /api/ifood/confirm] REQUISIÇÃO RECEBIDA ===');
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
    console.log('=== [API /api/ifood/confirm] FALHA NA AUTENTICAÇÃO ===');
    console.log(JSON.stringify({ userError, userData }, null, 2));
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
    console.log('=== [API /api/ifood/confirm] RESPOSTA DO IFOOD (confirmOrder) ===');
    console.log(JSON.stringify({ status: ifoodRes.status, ok: ifoodRes.ok, headers: Object.fromEntries(ifoodRes.headers.entries()) }, null, 2));
    if (!ifoodRes.ok) {
      const text = await ifoodRes.text();
      console.log('=== [API /api/ifood/confirm] CORPO DE ERRO DO IFOOD ===');
      console.log(text);
      return res.status(502).json({ error: `iFood recusou a confirmação: ${text}` });
    }
  } catch (err) {
    console.error('=== [API /api/ifood/confirm] EXCEÇÃO AO CHAMAR IFOOD ===');
    console.error(err);
    return res.status(502).json({ error: 'Erro ao confirmar pedido no iFood' });
  }

  const { error: updateError } = await supabaseAdmin.from('orders').update({ status: 'em_preparo' }).eq('id', order.id);
  if (updateError) {
    console.error('=== [API /api/ifood/confirm] ERRO AO ATUALIZAR ORDERS NO SUPABASE ===');
    console.error(JSON.stringify(updateError, null, 2));
  }

  console.log('=== [API /api/ifood/confirm] SUCESSO — respondendo 200 ===');
  return res.status(200).json({ ok: true });
}