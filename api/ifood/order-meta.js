// api/ifood/order-meta.js
// Usado pela tela do entregador pra saber se pode mostrar o botão
// "Confirmar entrega sem código" — sem nunca expor o código em si pro frontend.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  console.log('=== [API /api/ifood/order-meta] REQUISIÇÃO RECEBIDA ===');
  console.log(JSON.stringify({
    method: req.method,
    url: req.url,
    headers: req.headers,
    query: req.query,
    body: req.body,
    cookies: req.cookies
  }, null, 2));

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    console.log('=== [API /api/ifood/order-meta] FALHA NA AUTENTICAÇÃO ===');
    console.log(JSON.stringify({ userError, userData }, null, 2));
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: 'orderId é obrigatório' });

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('driver_id, ifood_customer_id')
    .eq('id', orderId)
    .single();

  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  if (order.driver_id !== userData.user.id) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();
    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão' });
    }
  }

  let hasStoredCode = false;
  if (order.ifood_customer_id) {
    const { data: cliente } = await supabaseAdmin
      .from('clientes')
      .select('ultimo_codigo_confirmacao')
      .eq('ifood_customer_id', order.ifood_customer_id)
      .maybeSingle();
    hasStoredCode = Boolean(cliente?.ultimo_codigo_confirmacao);
  }

  console.log('=== [API /api/ifood/order-meta] SUCESSO — respondendo ===');
  console.log(JSON.stringify({ hasStoredCode }, null, 2));
  return res.status(200).json({ hasStoredCode });
}