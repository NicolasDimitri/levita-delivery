// lib/ifood.js
// Funções server-only para falar com a Merchant API do iFood.
// NUNCA importe este arquivo em código que roda no navegador (ele usa o client_secret).

const IFOOD_BASE_URL = 'https://merchant-api.ifood.com.br';

// Cache simples em memória do token de acesso.
// Em serverless cada "cold start" perde esse cache, mas isso é aceitável aqui:
// evita gerar token novo em todo evento dentro da MESMA instância "quente".
let cachedToken = null;
let cachedTokenExpiresAt = 0;

/**
 * Pega um access_token válido, gerando um novo se necessário.
 * Apps centralizados usam grantType=client_credentials e NÃO recebem refresh_token,
 * então o jeito certo é só pedir um token novo quando o atual perto de expirar.
 */
export async function getIfoodAccessToken() {
  const now = Date.now();

  if (cachedToken && now < cachedTokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const params = new URLSearchParams({
    grantType: 'client_credentials',
    clientId: process.env.IFOOD_CLIENT_ID,
    clientSecret: process.env.IFOOD_CLIENT_SECRET
  });

  const res = await fetch(`${IFOOD_BASE_URL}/authentication/v1.0/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao autenticar no iFood (${res.status}): ${text}`);
  }

  const data = await res.json();
  // a resposta traz accessToken e expiresIn (segundos, padrão 6h)
  cachedToken = data.accessToken;
  cachedTokenExpiresAt = now + data.expiresIn * 1000;

  return cachedToken;
}

/**
 * Wrapper genérico para chamar qualquer endpoint da Merchant API já autenticado.
 */
async function ifoodFetch(path, options = {}) {
  const token = await getIfoodAccessToken();

  const res = await fetch(`${IFOOD_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  return res;
}

/**
 * Busca os detalhes completos de um pedido.
 * Retorna null se vier 404 (pedido ainda não disponível ou expirado).
 */
export async function getOrderDetails(orderId) {
  const res = await ifoodFetch(`/order/v1.0/orders/${orderId}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Erro ao buscar pedido ${orderId}: ${res.status}`);
  }
  return res.json();
}

/**
 * Confirma o recebimento do pedido (obrigatório dentro de poucos minutos
 * após o evento PLACED, senão o iFood cancela automaticamente).
 */
export async function confirmOrder(orderId) {
  return ifoodFetch(`/order/v1.0/orders/${orderId}/confirm`, { method: 'POST' });
}

/**
 * Avisa o iFood que o pedido saiu pra entrega com entregador próprio.
 */
export async function dispatchOrder(orderId) {
  return ifoodFetch(`/order/v1.0/orders/${orderId}/dispatch`, {
    method: 'POST',
    body: JSON.stringify({ deliveredBy: 'MERCHANT' })
  });
}

/**
 * Valida o código de confirmação de entrega informado pelo cliente.
 * Retorna { valid: true/false }.
 */
export async function verifyDeliveryCode(orderId, code) {
  const res = await ifoodFetch(`/order/v1.0/orders/${orderId}/verifyDeliveryCode`, {
    method: 'POST',
    body: JSON.stringify({ code })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ao validar código (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Classifica o pagamento do pedido em uma das 4 categorias que o app usa
 * pra colorir a tela do entregador: online / dinheiro / debito / credito.
 *
 * Baseado no schema real do iFood:
 * payments: { prepaid, pending, methods: [{ type: ONLINE|OFFLINE, method: CREDIT|DEBIT|CASH|... }] }
 */
export function classifyPayment(payments) {
  if (!payments) return 'online';

  const pending = Number(payments.pending || 0);

  // tudo pago online (pending = 0) -> verde
  if (pending <= 0) return 'online';

  // tem valor pendente -> procura o método OFFLINE pra saber como vai ser pago na entrega
  const offlineMethod = (payments.methods || []).find((m) => m.type === 'OFFLINE');

  if (!offlineMethod) return 'online';

  const method = (offlineMethod.method || '').trim().toUpperCase();

  if (method === 'CASH') return 'dinheiro';
  if (method === 'DEBIT') return 'debito';
  if (method === 'CREDIT') return 'credito';

  // fallback pra métodos não mapeados (ex: MEAL_VOUCHER offline) -> trata como crédito
  return 'credito';
}
