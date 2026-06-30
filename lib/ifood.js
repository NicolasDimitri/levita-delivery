// lib/ifood.js
// Funções server-only para falar com a Merchant API do iFood.
// NUNCA importe este arquivo em código que roda no navegador (ele usa o client_secret).

const IFOOD_BASE_URL = 'https://merchant-api.ifood.com.br';

// Timeout de rede pra cada chamada individual ao iFood. Sem isso, se o
// ambiente sandbox do iFood ficar lento ou travar, o fetch nativo do Node
// fica esperando indefinidamente e a função serverless do Vercel é matada
// por timeout SEM nunca ter dado erro nenhum — e sem nem terminar de
// escrever os logs no buffer, por isso "nenhum console.log aparece".
// 8s dá margem suficiente pra função inteira responder dentro do limite
// de 10s do plano Hobby, mesmo fazendo só UMA chamada de rede.
const IFOOD_FETCH_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url, options = {}, timeoutMs = IFOOD_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout (${timeoutMs}ms) ao chamar ${url} — o iFood não respondeu a tempo`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

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
  // a resposta traz accessToken e expiresIn (segundos, padrão 6h)
  cachedToken = data.accessToken;
  cachedTokenExpiresAt = now + data.expiresIn * 1000;

  console.log('=== [IFOOD-AUTH] novo token obtido com sucesso, expira em (s) ===', data.expiresIn);

  return cachedToken;
}

/**
 * Wrapper genérico para chamar qualquer endpoint da Merchant API já autenticado.
 */
async function ifoodFetch(path, options = {}) {
  const token = await getIfoodAccessToken();

  console.log('=== [IFOOD-FETCH] REQUISIÇÃO SAINDO PARA O IFOOD ===');
  console.log(JSON.stringify({
    url: `${IFOOD_BASE_URL}${path}`,
    method: options.method || 'GET',
    body: options.body,
    headers: { ...options.headers, Authorization: '[omitido no log, presente na requisição real]' }
  }, null, 2));

  const res = await fetchWithTimeout(`${IFOOD_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  console.log('=== [IFOOD-FETCH] RESPOSTA RECEBIDA DO IFOOD ===');
  console.log(JSON.stringify({
    url: `${IFOOD_BASE_URL}${path}`,
    status: res.status,
    ok: res.ok,
    headers: Object.fromEntries(res.headers.entries())
  }, null, 2));

  // clona a resposta só pra poder logar o corpo sem "consumir" o stream
  // original — quem chamou ifoodFetch ainda precisa poder ler res.json()/res.text()
  try {
    const resClone = res.clone();
    const bodyText = await resClone.text();
    console.log('=== [IFOOD-FETCH] CORPO DA RESPOSTA DO IFOOD ===');
    console.log(bodyText);
  } catch (logErr) {
    console.error('=== [IFOOD-FETCH] não foi possível logar o corpo da resposta ===', logErr);
  }

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
 *
 * IMPORTANTE: a documentação pública do iFood diz que esse endpoint
 * responde 200 com body { "valid": true } em caso de sucesso. NA PRÁTICA
 * (confirmado pelos logs em produção), o ambiente sandbox responde 200
 * com body COMPLETAMENTE VAZIO (content-length: 0) quando o código está
 * correto, e 400 com um body JSON de erro quando está incorreto/inválido.
 * Por isso tratamos "200 com corpo vazio" como sucesso, em vez de tentar
 * fazer JSON.parse('') (que sempre lança "Unexpected end of JSON input").
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

  const text = await res.text();
  if (!text) {
    // 200 + corpo vazio = código válido (comportamento real observado do sandbox)
    return { valid: true };
  }

  try {
    return JSON.parse(text);
  } catch {
    // corpo não-vazio mas não é JSON válido — trata como sucesso já que res.ok é true,
    // mas loga pra investigar caso o formato mude de novo
    console.error('=== [IFOOD-VERIFY-DELIVERY-CODE] corpo 200 não era JSON, nem vazio ===', text);
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

// ============================================================
// HORÁRIO DE FUNCIONAMENTO (abrir/fechar lojas)
// Documentação: PUT /merchants/{id}/opening-hours SUBSTITUI a semana
// inteira — dia não enviado = loja fechada naquele dia. Por isso,
// pra fechar SÓ hoje, mandamos de volta os mesmos shifts menos o de
// hoje; pra abrir, mandamos de volta os mesmos shifts MAIS o de hoje.
// ============================================================

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Nome do dia da semana de hoje, no fuso de Brasília, no formato que o iFood espera (ex: "MONDAY"). */
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
    throw new Error(`Erro ao buscar horários (${res.status}): ${text}`);
  }
  const data = await res.json();
  // a API retorna [{ shifts: [...] }] - normalizamos pra só a lista de shifts
  return data?.[0]?.shifts || [];
}

export async function setOpeningHours(merchantId, shifts) {
  const res = await ifoodFetch(`/merchant/v1.0/merchants/${merchantId}/opening-hours`, {
    method: 'PUT',
    body: JSON.stringify({ shifts })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ao atualizar horários (${res.status}): ${text}`);
  }
}