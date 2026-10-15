// api/ifood/confirm.js
// O iFood exige confirmação do pedido em poucos minutos (atualmente 8) após o PLACED,
// senão ele cancela automaticamente. Esse endpoint é chamado quando o admin clica
// em "Aceitar pedido" na tela de administração.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { confirmOrder } from '../../lib/ifood.js';

export default async function handler(req, res) {
  const startedAt = Date.now();
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
    console.warn('=== [API /api/ifood/confirm] FALHA NA AUTENTICAÇÃO ===', {
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
    console.error('=== [API /api/ifood/confirm] FALHA AO CONSULTAR PERFIL ===', profileError);
    return res.status(500).json({ error: 'Não foi possível validar o perfil do usuário' });
  }

  if (profile?.role !== 'admin') {
    console.warn('=== [API /api/ifood/confirm] PERFIL SEM PERMISSÃO ===', { role: profile?.role || null });
    return res.status(403).json({ error: 'Apenas administradores podem confirmar pedidos' });
  }

  const { orderId } = req.body || {};
  if (!orderId) {
    console.warn('=== [API /api/ifood/confirm] orderId AUSENTE ===');
    return res.status(400).json({ error: 'orderId é obrigatório' });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, ifood_order_id, display_id, status, delivery_date_time, created_at')
    .eq('id', orderId)
    .single();
  if (orderError || !order) {
    console.error('=== [API /api/ifood/confirm] PEDIDO NÃO ENCONTRADO NO SUPABASE ===', {
      orderId,
      error: orderError?.message || null,
      code: orderError?.code || null
    });
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }

  console.log('=== [API /api/ifood/confirm] INICIANDO CONFIRMAÇÃO ===', {
    orderId: order.id,
    ifoodOrderId: order.ifood_order_id,
    displayId: order.display_id,
    currentStatus: order.status,
    deliveryDateTime: order.delivery_date_time,
    createdAt: order.created_at
  });

  try {
    const ifoodRes = await confirmOrder(order.ifood_order_id);
    console.log('=== [API /api/ifood/confirm] RESPOSTA DO IFOOD (confirmOrder) ===', {
      status: ifoodRes.status,
      ok: ifoodRes.ok
    });
    if (!ifoodRes.ok) {
      const text = await ifoodRes.text();
      let errorDetails = { responseLength: text.length };
      try {
        const parsed = JSON.parse(text);
        errorDetails = {
          responseLength: text.length,
          errorType: parsed.errorType || parsed.type || null,
          code: parsed.code || null,
          message: parsed.message || parsed.description || null
        };
      } catch {
        // Avoid logging arbitrary response bodies that could contain customer data.
      }
      console.error('=== [API /api/ifood/confirm] IFOOD RECUSOU A CONFIRMAÇÃO ===', {
        orderId: order.id,
        ifoodOrderId: order.ifood_order_id,
        status: ifoodRes.status,
        ...errorDetails
      });
      return res.status(502).json({ error: `iFood recusou a confirmação: ${text}` });
    }
  } catch (err) {
    console.error('=== [API /api/ifood/confirm] EXCEÇÃO AO CHAMAR IFOOD ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id,
      durationMs: Date.now() - startedAt,
      error: err.message
    });
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
    console.error('=== [API /api/ifood/confirm] IFOOD ACEITOU, MAS SUPABASE FALHOU ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id,
      error: updateError.message,
      code: updateError.code,
      details: updateError.details,
      hint: updateError.hint
    });
    return res.status(500).json({ error: 'iFood confirmou o pedido, mas o sistema não conseguiu atualizar o status local' });
  }
  if (!updatedOrder) {
    const { data: latestOrder, error: latestOrderError } = await supabaseAdmin
      .from('orders')
      .select('status')
      .eq('id', order.id)
      .single();
    if (latestOrderError) {
      console.error('=== [API /api/ifood/confirm] FALHA AO VERIFICAR STATUS APÓS CONFLITO ===', {
        orderId: order.id,
        ifoodOrderId: order.ifood_order_id,
        error: latestOrderError.message,
        code: latestOrderError.code
      });
      return res.status(500).json({ error: 'iFood confirmou o pedido, mas o sistema não conseguiu verificar o status local' });
    }
    if (!['em_preparo', 'pronto', 'em_rota', 'entregue'].includes(latestOrder.status)) {
      console.warn('=== [API /api/ifood/confirm] STATUS LOCAL INESPERADO APÓS SUCESSO IFOOD ===', {
        orderId: order.id,
        ifoodOrderId: order.ifood_order_id,
        status: latestOrder.status
      });
      return res.status(409).json({ error: 'iFood confirmou o pedido, mas o status local mudou. Atualize a tela.' });
    }
  }

  console.log('=== [API /api/ifood/confirm] SUCESSO ===', {
    orderId: order.id,
    ifoodOrderId: order.ifood_order_id,
    status: updatedOrder ? 'em_preparo' : 'já avançado',
    durationMs: Date.now() - startedAt
  });
  return res.status(200).json({ ok: true });
}