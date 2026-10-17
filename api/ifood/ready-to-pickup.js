import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { readyToPickupOrder } from '../../lib/ifood.js';

export default async function handler(req, res) {
  const startedAt = Date.now();
  console.log('=== [API /api/ifood/ready-to-pickup] REQUISIÇÃO RECEBIDA ===', {
    method: req.method,
    hasAuth: Boolean(req.headers.authorization)
  });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    console.warn('=== [API /api/ifood/ready-to-pickup] FALHA NA AUTENTICAÇÃO ===', {
      error: userError?.message || null
    });
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();
  if (profileError) {
    console.error('=== [API /api/ifood/ready-to-pickup] FALHA AO CONSULTAR PERFIL ===', profileError);
    return res.status(500).json({ error: 'Não foi possível validar o perfil do usuário' });
  }
  if (profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem marcar pedidos como prontos' });
  }

  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'orderId é obrigatório' });

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, ifood_order_id, display_id, status')
    .eq('id', orderId)
    .single();
  if (orderError || !order) {
    console.error('=== [API /api/ifood/ready-to-pickup] PEDIDO NÃO ENCONTRADO ===', {
      orderId,
      error: orderError?.message || null,
      code: orderError?.code || null
    });
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  if (order.status !== 'em_preparo') {
    return res.status(409).json({ error: 'O pedido precisa estar em preparo antes de ser marcado como pronto' });
  }

  console.log('=== [API /api/ifood/ready-to-pickup] INFORMANDO PEDIDO PRONTO AO IFOOD ===', {
    orderId: order.id,
    ifoodOrderId: order.ifood_order_id,
    displayId: order.display_id
  });

  try {
    const ifoodRes = await readyToPickupOrder(order.ifood_order_id);
    console.log('=== [API /api/ifood/ready-to-pickup] RESPOSTA DO IFOOD ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id,
      status: ifoodRes.status,
      ok: ifoodRes.ok
    });
    if (!ifoodRes.ok) {
      const text = await ifoodRes.text();
      return res.status(502).json({ error: `iFood recusou a atualização para pronto: ${text}` });
    }
  } catch (err) {
    console.error('=== [API /api/ifood/ready-to-pickup] EXCEÇÃO AO CHAMAR IFOOD ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id,
      error: err.message
    });
    return res.status(502).json({ error: 'Erro ao informar ao iFood que o pedido está pronto' });
  }

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from('orders')
    .update({ status: 'pronto' })
    .eq('id', order.id)
    .eq('status', 'em_preparo')
    .select('id')
    .maybeSingle();
  if (updateError) {
    console.error('=== [API /api/ifood/ready-to-pickup] IFOOD ACEITOU, MAS SUPABASE FALHOU ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id,
      error: updateError.message,
      code: updateError.code,
      details: updateError.details
    });
    return res.status(500).json({ error: 'iFood marcou o pedido como pronto, mas o sistema não conseguiu atualizar o status local' });
  }
  if (!updatedOrder) {
    const { data: latestOrder, error: latestOrderError } = await supabaseAdmin
      .from('orders')
      .select('status')
      .eq('id', order.id)
      .single();
    if (latestOrderError) {
      console.error('=== [API /api/ifood/ready-to-pickup] FALHA AO VERIFICAR STATUS ===', {
        orderId: order.id,
        ifoodOrderId: order.ifood_order_id,
        error: latestOrderError.message,
        code: latestOrderError.code
      });
      return res.status(500).json({ error: 'iFood marcou o pedido como pronto, mas não foi possível verificar o status local' });
    }
    if (!['pronto', 'em_rota', 'entregue'].includes(latestOrder.status)) {
      return res.status(409).json({ error: 'iFood marcou o pedido como pronto, mas o status local mudou. Atualize a tela.' });
    }
  }

  console.log('=== [API /api/ifood/ready-to-pickup] SUCESSO ===', {
    orderId: order.id,
    ifoodOrderId: order.ifood_order_id,
    status: updatedOrder ? 'pronto' : 'já avançado',
    durationMs: Date.now() - startedAt
  });
  return res.status(200).json({ ok: true });
}
