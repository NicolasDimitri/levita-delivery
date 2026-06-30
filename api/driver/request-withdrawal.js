// api/driver/request-withdrawal.js
// Cria uma solicitação de saque pro entregador autenticado.
// Sempre pega o saldo TOTAL disponível no momento (não aceita valor
// parcial vindo do frontend) — o valor é recalculado aqui no servidor
// com service_role, pra um driver não conseguir forjar um total maior
// do que realmente tem direito mandando um insert direto.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  console.log('=== [API /api/driver/request-withdrawal] REQUISIÇÃO RECEBIDA ===');
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
    console.log('=== [API /api/driver/request-withdrawal] FALHA NA AUTENTICAÇÃO ===');
    console.log(JSON.stringify({ userError, userData }, null, 2));
    return res.status(401).json({ error: 'Não autenticado' });
  }
  const driverId = userData.user.id;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, pix_key')
    .eq('id', driverId)
    .single();

  if (profile?.role !== 'driver') {
    return res.status(403).json({ error: 'Apenas entregadores podem solicitar saque' });
  }

  if (!profile.pix_key) {
    return res.status(400).json({
      error: 'Cadastre sua chave PIX no seu perfil antes de solicitar um saque'
    });
  }

  // já existe uma solicitação pendente? não deixa duplicar
  const { data: existingPending } = await supabaseAdmin
    .from('withdrawal_requests')
    .select('id')
    .eq('driver_id', driverId)
    .eq('status', 'pendente')
    .limit(1);

  if (existingPending && existingPending.length > 0) {
    return res.status(400).json({ error: 'Você já tem uma solicitação de saque pendente' });
  }

  // busca TODAS as entregas concluídas que ainda não entraram em nenhuma
  // solicitação de saque anterior — mesma lógica da função SQL
  // driver_available_balance(), mas feita aqui em 2 queries pra já
  // sair com os IDs das linhas que vão virar withdrawal_request_items
  const { data: alreadyWithdrawn } = await supabaseAdmin
    .from('withdrawal_request_items')
    .select('delivery_history_id');

  const withdrawnIds = new Set((alreadyWithdrawn || []).map((r) => r.delivery_history_id));

  const { data: history, error: historyError } = await supabaseAdmin
    .from('delivery_history')
    .select('id, valor_entrega')
    .eq('driver_id', driverId);

  if (historyError) {
    console.error('=== [API /api/driver/request-withdrawal] erro ao buscar delivery_history ===', historyError);
    return res.status(500).json({ error: 'Erro ao calcular saldo disponível' });
  }

  const availableRows = (history || []).filter((row) => !withdrawnIds.has(row.id));
  const totalValue = availableRows.reduce((sum, row) => sum + Number(row.valor_entrega), 0);

  console.log('=== [API /api/driver/request-withdrawal] saldo calculado ===');
  console.log(JSON.stringify({ driverId, totalValue, qtdEntregas: availableRows.length }, null, 2));

  if (availableRows.length === 0 || totalValue <= 0) {
    return res.status(400).json({ error: 'Não há saldo disponível para sacar' });
  }

  const { data: withdrawalRequest, error: insertError } = await supabaseAdmin
    .from('withdrawal_requests')
    .insert({
      driver_id: driverId,
      pix_key: profile.pix_key,
      total_value: totalValue,
      status: 'pendente'
    })
    .select()
    .single();

  if (insertError) {
    console.error('=== [API /api/driver/request-withdrawal] erro ao criar solicitação ===', insertError);
    return res.status(500).json({ error: 'Erro ao criar solicitação de saque' });
  }

  const itemsToInsert = availableRows.map((row) => ({
    withdrawal_request_id: withdrawalRequest.id,
    delivery_history_id: row.id
  }));

  const { error: itemsError } = await supabaseAdmin.from('withdrawal_request_items').insert(itemsToInsert);

  if (itemsError) {
    // a solicitação já foi criada mas os itens falharam — desfaz a solicitação
    // pra não ficar um saque "fantasma" sem nenhuma entrega vinculada
    console.error('=== [API /api/driver/request-withdrawal] erro ao vincular itens, desfazendo solicitação ===', itemsError);
    await supabaseAdmin.from('withdrawal_requests').delete().eq('id', withdrawalRequest.id);
    return res.status(500).json({ error: 'Erro ao registrar as entregas dessa solicitação' });
  }

  console.log('=== [API /api/driver/request-withdrawal] SUCESSO — solicitação criada ===');
  return res.status(200).json({ ok: true, withdrawalRequest });
}