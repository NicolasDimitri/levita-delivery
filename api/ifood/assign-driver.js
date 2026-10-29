import { supabaseAdmin } from '../../lib/supabaseAdmin.js';

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

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();
  if (profileError || profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem atribuir pedidos' });
  }

  const { orderId, driverId } = req.body || {};
  if (!orderId || !driverId) {
    return res.status(400).json({ error: 'orderId e driverId são obrigatórios' });
  }

  const { error: reassignError } = await supabaseAdmin.rpc('admin_reassign_delivery_order', {
    p_order_id: orderId,
    p_driver_id: driverId
  });
  if (reassignError) {
    if (reassignError.code === 'P0001') {
      return res.status(409).json({ error: reassignError.message });
    }
    console.error('Falha ao salvar a atribuição do entregador', reassignError);
    return res.status(500).json({ error: 'Não foi possível salvar a atribuição do entregador' });
  }

  return res.status(200).json({ ok: true });
}
