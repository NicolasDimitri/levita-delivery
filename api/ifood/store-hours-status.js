// api/ifood/store-hours-status.js
// Verifica se as 3 lojas têm o turno de HOJE configurado no horário de
// funcionamento. Usado pra decidir se o botão mostra "Aberto" (verde) ou
// "Fechado" (vermelho) na tela de admin.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import {
  getOpeningHours,
  getTodayDayOfWeek,
  getInterruptions,
  isOpeningHoursOpen,
  isInterruptionActive
} from '../../lib/ifood.js';

export default async function handler(req, res) {
  console.log('=== [API /api/ifood/store-hours-status] REQUISIÇÃO RECEBIDA ===', {
    method: req.method,
    url: req.url,
    hasAuth: Boolean(req.headers.authorization),
    query: req.query
  });

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    console.log('=== [API /api/ifood/store-hours-status] FALHA NA AUTENTICAÇÃO ===');
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem consultar o status das lojas' });
  }

  const merchantIds = (process.env.IFOOD_MERCHANT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const today = getTodayDayOfWeek();
  const stores = [];

  for (const merchantId of merchantIds) {
    try {
      const interruptions = await getInterruptions(merchantId);
      const hasActiveInterruption = interruptions.some((interruption) => isInterruptionActive(interruption));
      const hasManualInterruption = interruptions.some(
        (interruption) => interruption.description === 'Levita Delivery - fechamento manual'
      );

      // Uma interrupção ativa já é suficiente para considerar a loja fechada.
      // Além de ser a fonte mais direta, isso evita que uma falha transitória
      // no endpoint de horários faça o botão oscilar para um estado incorreto.
      if (hasActiveInterruption || hasManualInterruption) {
        stores.push({ merchantId, open: false });
        continue;
      }

      const shifts = await getOpeningHours(merchantId);
      console.log(`=== [API /api/ifood/store-hours-status] shifts atuais da loja ${merchantId} ===`, {
        count: shifts.length
      });
      const open = isOpeningHoursOpen(shifts);
      stores.push({ merchantId, open });
    } catch (err) {
      console.error(`=== [API /api/ifood/store-hours-status] ERRO ao buscar horários da loja ${merchantId} ===`);
      console.error(err);
      stores.push({ merchantId, open: null, error: err.message });
    }
  }

  // só consideramos "tudo aberto" se TODAS as lojas tiverem hoje configurado
  const allOpen = stores.length > 0 && stores.every((s) => s.open === true);

  console.log('=== [API /api/ifood/store-hours-status] SUCESSO — respondendo ===', { today, allOpen, storeCount: stores.length });
  return res.status(200).json({ today, allOpen, stores });
}