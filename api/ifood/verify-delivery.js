// api/ifood/verify-delivery.js
// Chamado pela tela do entregador quando ele confirma uma entrega.
// Body esperado: { orderId: <uuid do supabase>, code?: string, useStoredCode?: boolean }
//
// Fluxo:
// 1. Confere se quem está chamando é o entregador responsável (ou admin)
// 2. Define qual código usar: o digitado, ou o código salvo do cliente
// 3. Valida o código direto com o iFood (verifyDeliveryCode)
// 4. Se válido: marca pedido como entregue, salva o código no cadastro do
//    cliente (pra próximas entregas) e registra no histórico do entregador

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { verifyDeliveryCode } from '../../lib/ifood.js';

export default async function handler(req, res) {
  console.log('=== [API /api/ifood/verify-delivery] REQUISIÇÃO RECEBIDA ===', {
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
    console.log('=== [API /api/ifood/verify-delivery] FALHA NA AUTENTICAÇÃO ===');
    return res.status(401).json({ error: 'Não autenticado' });
  }
  const requesterId = userData.user.id;

  const { orderId, code, useStoredCode } = req.body || {};

  console.log('=== [VERIFY-DELIVERY] requisição recebida do app do entregador ===', {
    orderId,
    hasCode: Boolean(code),
    useStoredCode,
    requesterId
  });

  if (!orderId) {
    return res.status(400).json({ error: 'orderId é obrigatório' });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    console.log('=== [API /api/ifood/verify-delivery] PEDIDO NÃO ENCONTRADO ===', { orderId, orderError: Boolean(orderError) });
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }

  if (order.status !== 'em_rota') {
    return res.status(409).json({ error: 'A entrega só pode ser confirmada depois do despacho' });
  }

  // só o entregador responsável ou um admin pode confirmar essa entrega
  if (order.driver_id !== requesterId) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', requesterId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão para confirmar esse pedido' });
    }
  }

  let codeToUse = code;

  if (useStoredCode) {
    const { data: cliente } = await supabaseAdmin
      .from('clientes')
      .select('ultimo_codigo_confirmacao')
      .eq('ifood_customer_id', order.ifood_customer_id)
      .maybeSingle();

    if (!cliente?.ultimo_codigo_confirmacao) {
      return res.status(400).json({ error: 'Não há código salvo para esse cliente ainda' });
    }
    codeToUse = cliente.ultimo_codigo_confirmacao;
  }

  if (!codeToUse) {
    return res.status(400).json({ error: 'Código não informado' });
  }

  let result;
  try {
    result = await verifyDeliveryCode(order.ifood_order_id, codeToUse);
    console.log('=== [VERIFY-DELIVERY] resposta do iFood (verifyDeliveryCode) ===', { valid: Boolean(result?.valid) });
  } catch (err) {
    console.error('=== [VERIFY-DELIVERY] erro retornado pelo iFood ===');
    console.error(err.message);
    // devolve o motivo real pro frontend, em vez de uma mensagem genérica
    return res.status(502).json({ error: err.message });
  }

  if (!result.valid) {
    return res.status(200).json({ valid: false });
  }

  // A partir daqui o iFood já confirmou a entrega. Falha ao persistir o estado
  // local deve ser explícita para que a reconciliação pelo webhook possa ocorrer.
  try {
    const { data: updatedOrder, error: updateOrderError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'entregue',
        delivery_code_confirmado: codeToUse,
        delivered_at: new Date().toISOString()
      })
      .eq('id', order.id)
      .eq('status', 'em_rota')
      .select('id')
      .maybeSingle();

    if (updateOrderError) {
      console.error('iFood confirmou a entrega, mas a atualização local falhou', updateOrderError);
      return res.status(500).json({
        error: 'iFood confirmou a entrega, mas o sistema não conseguiu atualizar o pedido. Aguarde a sincronização automática.'
      });
    }
    if (!updatedOrder) {
      return res.status(409).json({ error: 'O status do pedido mudou durante a confirmação. Atualize a tela.' });
    }

    if (order.ifood_customer_id) {
      const { error: updateClienteError } = await supabaseAdmin
        .from('clientes')
        .update({
          ultimo_codigo_confirmacao: codeToUse,
          ultimo_codigo_confirmado_em: new Date().toISOString()
        })
        .eq('ifood_customer_id', order.ifood_customer_id);

      if (updateClienteError) {
        console.error('=== [VERIFY-DELIVERY] falha ao salvar codigo do cliente ===', updateClienteError);
      }
    }

    if (order.driver_id) {
      const { data: existingHistory, error: historyLookupError } = await supabaseAdmin
        .from('delivery_history')
        .select('id')
        .eq('order_id', order.id)
        .limit(1)
        .maybeSingle();
      if (historyLookupError) {
        console.error('Falha ao verificar o histórico da entrega', historyLookupError);
      } else if (!existingHistory) {
        const { error: historyError } = await supabaseAdmin.from('delivery_history').insert({
          driver_id: order.driver_id,
          order_id: order.id,
          valor_entrega: order.delivery_fee
        });
        if (historyError) {
          console.error('Falha ao registrar histórico de entrega', historyError);
        }
      }
    }
  } catch (err) {
    console.error('=== [VERIFY-DELIVERY] erro inesperado pós-confirmação iFood ===', err);
    return res.status(500).json({
      error: 'iFood confirmou a entrega, mas ocorreu uma falha ao salvar o resultado. Aguarde a sincronização automática.'
    });
  }

  console.log('=== [API /api/ifood/verify-delivery] SUCESSO — respondendo valid:true ===');
  return res.status(200).json({ valid: true });
}