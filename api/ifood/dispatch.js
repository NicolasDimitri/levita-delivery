// api/ifood/dispatch.js
// Solicita ao iFood o despacho de um pedido de entrega própria.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { dispatchOrder, readyToPickupOrder } from '../../lib/ifood.js';

async function dispatchReadyOrder(orderId, driverId) {
  const { data: dispatchLock, error: lockError } = await supabaseAdmin.rpc('begin_driver_order_dispatch', {
    p_order_id: orderId,
    p_driver_id: driverId
  });

  if (lockError) {
    if (lockError.code !== 'P0001') {
      console.error('Não foi possível bloquear o pedido para despacho', {
        orderId,
        error: lockError.message,
        code: lockError.code
      });
    }
    return {
      orderId,
      status: 'failed',
      error: lockError.code === 'P0001'
        ? lockError.message
        : 'Não foi possível iniciar o despacho deste pedido.'
    };
  }

  if (!dispatchLock || !['already_requested', 'in_progress', 'started'].includes(dispatchLock.status)) {
    console.error('Resposta inesperada ao iniciar despacho do pedido', { orderId, dispatchLock });
    return {
      orderId,
      status: 'failed',
      error: 'Não foi possível iniciar o despacho deste pedido.'
    };
  }
  if (dispatchLock.status === 'started' && !dispatchLock.token) {
    console.error('Bloqueio de despacho sem token de confirmação', { orderId });
    return {
      orderId,
      status: 'uncertain',
      error: 'O despacho foi iniciado, mas não foi possível validar a tentativa. Confira o pedido no iFood.'
    };
  }

  if (dispatchLock.status === 'already_requested') {
    return { orderId, status: 'pending', message: 'Despacho já solicitado; aguardando confirmação do iFood.' };
  }
  if (dispatchLock.status === 'in_progress') {
    return { orderId, status: 'pending', message: 'O despacho deste pedido já está sendo processado.' };
  }

  const dispatchToken = dispatchLock.token;
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, ifood_order_id')
    .eq('id', orderId)
    .eq('driver_id', driverId)
    .single();

  if (orderError || !order) {
    console.error('Não foi possível validar o pedido após iniciar despacho', {
      orderId,
      error: orderError?.message || 'Pedido não encontrado'
    });
    return {
      orderId,
      status: 'uncertain',
      error: 'Não foi possível validar o pedido após iniciar o despacho. Confira o iFood antes de tentar novamente.'
    };
  }

  try {
    const ifoodRes = await dispatchOrder(order.ifood_order_id);
    if (!ifoodRes.ok) {
      const responseText = await ifoodRes.text();
      if (ifoodRes.status >= 500 || ifoodRes.status === 408) {
        console.error('Resposta incerta do iFood ao despachar pedido', {
          orderId,
          status: ifoodRes.status
        });
        return {
          orderId,
          status: 'uncertain',
          error: 'O iFood retornou uma falha que pode ter ocorrido após o despacho. Confira o pedido no iFood antes de tentar novamente.'
        };
      }

      const { data: unlockedOrder, error: unlockError } = await supabaseAdmin
        .from('orders')
        .update({ ifood_dispatching_at: null })
        .eq('id', order.id)
        .eq('driver_id', driverId)
        .eq('status', 'pronto')
        .eq('ifood_dispatching_at', dispatchToken)
        .is('ifood_dispatched_at', null)
        .select('id')
        .maybeSingle();

      if (unlockError || !unlockedOrder) {
        const { data: latestOrder, error: latestError } = await supabaseAdmin
          .from('orders')
          .select('status, ifood_dispatched_at')
          .eq('id', order.id)
          .single();
        if (!latestError && latestOrder?.ifood_dispatched_at &&
            ['em_rota', 'entregue'].includes(latestOrder.status)) {
          return { orderId, status: 'dispatched' };
        }

        console.error('Não foi possível liberar a tentativa recusada pelo iFood', {
          orderId,
          error: unlockError?.message || latestError?.message || 'A tentativa mudou antes de ser liberada',
          code: unlockError?.code || null
        });
        return {
          orderId,
          status: 'uncertain',
          error: 'O iFood recusou o despacho, mas não foi possível liberar a tentativa. Confira o pedido antes de tentar novamente.'
        };
      }

      return {
        orderId,
        status: 'failed',
        error: `iFood recusou o despacho${responseText ? `: ${responseText}` : '.'}`
      };
    }

    const dispatchedAt = new Date().toISOString();
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        ifood_dispatched_at: dispatchedAt,
        ifood_dispatching_at: null
      })
      .eq('id', order.id)
      .eq('driver_id', driverId)
      .eq('status', 'pronto')
      .eq('ifood_dispatching_at', dispatchToken)
      .select('id')
      .maybeSingle();

    if (updateError || !updatedOrder) {
      const { data: latestOrder, error: latestError } = await supabaseAdmin
        .from('orders')
        .select('status, ifood_dispatched_at')
        .eq('id', order.id)
        .single();

      if (!latestError && latestOrder?.ifood_dispatched_at &&
          ['em_rota', 'entregue'].includes(latestOrder.status)) {
        return { orderId, status: 'dispatched' };
      }

      if (!latestError && ['em_rota', 'entregue'].includes(latestOrder?.status)) {
        const { data: reconciledOrder, error: reconcileError } = await supabaseAdmin
          .from('orders')
          .update({
            ifood_dispatched_at: latestOrder.ifood_dispatched_at || dispatchedAt,
            ifood_dispatching_at: null
          })
          .eq('id', order.id)
          .in('status', ['em_rota', 'entregue'])
          .eq('ifood_dispatching_at', dispatchToken)
          .select('id')
          .maybeSingle();
        if (!reconcileError && reconciledOrder) {
          return { orderId, status: 'dispatched' };
        }
        console.error('Webhook confirmou o despacho, mas não foi possível sincronizar o pedido', {
          orderId,
          error: reconcileError?.message || 'O pedido mudou durante a sincronização'
        });
      }

      console.error('iFood aceitou o despacho, mas a atualização local precisa de conferência', {
        orderId,
        error: updateError?.message || latestError?.message || 'O pedido não foi atualizado'
      });
      return {
        orderId,
        status: 'uncertain',
        error: 'iFood aceitou o despacho, mas o sistema precisa de conferência. Verifique o pedido no iFood.'
      };
    }

    return { orderId, status: 'dispatched' };
  } catch (error) {
    console.error('Resultado do despacho ao iFood é incerto', {
      orderId,
      error: error.message
    });
    return {
      orderId,
      status: 'uncertain',
      error: 'Não foi possível confirmar a resposta do iFood. Confira o pedido no iFood antes de tentar novamente.'
    };
  }
}

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

  const { orderId, orderIds, action = 'dispatch' } = req.body || {};
  if (!['ready', 'dispatch', 'reconcile-dispatch', 'release-dispatch'].includes(action)) {
    return res.status(400).json({ error: 'action inválida' });
  }

  if (action === 'dispatch') {
    if (profile?.role !== 'driver') {
      console.warn('=== [API /api/ifood/dispatch] PERFIL SEM PERMISSÃO PARA DESPACHAR ===', {
        role: profile?.role || null
      });
      return res.status(403).json({ error: 'Somente o entregador atribuído pode despachar seus pedidos.' });
    }

    const requestedIds = Array.isArray(orderIds) ? orderIds : orderId ? [orderId] : [];
    const uniqueIds = [...new Set(requestedIds)];
    const isUuid = (id) => typeof id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

    if (uniqueIds.length < 1 || uniqueIds.length > 3 || uniqueIds.some((id) => !isUuid(id))) {
      return res.status(400).json({ error: 'Informe de 1 a 3 pedidos válidos para despachar.' });
    }

    const results = [];
    for (const id of uniqueIds) {
      results.push(await dispatchReadyOrder(id, userData.user.id));
    }
    return res.status(200).json({ results });
  }

  if (profile?.role !== 'admin') {
    console.warn('=== [API /api/ifood/dispatch] PERFIL SEM PERMISSÃO ===', { role: profile?.role || null });
    return res.status(403).json({ error: 'Apenas administradores podem atualizar o status de preparo' });
  }
  if (!orderId) {
    console.warn('=== [API /api/ifood/dispatch] orderId AUSENTE ===');
    return res.status(400).json({ error: 'orderId é obrigatório' });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, ifood_order_id, display_id, status, driver_id, ifood_dispatched_at, ifood_dispatching_at')
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
    if (order.status !== 'pronto' || (!order.ifood_dispatched_at && !order.ifood_dispatching_at)) {
      return res.status(409).json({
        error: 'Só é possível sincronizar um despacho pendente de um pedido pronto.'
      });
    }

    let reconcileQuery = supabaseAdmin
      .from('orders')
      .update({
        status: 'em_rota',
        ifood_dispatched_at: order.ifood_dispatched_at || order.ifood_dispatching_at,
        ifood_dispatching_at: null
      })
      .eq('id', order.id)
      .eq('status', 'pronto');
    reconcileQuery = order.ifood_dispatched_at
      ? reconcileQuery.eq('ifood_dispatched_at', order.ifood_dispatched_at)
      : reconcileQuery.eq('ifood_dispatching_at', order.ifood_dispatching_at);
    const { data: updatedOrder, error: reconcileError } = await reconcileQuery
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

  if (action === 'release-dispatch') {
    if (order.status !== 'pronto' || order.ifood_dispatched_at || !order.ifood_dispatching_at) {
      return res.status(409).json({
        error: 'Não há uma tentativa incerta que possa ser liberada para este pedido.'
      });
    }

    const { data: releasedOrder, error: releaseError } = await supabaseAdmin
      .from('orders')
      .update({ ifood_dispatching_at: null })
      .eq('id', order.id)
      .eq('status', 'pronto')
      .eq('ifood_dispatching_at', order.ifood_dispatching_at)
      .is('ifood_dispatched_at', null)
      .select('id')
      .maybeSingle();

    if (releaseError) {
      console.error('Falha ao liberar a tentativa de despacho', releaseError);
      return res.status(500).json({ error: 'Não foi possível liberar a tentativa de despacho.' });
    }
    if (!releasedOrder) {
      return res.status(409).json({ error: 'O pedido mudou. Atualize a tela e tente novamente.' });
    }
    return res.status(200).json({ ok: true, released: true });
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

  return res.status(400).json({ error: 'Ação inválida' });
}