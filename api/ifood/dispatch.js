// api/ifood/dispatch.js
// Solicita ao iFood o despacho de um pedido de entrega própria.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { dispatchOrder, readyToPickupOrder } from '../../lib/ifood.js';

export default async function handler(req, res) {
  const startedAt = Date.now();
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
    console.warn('=== [API /api/ifood/dispatch] FALHA NA AUTENTICAÇÃO ===', {
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
    console.error('=== [API /api/ifood/dispatch] FALHA AO CONSULTAR PERFIL ===', profileError);
    return res.status(500).json({ error: 'Não foi possível validar o perfil do usuário' });
  }

  if (profile?.role !== 'admin') {
    console.warn('=== [API /api/ifood/dispatch] PERFIL SEM PERMISSÃO ===', { role: profile?.role || null });
    return res.status(403).json({ error: 'Apenas administradores podem despachar pedidos' });
  }

  const { orderId, action = 'dispatch' } = req.body || {};
  if (!orderId) {
    console.warn('=== [API /api/ifood/dispatch] orderId AUSENTE ===');
    return res.status(400).json({ error: 'orderId é obrigatório' });
  }
  if (!['ready', 'dispatch', 'reconcile-dispatch'].includes(action)) {
    return res.status(400).json({ error: 'action inválida' });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, ifood_order_id, display_id, status, driver_id, ifood_dispatched_at')
    .eq('id', orderId)
    .single();
  if (orderError || !order) {
    console.error('=== [API /api/ifood/dispatch] PEDIDO NÃO ENCONTRADO NO SUPABASE ===', {
      orderId,
      error: orderError?.message || null,
      code: orderError?.code || null
    });
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  console.log('=== [API /api/ifood/dispatch] VALIDANDO PEDIDO ===', {
    orderId: order.id,
    ifoodOrderId: order.ifood_order_id,
    currentStatus: order.status,
    hasAssignedDriver: Boolean(order.driver_id)
  });

  if (action === 'reconcile-dispatch') {
    if (order.status !== 'pronto' || !order.ifood_dispatched_at) {
      return res.status(409).json({
        error: 'Só é possível sincronizar um despacho pendente de um pedido pronto.'
      });
    }

    const { data: updatedOrder, error: reconcileError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'em_rota' })
      .eq('id', order.id)
      .eq('status', 'pronto')
      .not('ifood_dispatched_at', 'is', null)
      .select('id')
      .maybeSingle();

    if (reconcileError) {
      console.error('=== [API /api/ifood/dispatch] FALHA AO SINCRONIZAR DESPACHO CONFIRMADO ===', {
        orderId: order.id,
        ifoodOrderId: order.ifood_order_id,
        error: reconcileError.message,
        code: reconcileError.code
      });
      return res.status(500).json({ error: 'Não foi possível sincronizar o despacho no sistema' });
    }

    if (!updatedOrder) {
      return res.status(409).json({
        error: 'O pedido mudou de status. Atualize a tela antes de sincronizar.'
      });
    }

    console.log('=== [API /api/ifood/dispatch] DESPACHO SINCRONIZADO APÓS CONFIRMAÇÃO MANUAL ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id
    });
    return res.status(200).json({ ok: true, status: 'em_rota', reconciled: true });
  }

  if (action === 'ready') {
    if (order.status !== 'em_preparo') {
      return res.status(409).json({ error: 'O pedido precisa estar em preparo antes de ser marcado como pronto' });
    }

    console.log('=== [API /api/ifood/dispatch] INFORMANDO PEDIDO PRONTO AO IFOOD ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id,
      displayId: order.display_id
    });

    try {
      const ifoodRes = await readyToPickupOrder(order.ifood_order_id);
      console.log('=== [API /api/ifood/dispatch] RESPOSTA DO IFOOD (readyToPickup) ===', {
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
      console.error('=== [API /api/ifood/dispatch] EXCEÇÃO AO INFORMAR PEDIDO PRONTO ===', {
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
      console.error('=== [API /api/ifood/dispatch] IFOOD ACEITOU, MAS SUPABASE FALHOU AO MARCAR PRONTO ===', {
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
        console.error('=== [API /api/ifood/dispatch] FALHA AO VERIFICAR STATUS APÓS MARCAR PRONTO ===', {
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

    console.log('=== [API /api/ifood/dispatch] PEDIDO PRONTO ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id,
      status: updatedOrder ? 'pronto' : 'já avançado',
      durationMs: Date.now() - startedAt
    });
    return res.status(200).json({ ok: true });
  }

  if (order.status !== 'pronto') {
    console.warn('=== [API /api/ifood/dispatch] STATUS IMPEDE DESPACHO ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id,
      currentStatus: order.status
    });
    return res.status(409).json({ error: 'O pedido precisa estar pronto antes do despacho' });
  }
  if (!order.driver_id) {
    console.warn('=== [API /api/ifood/dispatch] PEDIDO SEM ENTREGADOR ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id
    });
    return res.status(400).json({ error: 'Atribua um entregador antes de despachar o pedido' });
  }
  if (order.ifood_dispatched_at) {
    console.log('=== [API /api/ifood/dispatch] DESPACHO JÁ SOLICITADO; AGUARDANDO EVENTO DSP ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id,
      dispatchedAt: order.ifood_dispatched_at
    });
    return res.status(200).json({ ok: true, pending: true });
  }
  const { data: assignedDriver, error: assignedDriverError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', order.driver_id)
    .eq('role', 'driver')
    .single();
  if (assignedDriverError || !assignedDriver) {
    console.error('=== [API /api/ifood/dispatch] ENTREGADOR ATRIBUÍDO INVÁLIDO ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id,
      error: assignedDriverError?.message || null,
      code: assignedDriverError?.code || null
    });
    return res.status(409).json({ error: 'O pedido não está atribuído a um entregador válido' });
  }

  console.log('=== [API /api/ifood/dispatch] CHAMANDO DISPATCH (MERCHANT) ===', {
    orderId: order.id,
    ifoodOrderId: order.ifood_order_id
  });
  try {
    const ifoodRes = await dispatchOrder(order.ifood_order_id);
    console.log('=== [API /api/ifood/dispatch] RESPOSTA DO IFOOD (dispatch) ===', {
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
      console.error('=== [API /api/ifood/dispatch] IFOOD RECUSOU O DESPACHO ===', {
        orderId: order.id,
        ifoodOrderId: order.ifood_order_id,
        status: ifoodRes.status,
        ...errorDetails
      });
      return res.status(502).json({ error: `iFood recusou o despacho: ${text}` });
    }
  } catch (err) {
    console.error('=== [API /api/ifood/dispatch] EXCEÇÃO AO CHAMAR IFOOD ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id,
      durationMs: Date.now() - startedAt,
      error: err.message
    });
    return res.status(502).json({ error: 'Erro ao despachar pedido no iFood' });
  }

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from('orders')
    .update({ ifood_dispatched_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('driver_id', order.driver_id)
    .select('id')
    .maybeSingle();
  if (updateError) {
    console.error('=== [API /api/ifood/dispatch] IFOOD ACEITOU, MAS SUPABASE FALHOU ===', {
      orderId: order.id,
      ifoodOrderId: order.ifood_order_id,
      error: updateError.message,
      code: updateError.code,
      details: updateError.details,
      hint: updateError.hint
    });
    return res.status(500).json({ error: 'iFood despachou o pedido, mas o sistema não conseguiu atualizar o status local' });
  }
  if (!updatedOrder) {
    const { data: latestOrder, error: latestOrderError } = await supabaseAdmin
      .from('orders')
      .select('status, driver_id')
      .eq('id', order.id)
      .single();
    if (latestOrderError) {
      console.error('=== [API /api/ifood/dispatch] FALHA AO VERIFICAR STATUS APÓS CONFLITO ===', {
        orderId: order.id,
        ifoodOrderId: order.ifood_order_id,
        error: latestOrderError.message,
        code: latestOrderError.code
      });
      return res.status(500).json({ error: 'iFood despachou o pedido, mas o sistema não conseguiu verificar o status local' });
    }
    if (latestOrder.driver_id !== order.driver_id || !['em_rota', 'entregue'].includes(latestOrder.status)) {
      console.warn('=== [API /api/ifood/dispatch] STATUS LOCAL INESPERADO APÓS SUCESSO IFOOD ===', {
        orderId: order.id,
        ifoodOrderId: order.ifood_order_id,
        status: latestOrder.status
      });
      return res.status(409).json({ error: 'iFood despachou o pedido, mas o status local mudou. Atualize a tela.' });
    }
  }

  console.log('=== [API /api/ifood/dispatch] SUCESSO ===', {
    orderId: order.id,
    ifoodOrderId: order.ifood_order_id,
    status: updatedOrder ? 'despacho solicitado; aguardando evento DSP' : 'já avançado',
    durationMs: Date.now() - startedAt
  });
  return res.status(200).json({ ok: true });
}