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

  for (const event of events) {
    try {
      await processEvent(event);
    } catch (err) {
      // não interrompe o processamento dos outros eventos do lote
      console.error('Erro ao processar evento', event?.id, event?.code, err);
    }
  }

  // responde rápido com 202, como recomendado pela doc do iFood
  return res.status(202).send();
}

async function processEvent(event) {
  if (!event?.id) return;

  // dedupe — o iFood pode reenviar o mesmo evento
  const { data: already } = await supabaseAdmin
    .from('webhook_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle();

  if (already) return;

  await supabaseAdmin.from('webhook_events').insert({ id: event.id });

  switch (event.code) {
    case 'PLC':
    case 'PLACED':
      await handlePlaced(event);
      break;
    case 'CONC':
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
}

async function handlePlaced(event) {
  const order = await getOrderDetails(event.orderId);

  // pedido pode ainda não estar disponível (404) — nesse caso ignoramos,
  // o evento de confirmação seguinte vai trazer o status atualizado
  if (!order) return;

  const payments = order.payment || order.payments;
  const paymentCategory = classifyPayment(payments);

  const customer = order.customer || {};
  const delivery = order.delivery || {};
  const address = delivery.deliveryAddress || {};

  if (customer.id) {
    await supabaseAdmin
      .from('clientes')
      .upsert(
        { ifood_customer_id: customer.id, nome: customer.name },
        { onConflict: 'ifood_customer_id', ignoreDuplicates: false }
      );
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
      status: 'recebido'
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao inserir pedido', error);
    return;
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
  await supabaseAdmin
    .from('orders')
    .update({ status: 'entregue', delivered_at: new Date().toISOString() })
    .eq('ifood_order_id', event.orderId)
    .neq('status', 'entregue');
}

async function handleCancelled(event) {
  await supabaseAdmin.from('orders').update({ status: 'cancelado' }).eq('ifood_order_id', event.orderId);
}
