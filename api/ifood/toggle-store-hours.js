// api/ifood/toggle-store-hours.js
// Abre ou fecha as 3 lojas alterando o horário de funcionamento de HOJE.
// Não usa a API de Interrupções (aquilo seria uma pausa temporária) — aqui
// a gente literalmente adiciona ou remove o turno de hoje na configuração
// de horários, mantendo os outros dias da semana intactos.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { getOpeningHours, setOpeningHours, getTodayDayOfWeek } from '../../lib/ifood.js';

const HORARIO_INICIO = '09:00:00';
const HORARIO_DURACAO_MINUTOS = 360; // 09:00 às 15:00 = 6 horas

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem abrir/fechar as lojas' });
  }

  const { action } = req.body || {}; // 'open' ou 'close'
  if (action !== 'open' && action !== 'close') {
    return res.status(400).json({ error: 'action deve ser "open" ou "close"' });
  }

  const merchantIds = (process.env.IFOOD_MERCHANT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (merchantIds.length === 0) {
    return res.status(500).json({ error: 'IFOOD_MERCHANT_IDS não configurado' });
  }

  const today = getTodayDayOfWeek();
  const results = [];

  for (const merchantId of merchantIds) {
    try {
      const currentShifts = await getOpeningHours(merchantId);

      // remove qualquer turno de hoje que já exista (pra não duplicar ao abrir)
      const shiftsSemHoje = currentShifts
        .filter((s) => s.dayOfWeek !== today)
        .map((s) => ({ dayOfWeek: s.dayOfWeek, start: s.start, duration: s.duration }));

      const novosShifts =
        action === 'open'
          ? [...shiftsSemHoje, { dayOfWeek: today, start: HORARIO_INICIO, duration: HORARIO_DURACAO_MINUTOS }]
          : shiftsSemHoje;

      await setOpeningHours(merchantId, novosShifts);
      results.push({ merchantId, ok: true });
    } catch (err) {
      console.error(`Erro ao ${action === 'open' ? 'abrir' : 'fechar'} loja ${merchantId}`, err);
      results.push({ merchantId, ok: false, error: err.message });
    }
  }

  const allOk = results.every((r) => r.ok);
  return res.status(allOk ? 200 : 207).json({ action, today, results });
}
