// api/ifood/webhook.js
// Endpoint que o iFood chama quando acontece um evento de pedido.
// Configure essa URL no Portal do Desenvolvedor: https://SEU_DOMINIO.vercel.app/api/ifood/webhook
//
// IMPORTANTE: precisamos do corpo "crú" (raw) da requisição pra validar a assinatura
// HMAC corretamente, por isso desabilitamos o bodyParser automático do Vercel.

import crypto from 'crypto';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { getOrderDetails, classifyPayment } from '../../lib/ifood.js';
import { getDeliveryCoordinates } from '../../lib/deliveryAddress.js';
import { DRIVER_EARNING_PER_DELIVERY } from '../../lib/driverEarnings.js';

export const config = {
  api: { bodyParser: false }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function isValidSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', process.env.IFOOD_CLIENT_SECRET)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(signatureHeader, 'utf8');

  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  console.log('=== [API /api/ifood/webhook] REQUISIÇÃO RECEBIDA ===', {
    method: req.method,
    url: req.url,
    query: req.query,
    hasSignature: Boolean(req.headers['x-ifood-signature'])
  });

  if (req.method !== 'POST') {
    console.warn('=== [API /api/ifood/webhook] MÉTODO NÃO PERMITIDO ===', { method: req.method });
    return res.status(405).send('Method not allowed');
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('=== [API /api/ifood/webhook] FALHA AO LER CORPO ===', { error: err.message });
    return res.status(500).send('Could not read request body');
  }
  const signature = req.headers['x-ifood-signature'];

  if (!isValidSignature(rawBody, signature)) {
    console.warn('=== [API /api/ifood/webhook] ASSINATURA INVÁLIDA ===', {
      hasSignature: Boolean(signature),
      bodyLength: rawBody.length
    });
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('=== [API /api/ifood/webhook] JSON INVÁLIDO ===', { error: err.message });
    return res.status(400).send('Invalid JSON');
  }

  // o iFood pode mandar um evento único ou um array de eventos no mesmo POST
  const events = Array.isArray(payload) ? payload : [payload];

  console.log('=== [WEBHOOK] evento(s) recebido(s) do iFood ===', { count: events.length });

  let processingFailed = false;
  for (const event of events) {
    try {
      console.log('=== [WEBHOOK] processando evento do iFood ===', {
        eventId: event?.id || null,
        code: event?.code || null,
        orderId: event?.orderId || null
      });
      await recordWebhookAttempt(event, 'received');
      const outcome = await processEvent(event);
      await recordWebhookAttempt(event, outcome);
    } catch (err) {
      processingFailed = true;
      await recordWebhookAttempt(event, 'failed', err.message);
      console.error('=== [WEBHOOK] FALHA AO PROCESSAR EVENTO ===', {
        eventId: event?.id || null,
        code: event?.code || null,
        orderId: event?.orderId || null,
        error: err.message,
        codeError: err.code || null,
        details: err.details || null,
        hint: err.hint || null
      });
    }
  }

  const statusCode = processingFailed ? 500 : 202;
  console.log('=== [API /api/ifood/webhook] PROCESSAMENTO FINALIZADO ===', {
    eventCount: events.length,
    statusCode,
    durationMs: Date.now() - startedAt
  });
  return res.status(statusCode).send();
}

async function processEvent(event) {
  if (!event?.id) {
    throw new Error('Evento do iFood sem identificador; não é possível processá-lo com segurança');
  }

  const { data: already, error: lookupError } = await supabaseAdmin
    .from('webhook_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (already) {
    console.log('=== [WEBHOOK] evento duplicado ignorado ===', { eventId: event.id, code: event.code });
    return 'duplicate';
  }

  switch (String(event.code || '').toUpperCase()) {
    case 'KEEPALIVE':
      console.log('=== [WEBHOOK] keepalive do iFood recebido ===', { eventId: event.id });
      break;
    case 'PLC':
    case 'PLACED':
      await handlePlaced(event);
      break;
    case 'CFM':
    case 'CONFIRMED':
      await handleConfirmed(event);
      break;
    case 'RTP':
      await handleReadyToPickup(event);
      break;
    case 'DSP':
    case 'DISPATCHED':
      await handleDispatched(event);
      break;
    case 'CONC':
    case 'CON':
    case 'CONCLUDED':
      await handleConcluded(event);
      break;
    case 'CAN':
    case 'CANCELLED':
      await handleCancelled(event);
      break;
    default:
      console.warn('=== [WEBHOOK] evento recebido, mas não tratado ===', {
        eventId: event.id,
        code: event.code || null,
        orderId: event.orderId || null
      });
      break;
  }

  const { error: insertError } = await supabaseAdmin
    .from('webhook_events')
    .insert({ id: event.id });
  if (insertError && insertError.code !== '23505') throw insertError;
  console.log('=== [WEBHOOK] evento processado e registrado ===', {
    eventId: event.id,
    code: event.code || null,
    orderId: event.orderId || null,
    duplicateRace: insertError?.code === '23505'
  });
  return 'processed';
}

async function recordWebhookAttempt(event, outcome, errorMessage = null) {
  const { error } = await supabaseAdmin
    .from('ifood_webhook_attempts')
    .insert({
      event_id: typeof event?.id === 'string' ? event.id : null,
      order_id: typeof event?.orderId === 'string' ? event.orderId : null,
      code: typeof event?.code === 'string' ? event.code : null,
      outcome,
      error_message: errorMessage ? String(errorMessage).slice(0, 500) : null
    });

  if (error) {
    console.error('=== [WEBHOOK] FALHA AO REGISTRAR TENTATIVA NO BANCO ===', {
      eventId: event?.id || null,
      code: event?.code || null,
      orderId: event?.orderId || null,
      outcome,
      error: error.message,
      codeError: error.code || null
    });
  }
}

async function updateOrderStatusFromEvent(event, targetStatus, allowedStatuses, additionalValues = {}) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, status')
    .eq('ifood_order_id', event.orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error(`Pedido ${event.orderId} não encontrado para evento ${event.code}`);

  if (!allowedStatuses.includes(order.status)) {
    console.log('=== [WEBHOOK] transição já aplicada ou status mais avançado; sem alteração ===', {
      eventId: event.id,
      code: event.code,
      orderId: event.orderId,
      currentStatus: order.status,
      targetStatus
    });
    return;
  }

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from('orders')
    .update({ ...additionalValues, status: targetStatus })
    .eq('id', order.id)
    .in('status', allowedStatuses)
    .select('id')
    .maybeSingle();
  if (updateError) throw updateError;

  if (!updatedOrder) {
    const { data: latestOrder, error: latestOrderError } = await supabaseAdmin
      .from('orders')
      .select('status')
      .eq('id', order.id)
      .single();
    if (latestOrderError) throw latestOrderError;
    if (!allowedStatuses.includes(latestOrder.status)) return;
    throw new Error(`Não foi possível atualizar o pedido ${event.orderId} para ${targetStatus}`);
  }

  console.log('=== [WEBHOOK] status do pedido atualizado pelo evento ===', {
    eventId: event.id,
    code: event.code,
    orderId: event.orderId,
    status: targetStatus
  });
}

async function handleConfirmed(event) {
  await updateOrderStatusFromEvent(event, 'em_preparo', ['recebido']);
}

async function handleDispatched(event) {
  await updateOrderStatusFromEvent(event, 'em_rota', ['pronto'], {
    ifood_dispatched_at: new Date().toISOString(),
    ifood_dispatching_at: null
  });
}

async function handleReadyToPickup(event) {
  await updateOrderStatusFromEvent(event, 'pronto', ['em_preparo']);
}

async function handlePlaced(event) {
  const { data: existingOrder, error: existingOrderError } = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('ifood_order_id', event.orderId)
    .maybeSingle();
  if (existingOrderError) throw existingOrderError;
  if (existingOrder) {
    console.log('=== [WEBHOOK] pedido já existe; PLC não duplicado ===', {
      eventId: event.id,
      orderId: event.orderId,
      localOrderId: existingOrder.id
    });
    return;
  }

  const order = await getOrderDetails(event.orderId);

  console.log('=== [WEBHOOK] pedido carregado do iFood ===', {
    eventId: event.id,
    orderId: order?.id,
    displayId: order?.displayId,
    deliveryDateTime: order?.delivery?.deliveryDateTime || null
  });

  if (!order) throw new Error(`Pedido ${event.orderId} ainda não está disponível no iFood`);

  const payments = order.payment || order.payments;
  const paymentCategory = classifyPayment(payments);

  const customer = order.customer || {};
  const delivery = order.delivery || {};
  const address = delivery.deliveryAddress || {};
  const coordinates = getDeliveryCoordinates(address, delivery);

  if (customer.id) {
    const { error: customerError } = await supabaseAdmin
      .from('clientes')
      .upsert(
        { ifood_customer_id: customer.id, nome: customer.name },
        { onConflict: 'ifood_customer_id', ignoreDuplicates: false }
      );
    if (customerError) throw customerError;
  }

  const { data: insertedOrder, error } = await supabaseAdmin
    .from('orders')
    .insert({
      ifood_order_id: order.id,
      display_id: order.displayId,
      merchant_id: order.merchant?.id,
      ifood_customer_id: customer.id,
      customer_name: customer.name,
      street: address.streetName,
      street_number: address.streetNumber,
      neighborhood: address.neighborhood,
      complement: address.complement,
      reference: address.reference,
      city: address.city,
      state: address.state,
      postal_code: address.postalCode,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      payment_category: paymentCategory,
      payment_raw: payments,
      total_value: order.total?.orderAmount ?? 0,
      delivery_fee: order.total?.deliveryFee ?? 0,
      delivery_date_time: delivery.deliveryDateTime || null,
      status: 'recebido'
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return;
    console.error('=== [WEBHOOK] FALHA AO INSERIR PEDIDO NO SUPABASE ===', {
      eventId: event.id,
      orderId: order.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    throw error;
  }
  console.log('=== [WEBHOOK] pedido criado no Supabase ===', {
    eventId: event.id,
    orderId: order.id,
    localOrderId: insertedOrder.id,
    displayId: order.displayId
  });

  // NOTA: os nomes de campo abaixo (item.options, item.unitPrice) seguem o formato
  // documentado publicamente, mas vale conferir com um pedido de teste real no
  // ambiente sandbox do iFood antes de ir pra produção — adicionais podem vir
  // com um nome de campo levemente diferente dependendo da categoria do pedido.
  const items = order.items || [];
  for (const item of items) {
    const { data: insertedItem, error: itemError } = await supabaseAdmin
      .from('order_items')
      .insert({
        order_id: insertedOrder.id,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unitPrice ?? item.price ?? 0
      })
      .select()
      .single();

    if (itemError || !insertedItem) {
      console.error('=== [WEBHOOK] FALHA AO INSERIR ITEM DO PEDIDO ===', {
        eventId: event.id,
        orderId: order.id,
        localOrderId: insertedOrder.id,
        itemName: item.name,
        error: itemError?.message || 'Insert returned no item',
        code: itemError?.code || null
      });
      continue;
    }

    const additions = item.options || item.subItems || [];
    for (const add of additions) {
      const { error: additionError } = await supabaseAdmin.from('order_item_additions').insert({
        order_item_id: insertedItem.id,
        name: add.name,
        quantity: add.quantity ?? 1,
        unit_price: add.unitPrice ?? add.price ?? 0
      });
      if (additionError) {
        console.error('=== [WEBHOOK] FALHA AO INSERIR ADICIONAL DO PEDIDO ===', {
          eventId: event.id,
          orderId: order.id,
          localOrderId: insertedOrder.id,
          itemName: item.name,
          additionName: add.name,
          error: additionError.message,
          code: additionError.code
        });
      }
    }
  }
}

async function handleConcluded(event) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, status, driver_id, delivery_fee')
    .eq('ifood_order_id', event.orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error(`Pedido ${event.orderId} não encontrado para conclusão`);
  if (order.status === 'cancelado') {
    console.warn('=== [WEBHOOK] CONCLUSÃO IGNORADA: pedido já cancelado ===', {
      eventId: event.id,
      orderId: event.orderId,
      localOrderId: order.id
    });
    return;
  }

  let statusUpdated = false;
  if (order.status !== 'entregue') {
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'entregue', delivered_at: new Date().toISOString() })
      .eq('id', order.id)
      .neq('status', 'cancelado')
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    statusUpdated = Boolean(updatedOrder);
    if (!updatedOrder) {
      const { data: latestOrder, error: latestOrderError } = await supabaseAdmin
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .single();
      if (latestOrderError) throw latestOrderError;
      if (latestOrder.status === 'cancelado') return;
      if (latestOrder.status !== 'entregue') throw new Error('Não foi possível atualizar o status concluído');
    }
  }

  console.log('=== [WEBHOOK] pedido concluído no Supabase ===', {
    eventId: event.id,
    orderId: event.orderId,
    localOrderId: order.id,
    previousStatus: order.status,
    status: 'entregue',
    statusUpdated
  });

  if (order.driver_id) {
    const { data: history, error: historyLookupError } = await supabaseAdmin
      .from('delivery_history')
      .select('id')
      .eq('order_id', order.id)
      .limit(1)
      .maybeSingle();
    if (historyLookupError) throw historyLookupError;

    if (!history) {
      const { error: historyInsertError } = await supabaseAdmin.from('delivery_history').insert({
        driver_id: order.driver_id,
        order_id: order.id,
        valor_entrega: DRIVER_EARNING_PER_DELIVERY
      });
      if (historyInsertError) throw historyInsertError;
      console.log('=== [WEBHOOK] histórico de entrega criado ===', {
        eventId: event.id,
        orderId: event.orderId,
        localOrderId: order.id,
        driverId: order.driver_id
      });
    } else {
      console.log('=== [WEBHOOK] histórico de entrega já existia ===', {
        eventId: event.id,
        orderId: event.orderId,
        localOrderId: order.id
      });
    }
  }
}

async function handleCancelled(event) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, status')
    .eq('ifood_order_id', event.orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error(`Pedido ${event.orderId} não encontrado para cancelamento`);
  if (order.status === 'entregue') return;

  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({ status: 'cancelado' })
    .eq('id', order.id)
    .neq('status', 'entregue');
  if (updateError) throw updateError;
}