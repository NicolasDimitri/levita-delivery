// api/ifood/toggle-store-hours.js
// Abre ou fecha as 3 lojas alterando o horário de funcionamento de HOJE.
// Não usa a API de Interrupções (aquilo seria uma pausa temporária) — aqui
// a gente literalmente adiciona ou remove o turno de hoje na configuração
// de horários, mantendo os outros dias da semana intactos.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import {
  getTodayDayOfWeek,
  getInterruptions,
  createInterruption,
  deleteInterruption,
  isInterruptionActive
} from '../../lib/ifood.js';

const MANUAL_INTERRUPTION_DESCRIPTION = 'Levita Delivery - fechamento manual';

export default async function handler(req, res) {
  console.log('=== [API /api/ifood/toggle-store-hours] REQUISIÇÃO RECEBIDA ===', {
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
    console.log('=== [API /api/ifood/toggle-store-hours] FALHA NA AUTENTICAÇÃO ===');
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
      const interruptions = await getInterruptions(merchantId);
      const manualInterruptions = interruptions.filter(
        (interruption) => interruption.description === MANUAL_INTERRUPTION_DESCRIPTION
      );

      if (action === 'close') {
        const alreadyClosed = manualInterruptions.some((interruption) => isInterruptionActive(interruption));
        if (!alreadyClosed) {
          await createInterruption(merchantId, MANUAL_INTERRUPTION_DESCRIPTION);
        }
      } else {
        for (const interruption of manualInterruptions) {
          if (interruption.id && isInterruptionActive(interruption)) {
            try {
              await deleteInterruption(merchantId, interruption.id);
            } catch (err) {
              if (err.code === 'RecentlyCreatedInterruption') {
                throw new Error('O iFood bloqueia a reabertura por alguns segundos após o fechamento. Aguarde e tente novamente.');
              }
              throw err;
            }
          }
        }
      }

      results.push({ merchantId, ok: true, open: action === 'open' });
    } catch (err) {
      console.error(`=== [API /api/ifood/toggle-store-hours] ERRO ao ${action === 'open' ? 'abrir' : 'fechar'} loja ${merchantId} ===`);
      console.error(err);
      results.push({ merchantId, ok: false, error: err.message });
    }
  }

  const allOk = results.every((r) => r.ok);
  console.log('=== [API /api/ifood/toggle-store-hours] SUCESSO — respondendo ===', { action, today, allOk, resultCount: results.length });
  return res.status(allOk ? 200 : 207).json({ action, today, results });
}