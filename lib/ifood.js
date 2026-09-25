// lib/ifood.js
// Fun??es server-only para falar com a Merchant API do iFood.
// NUNCA importe este arquivo em c?digo que roda no navegador (ele usa o client_secret).

const IFOOD_BASE_URL = 'https://merchant-api.ifood.com.br';

// Timeout de rede pra cada chamada individual ao iFood. Sem isso, se o
// ambiente sandbox do iFood ficar lento ou travar, o fetch nativo do Node
// fica esperando indefinidamente e a fun??o serverless do Vercel ? matada
// por timeout SEM nunca ter dado erro nenhum ? e sem nem terminar de
// escrever os logs no buffer, por isso "nenhum console.log aparece".
// 8s d? margem suficiente pra fun??o inteira responder dentro do limite
// de 10s do plano Hobby, mesmo fazendo s? UMA chamada de rede.
const IFOOD_FETCH_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url, options = {}, timeoutMs = IFOOD_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout (${timeoutMs}ms) ao chamar ${url} ? o iFood n?o respondeu a tempo`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Cache simples em mem?ria do token de acesso.
// Em serverless cada "cold start" perde esse cache, mas isso ? aceit?vel aqui:
// evita gerar token novo em todo evento dentro da MESMA inst?ncia "quente".
let cachedToken = null;
let cachedTokenExpiresAt = 0;

/**
 * Pega um access_token v?lido, gerando um novo se necess?rio.
 * Apps centralizados usam grantType=client_credentials e N?O recebem refresh_token,
 * ent?o o jeito certo ? s? pedir um token novo quando o atual perto de expirar.
 */
export async function getIfoodAccessToken() {
  const now = Date.now();

  if (cachedToken && now < cachedTokenExpiresAt - 30_000) {
    return cachedToken;
  }

  console.log('=== [IFOOD-AUTH] cache de token vazio/expirado, autenticando de novo ===');

  const params = new URLSearchParams({
    grantType: 'client_credentials',
    clientId: process.env.IFOOD_CLIENT_ID,
    clientSecret: process.env.IFOOD_CLIENT_SECRET
  });

  const res = await fetchWithTimeout(`${IFOOD_BASE_URL}/authentication/v1.0/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao autenticar no iFood (${res.status}): ${text}`);
  }

  const data = await res.json();
  // a resposta traz accessToken e expiresIn (segundos, padr?o 6h)
  cachedToken = data.accessToken;
  cachedTokenExpiresAt = now + data.expiresIn * 1000;

  console.log('=== [IFOOD-AUTH] novo token obtido com sucesso, expira em (s) ===', data.expiresIn);

  return cachedToken;
}

/**
 * Wrapper gen?rico para chamar qualquer endpoint da Merchant API j? autenticado.
 */
async function ifoodFetch(path, options = {}) {
  const token = await getIfoodAccessToken();

  console.log('=== [IFOOD-FETCH] REQUISI??O SAINDO PARA O IFOOD ===', {
    url: `${IFOOD_BASE_URL}${path}`,
    method: options.method || 'GET',
    hasBody: Boolean(options.body)
  });

  const res = await fetchWithTimeout(`${IFOOD_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  console.log('=== [IFOOD-FETCH] RESPOSTA RECEBIDA DO IFOOD ===', {
    url: `${IFOOD_BASE_URL}${path}`,
    status: res.status,
    ok: res.ok
  });

  return res;
}

/**
 * Busca os detalhes completos de um pedido.
 * Retorna null se vier 404 (pedido ainda n?o dispon?vel ou expirado).
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
 * Confirma o recebimento do pedido (obrigat?rio dentro de poucos minutos
 * ap?s o evento PLACED, sen?o o iFood cancela automaticamente).
 */
export async function confirmOrder(orderId) {
  return ifoodFetch(`/order/v1.0/orders/${orderId}/confirm`, { method: 'POST' });
}

/**
 * Avisa o iFood que o pedido saiu pra entrega com entregador pr?prio.
 */
export async function dispatchOrder(orderId) {
  return ifoodFetch(`/order/v1.0/orders/${orderId}/dispatch`, {
    method: 'POST',
    body: JSON.stringify({ deliveredBy: 'MERCHANT' })
  });
}

/**
 * Valida o c?digo de confirma??o de entrega informado pelo cliente.
 * Retorna { valid: true/false }.
 *
 * IMPORTANTE: a documenta??o p?blica do iFood diz que esse endpoint
 * responde 200 com body { "valid": true } em caso de sucesso. NA PR?TICA
 * (confirmado pelos logs em produ??o), o ambiente sandbox responde 200
 * com body COMPLETAMENTE VAZIO (content-length: 0) quando o c?digo est?
 * correto, e 400 com um body JSON de erro quando est? incorreto/inv?lido.
 * Por isso tratamos "200 com corpo vazio" como sucesso, em vez de tentar
 * fazer JSON.parse('') (que sempre lan?a "Unexpected end of JSON input").
 */
export async function verifyDeliveryCode(orderId, code) {
  const res = await ifoodFetch(`/order/v1.0/orders/${orderId}/verifyDeliveryCode`, {
    method: 'POST',
    body: JSON.stringify({ code })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ao validar c?digo (${res.status}): ${text}`);
  }

  const text = await res.text();
  if (!text) {
    // 200 + corpo vazio = c?digo v?lido (comportamento real observado do sandbox)
    return { valid: true };
  }

  try {
    return JSON.parse(text);
  } catch {
    // corpo n?o-vazio mas n?o ? JSON v?lido ? trata como sucesso j? que res.ok ? true,
    // mas loga pra investigar caso o formato mude de novo
    console.error('=== [IFOOD-VERIFY-DELIVERY-CODE] corpo 200 n?o era JSON, nem vazio ===', { length: text.length });
    return { valid: true };
  }
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

  // tem valor pendente -> procura o m?todo OFFLINE pra saber como vai ser pago na entrega
  const offlineMethod = (payments.methods || []).find((m) => m.type === 'OFFLINE');

  if (!offlineMethod) return 'online';

  const method = (offlineMethod.method || '').trim().toUpperCase();

  if (method === 'CASH') return 'dinheiro';
  if (method === 'DEBIT') return 'debito';
  if (method === 'CREDIT') return 'credito';

  // fallback pra m?todos n?o mapeados (ex: MEAL_VOUCHER offline) -> trata como cr?dito
  return 'credito';
}

// ============================================================
// HOR?RIO DE FUNCIONAMENTO (abrir/fechar lojas)
// Documenta??o: PUT /merchants/{id}/opening-hours SUBSTITUI a semana
// inteira ? dia n?o enviado = loja fechada naquele dia. Por isso,
// pra fechar S? hoje, mandamos de volta os mesmos shifts menos o de
// hoje; pra abrir, mandamos de volta os mesmos shifts MAIS o de hoje.
// ============================================================

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Nome do dia da semana de hoje, no fuso de Bras?lia, no formato que o iFood espera (ex: "MONDAY"). */
export function getTodayDayOfWeek() {
  const weekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long'
  }).format(new Date());

  return weekdayName.toUpperCase();
}

export async function getOpeningHours(merchantId) {
  const res = await ifoodFetch(`/merchant/v1.0/merchants/${merchantId}/opening-hours`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ao buscar hor?rios (${res.status}): ${text}`);
  }
  const data = await res.json();
  // a API retorna [{ shifts: [...] }] - normalizamos pra s? a lista de shifts
  return data?.[0]?.shifts || [];
}

export async function setOpeningHours(merchantId, shifts) {
  const res = await ifoodFetch(`/merchant/v1.0/merchants/${merchantId}/opening-hours`, {
    method: 'PUT',
    body: JSON.stringify({ shifts })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ao atualizar hor?rios (${res.status}): ${text}`);
  }
}
