// api/ifood/webhook.js
// Endpoint que o iFood chama quando acontece um evento de pedido.
// Configure essa URL no Portal do Desenvolvedor: https://SEU_DOMINIO.vercel.app/api/ifood/webhook
//
// IMPORTANTE: precisamos do corpo "crú" (raw) da requisição pra validar a assinatura
// HMAC corretamente, por isso desabilitamos o bodyParser automático do Vercel.

import crypto from 'crypto';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { getOrderDetails, classifyPayment } from '../../lib/ifood.js';

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
  console.log('=== [API /api/ifood/webhook] REQUISIÇÃO RECEBIDA ===', {
    method: req.method,
    url: req.url,
    query: req.query,
    hasSignature: Boolean(req.headers['x-ifood-signature'])
  });

  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['x-ifood-signature'];

  if (!isValidSignature(rawBody, signature)) {
    console.warn('Webhook com assinatura inválida recebido');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // o iFood pode mandar um evento único ou um array de eventos no mesmo POST
  const events = Array.isArray(payload) ? payload : [payload];

  console.log('=== [WEBHOOK] evento(s) recebido(s) do iFood ===', { count: events.length });

  let processingFailed = false;
  for (const event of events) {
    try {
      await processEvent(event);
    } catch (err) {
      processingFailed = true;
      console.error('Erro ao processar evento', event?.id, event?.code, err);
    }
  }

  return res.status(processingFailed ? 500 : 202).send();
}

async function processEvent(event) {
  if (!event?.id) return;

  const { data: already, error: lookupError } = await supabaseAdmin
    .from('webhook_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (already) return;

  switch (event.code) {
    case 'PLC':
    case 'PLACED':
      await handlePlaced(event);
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
      // outros eventos (CFM/CONFIRMED, DSP/DISPATCHED, etc.) não usados no MVP
      break;
  }

  const { error: insertError } = await supabaseAdmin
    .from('webhook_events')
    .insert({ id: event.id });
  if (insertError && insertError.code !== '23505') throw insertError;
}

async function handlePlaced(event) {
  const { data: existingOrder, error: existingOrderError } = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('ifood_order_id', event.orderId)
    .maybeSingle();
  if (existingOrderError) throw existingOrderError;
  if (existingOrder) return;

  const order = await getOrderDetails(event.orderId);

  console.log('=== [WEBHOOK] pedido carregado do iFood ===', { orderId: order?.id, displayId: order?.displayId });

  if (!order) throw new Error(`Pedido ${event.orderId} ainda não está disponível no iFood`);

  const payments = order.payment || order.payments;
  const paymentCategory = classifyPayment(payments);

  const customer = order.customer || {};
  const delivery = order.delivery || {};
  const address = delivery.deliveryAddress || {};

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
    console.error('Erro ao inserir pedido', error);
    throw error;
  }

  // NOTA: os nomes de campo abaixo (item.options, item.unitPrice) seguem o formato
  // documentado publicamente, mas vale conferir com um pedido de teste real no
  // ambiente sandbox do iFood antes de ir pra produção — adicionais podem vir
  // com um nome de campo levemente diferente dependendo da categoria do pedido.
  const items = order.items || [];
  for (const item of items) {
    const { data: insertedItem } = await supabaseAdmin
      .from('order_items')
      .insert({
        order_id: insertedOrder.id,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unitPrice ?? item.price ?? 0
      })
      .select()
      .single();

    if (!insertedItem) continue;

    const additions = item.options || item.subItems || [];
    for (const add of additions) {
      await supabaseAdmin.from('order_item_additions').insert({
        order_item_id: insertedItem.id,
        name: add.name,
        quantity: add.quantity ?? 1,
        unit_price: add.unitPrice ?? add.price ?? 0
      });
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
  if (order.status === 'cancelado') return;

  if (order.status !== 'entregue') {
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'entregue', delivered_at: new Date().toISOString() })
      .eq('id', order.id)
      .neq('status', 'cancelado')
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
      if (latestOrder.status === 'cancelado') return;
      if (latestOrder.status !== 'entregue') throw new Error('Não foi possível atualizar o status concluído');
    }
  }

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
        valor_entrega: order.delivery_fee
      });
      if (historyInsertError) throw historyInsertError;
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