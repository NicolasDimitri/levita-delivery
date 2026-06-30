// api/ifood/store-hours-status.js
// Verifica se as 3 lojas têm o turno de HOJE configurado no horário de
// funcionamento. Usado pra decidir se o botão mostra "Aberto" (verde) ou
// "Fechado" (vermelho) na tela de admin.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { getOpeningHours, getTodayDayOfWeek } from '../../lib/ifood.js';

export default async function handler(req, res) {
  console.log('=== [API /api/ifood/store-hours-status] REQUISIÇÃO RECEBIDA ===');
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
    console.log('=== [API /api/ifood/store-hours-status] FALHA NA AUTENTICAÇÃO ===');
    console.log(JSON.stringify({ userError, userData }, null, 2));
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const merchantIds = (process.env.IFOOD_MERCHANT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const today = getTodayDayOfWeek();
  const stores = [];

  for (const merchantId of merchantIds) {
    try {
      const shifts = await getOpeningHours(merchantId);
      console.log(`=== [API /api/ifood/store-hours-status] shifts da loja ${merchantId} ===`);
      console.log(JSON.stringify(shifts, null, 2));
      const open = shifts.some((s) => s.dayOfWeek === today);
      stores.push({ merchantId, open });
    } catch (err) {
      console.error(`=== [API /api/ifood/store-hours-status] ERRO ao buscar horários da loja ${merchantId} ===`);
      console.error(err);
      stores.push({ merchantId, open: null, error: err.message });
    }
  }

  // só consideramos "tudo aberto" se TODAS as lojas tiverem hoje configurado
  const allOpen = stores.length > 0 && stores.every((s) => s.open === true);

  console.log('=== [API /api/ifood/store-hours-status] SUCESSO — respondendo ===');
  console.log(JSON.stringify({ today, allOpen, stores }, null, 2));
  return res.status(200).json({ today, allOpen, stores });
}