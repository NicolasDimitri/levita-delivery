// api/ifood/store-hours-status.js
// Verifica se as 3 lojas têm o turno de HOJE configurado no horário de
// funcionamento. Usado pra decidir se o botão mostra "Aberto" (verde) ou
// "Fechado" (vermelho) na tela de admin.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { getOpeningHours, getTodayDayOfWeek } from '../../lib/ifood.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const merchantIds = (process.env.IFOOD_MERCHANT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const today = getTodayDayOfWeek();
  const stores = [];

  for (const merchantId of merchantIds) {
    try {
      const shifts = await getOpeningHours(merchantId);
      const open = shifts.some((s) => s.dayOfWeek === today);
      stores.push({ merchantId, open });
    } catch (err) {
      stores.push({ merchantId, open: null, error: err.message });
    }
  }

  // só consideramos "tudo aberto" se TODAS as lojas tiverem hoje configurado
  const allOpen = stores.length > 0 && stores.every((s) => s.open === true);

  return res.status(200).json({ today, allOpen, stores });
}
