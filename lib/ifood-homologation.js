const IFOOD_BASE_URL = 'https://merchant-api.ifood.com.br';
const FETCH_TIMEOUT_MS = 8_000;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

export async function getHomologationAccessToken() {
  const now = Date.now();
  const merchantIds = getHomologationMerchantIds();
  if (merchantIds.length !== 1) {
    throw new Error('Homologação disponível somente no ambiente de desenvolvimento, com exatamente 1 merchantId em IFOOD_MERCHANT_IDS.');
  }
  if (cachedToken && now < cachedTokenExpiresAt - 30_000) return cachedToken;

  const clientId = process.env.IFOOD_CLIENT_ID?.trim();
  const clientSecret = process.env.IFOOD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('Configure IFOOD_CLIENT_ID e IFOOD_CLIENT_SECRET com as credenciais do aplicativo iFood.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${IFOOD_BASE_URL}/authentication/v1.0/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grantType: 'client_credentials',
        clientId,
        clientSecret
      }).toString(),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Timeout ao autenticar o aplicativo de homologação no iFood.');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Falha na autenticação do aplicativo de homologação (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  cachedToken = data.accessToken;
  cachedTokenExpiresAt = now + Number(data.expiresIn) * 1000;
  return cachedToken;
}

export async function ifoodHomologationFetch(path, options = {}) {
  if (!path.startsWith('/merchant/') && !path.startsWith('/catalog/')) {
    throw new Error('Endpoint de homologação não permitido.');
  }

  const token = await getHomologationAccessToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${IFOOD_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Timeout ao chamar ${path} no iFood.`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Erro do iFood (${response.status}) em ${path}: ${text}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function getHomologationMerchantIds() {
  return (process.env.IFOOD_MERCHANT_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}
