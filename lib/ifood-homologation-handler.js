import { supabaseAdmin } from './supabaseAdmin.js';
import {
  getHomologationMerchantIds,
  ifoodHomologationFetch
} from './ifood-homologation.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} é obrigatório.`);
  }
  return value.trim();
}

function getMerchantId(req) {
  const merchantId = requiredString(req.method === 'GET' ? req.query.merchantId : req.body?.merchantId, 'merchantId');
  const allowedIds = getHomologationMerchantIds();
  if (!allowedIds.includes(merchantId)) {
    throw new Error('Loja não autorizada para homologação. Use o único merchantId de teste configurado em IFOOD_MERCHANT_IDS.');
  }
  return encodeURIComponent(merchantId);
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return res.status(401).json({ error: 'Não autenticado' });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
  if (userError || !userData?.user) return res.status(401).json({ error: 'Não autenticado' });

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();
  if (profileError) return res.status(500).json({ error: 'Não foi possível validar o perfil do usuário.' });
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem usar a homologação do iFood.' });

  res.setHeader('Cache-Control', 'no-store');
  if (getHomologationMerchantIds().length !== 1) {
    return res.status(403).json({
      error: 'Homologação bloqueada: use exatamente 1 merchantId em IFOOD_MERCHANT_IDS no ambiente de desenvolvimento.'
    });
  }
  const input = req.method === 'GET' ? req.query : req.body || {};
  const action = input.action;

  try {
    let data;
    if (req.method === 'GET') {
      if (action === 'merchants') {
        const result = await ifoodHomologationFetch('/merchant/v1.0/merchants');
        data = {
          merchants: Array.isArray(result) ? result : result?.merchants || result?.data || [],
          configuredMerchantIds: getHomologationMerchantIds()
        };
      } else {
        const merchantId = getMerchantId(req);
        const routes = {
          details: `/merchant/v1.0/merchants/${merchantId}`,
          status: `/merchant/v1.0/merchants/${merchantId}/status`,
          hours: `/merchant/v1.0/merchants/${merchantId}/opening-hours`,
          interruptions: `/merchant/v1.0/merchants/${merchantId}/interruptions`,
          categories: `/catalog/v2.0/merchants/${merchantId}/categories?include_items=true`
        };
        const path = action === 'batch'
          ? `/catalog/v2.0/merchants/${merchantId}/batch/${encodeURIComponent(requiredString(req.query.batchId, 'batchId'))}`
          : routes[action];
        if (!path) return res.status(400).json({ error: 'Ação GET inválida.' });
        data = await ifoodHomologationFetch(path);
      }
    } else if (req.method === 'POST') {
      const merchantId = getMerchantId(req);
      const base = `/merchant/v1.0/merchants/${merchantId}`;
      const catalogBase = `/catalog/v2.0/merchants/${merchantId}`;
      const jsonBody = (body) => JSON.stringify(body);

      switch (action) {
        case 'create-interruption': {
          const description = requiredString(input.description, 'description');
          const start = requiredString(input.start, 'start');
          const end = requiredString(input.end, 'end');
          if (new Date(start).getTime() >= new Date(end).getTime()) {
            return res.status(400).json({ error: 'O fim da pausa deve ser posterior ao início.' });
          }
          data = await ifoodHomologationFetch(`${base}/interruptions`, {
            method: 'POST',
            body: jsonBody({ description, start, end })
          });
          break;
        }
        case 'delete-interruption': {
          const interruptionId = encodeURIComponent(requiredString(input.interruptionId, 'interruptionId'));
          data = await ifoodHomologationFetch(`${base}/interruptions/${interruptionId}`, { method: 'DELETE' });
          break;
        }
        case 'set-hours': {
          if (!Array.isArray(input.shifts)) return res.status(400).json({ error: 'shifts deve ser uma lista.' });
          data = await ifoodHomologationFetch(`${base}/opening-hours`, {
            method: 'PUT',
            body: jsonBody({ storeId: merchantId, shifts: input.shifts })
          });
          break;
        }
        case 'create-category': {
          const name = requiredString(input.name, 'name');
          data = await ifoodHomologationFetch(`${catalogBase}/categories`, {
            method: 'POST',
            body: jsonBody({ name, status: 'AVAILABLE', template: 'DEFAULT' })
          });
          break;
        }
        case 'upload-image': {
          const image = requiredString(input.image, 'image');
          if (!/^data:image\/(?:jpeg|jpg|png);base64,/.test(image)) {
            return res.status(400).json({ error: 'A imagem deve ser JPG ou PNG codificada em base64.' });
          }
          if (image.length > 4_000_000) return res.status(413).json({ error: 'A imagem ultrapassa o limite permitido. Use um arquivo menor.' });
          data = await ifoodHomologationFetch(`${catalogBase}/image/upload`, {
            method: 'POST',
            body: jsonBody({ image })
          });
          break;
        }
        case 'save-item': {
          if (!isObject(input.payload) || !isObject(input.payload.item) || !Array.isArray(input.payload.products)) {
            return res.status(400).json({ error: 'payload do item inválido.' });
          }
          data = await ifoodHomologationFetch(`${catalogBase}/items`, {
            method: 'PUT',
            body: jsonBody(input.payload)
          });
          break;
        }
        case 'patch-item-price':
        case 'patch-item-status':
        case 'patch-option-price':
        case 'patch-option-status': {
          if (!Array.isArray(input.updates) || input.updates.length === 0) {
            return res.status(400).json({ error: 'updates deve conter ao menos uma alteração.' });
          }
          const routeByAction = {
            'patch-item-price': 'items/price',
            'patch-item-status': 'items/status',
            'patch-option-price': 'options/price',
            'patch-option-status': 'options/status'
          };
          const updates = input.updates.map((update) => {
            if (!isObject(update)) throw new Error('Cada alteração deve ser um objeto.');
            return update;
          });
          data = await ifoodHomologationFetch(`${catalogBase}/${routeByAction[action]}`, {
            method: 'PATCH',
            body: jsonBody(updates.length === 1 ? updates[0] : updates)
          });
          break;
        }
        default:
          return res.status(400).json({ error: 'Ação POST inválida.' });
      }
    } else {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(200).json({ data });
  } catch (error) {
    const status = error.message.includes('obrigatório') || error.message.includes('não autorizada') ? 400 : 502;
    console.error('[iFood homologação]', { action, message: error.message });
    return res.status(status).json({ error: error.message || 'Falha ao processar a operação de homologação.' });
  }
}
