// api/ifood/cleanup-webhook-events.js
// A tabela webhook_events só existe pra dedupe (evitar processar o mesmo
// evento 2x se o iFood reenviar). O iFood não reenvia depois de várias
// horas, então não há motivo pra guardar essas linhas pra sempre — sem
// limpeza, a tabela cresceria sem limite. Esse endpoint apaga tudo com
// mais de 48h, e é chamado automaticamente 1x por dia (veja vercel.json).
//
// Protegido por um header simples (CRON_SECRET) pra ninguém de fora
// conseguir disparar isso manualmente e tentar limpar o histórico de dedupe.

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { error, count } = await supabaseAdmin
    .from('webhook_events')
    .delete({ count: 'exact' })
    .lt('received_at', cutoff);

  if (error) {
    console.error('Erro ao limpar webhook_events', error);
    return res.status(500).json({ error: error.message });
  }

  console.log(`Limpeza de webhook_events: ${count ?? 0} linha(s) removida(s), anteriores a ${cutoff}`);
  return res.status(200).json({ removed: count ?? 0, cutoff });
}
