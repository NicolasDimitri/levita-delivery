import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, EmptyState } from '../lib/ui';

const API_PATH = '/api/ifood/store-hours-status';
const DAY_LABELS = {
  SUNDAY: 'Domingo',
  MONDAY: 'Segunda-feira',
  TUESDAY: 'Terça-feira',
  WEDNESDAY: 'Quarta-feira',
  THURSDAY: 'Quinta-feira',
  FRIDAY: 'Sexta-feira',
  SATURDAY: 'Sábado'
};

function getList(value, key) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[key])) return value[key];
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function getMerchantId(merchant) {
  return merchant?.id || merchant?.merchantId || '';
}

function getShifts(value) {
  if (Array.isArray(value)) return value[0]?.shifts || [];
  return value?.shifts || [];
}

function localDateTime(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 19);
}

function interruptionList(value) {
  return getList(value, 'interruptions');
}

function parsePrice(value) {
  const price = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(price) || price < 0) throw new Error('Informe um preço válido.');
  return price;
}

function formatShift(shift) {
  const [hours, minutes] = String(shift.start || '00:00').split(':').map(Number);
  const start = hours * 60 + minutes;
  const end = (start + Number(shift.duration || 0)) % (24 * 60);
  const format = (total) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  return `${format(start)}–${format(end)}`;
}

function getAvailability(value, merchant) {
  const raw = typeof value === 'string'
    ? value
    : value?.status || value?.availability || value?.state || merchant?.status;
  if (value?.available === true || raw === 'AVAILABLE' || raw === 'OPEN') return { label: 'Disponível', color: 'green' };
  if (value?.available === false || raw === 'UNAVAILABLE' || raw === 'CLOSED' || raw === 'DISABLED') {
    return { label: 'Indisponível', color: 'red' };
  }
  return { label: value ? 'Consultado' : 'Não consultado', color: value ? 'blue' : 'gray' };
}

async function fileToDataUrl(file) {
  if (!file) return null;
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    throw new Error('Escolha uma imagem JPG ou PNG.');
  }

  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

    let dataUrl = canvas.toDataURL(file.type, 0.88);
    if (dataUrl.length > 3_600_000) dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    if (dataUrl.length > 3_600_000) throw new Error('A imagem ficou muito grande mesmo após a compressão. Escolha um arquivo menor.');
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function Field({ label, value, onChange, type = 'text', ...props }) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      <input
        className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm focus:border-brand-500 focus:outline-none"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </label>
  );
}

function ActionButton({ children, onClick, disabled = false, secondary = false, type = 'button' }) {
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      variant={secondary ? 'secondary' : 'primary'}
      className="rounded-xl"
    >
      {children}
    </Button>
  );
}

function JsonPanel({ title, value }) {
  return (
    <details className="rounded-xl border border-gray-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700">{title}</summary>
      <pre className="max-h-80 overflow-auto border-t border-gray-100 p-4 text-xs text-gray-600">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </details>
  );
}

function Panel({ title, children }) {
  return (
    <Card className="space-y-4 p-5">
      <h2 className="font-bold text-gray-800">{title}</h2>
      {children}
    </Card>
  );
}

export default function IfoodHomologationPage() {
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('merchant');
  const [merchants, setMerchants] = useState([]);
  const [authorizedMerchantIds, setAuthorizedMerchantIds] = useState([]);
  const [merchantId, setMerchantId] = useState('');
  const [details, setDetails] = useState(null);
  const [status, setStatus] = useState(null);
  const [hours, setHours] = useState([]);
  const [interruptions, setInterruptions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [categoryName, setCategoryName] = useState('Teste Homologação');
  const [storeError, setStoreError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingMerchants, setLoadingMerchants] = useState(false);
  const [loadingStore, setLoadingStore] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [pauseDescription, setPauseDescription] = useState('Interrupção temporária');
  const [itemName, setItemName] = useState('Produto Teste');
  const [itemPrice, setItemPrice] = useState('19,90');
  const [groupName, setGroupName] = useState('Complementos');
  const [optionNames, setOptionNames] = useState(['Adicional de queijo', 'Bebida 350 ml']);
  const [optionPrices, setOptionPrices] = useState(['2,00', '3,00']);
  const [itemImage, setItemImage] = useState(null);
  const [optionImages, setOptionImages] = useState([null, null]);
  const [currentItem, setCurrentItem] = useState(null);
  const [batchItems, setBatchItems] = useState([]);
  const [editItemName, setEditItemName] = useState('');
  const [editOptionNames, setEditOptionNames] = useState(['', '']);
  const [editItemImage, setEditItemImage] = useState(null);
  const [editOptionImages, setEditOptionImages] = useState([null, null]);
  const [updatedItemPrice, setUpdatedItemPrice] = useState('');
  const [updatedOptionPrices, setUpdatedOptionPrices] = useState(['', '']);

  async function callApi(action, args = {}, method = 'GET') {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Sua sessão expirou. Entre novamente no painel.');

    const url = new URL(API_PATH, window.location.origin);
    const options = {
      method,
      headers: { Authorization: `Bearer ${token}` }
    };
    if (method === 'GET') {
      url.searchParams.set('homologation', '1');
      url.searchParams.set('action', action);
      Object.entries(args).forEach(([key, value]) => {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      });
    } else {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify({ homologation: true, action, ...args });
    }

    const response = await fetch(url, options);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
    return body.data;
  }

  async function loadMerchants() {
    setLoadingMerchants(true);
    setStoreError('');
    try {
      const result = await callApi('merchants');
      const available = getList(result, 'merchants');
      setMerchants(available);
      const allowedIds = result?.configuredMerchantIds || [];
      setAuthorizedMerchantIds(allowedIds);
      const firstId = getMerchantId(available.find((merchant) => allowedIds.includes(getMerchantId(merchant))) || available[0]);
      if (firstId) setMerchantId((current) => current || firstId);
      if (!available.length) setStoreError('O aplicativo de teste não retornou lojas vinculadas.');
      else if (allowedIds.length !== 1) setStoreError('A homologação exige exatamente 1 merchantId de teste em IFOOD_MERCHANT_IDS.');
    } catch (error) {
      setStoreError(error.message);
    } finally {
      setLoadingMerchants(false);
    }
  }

  async function loadStore() {
    if (!merchantId) return;
    if (!authorizedMerchantIds.includes(merchantId)) {
      setStoreError('Esta loja não está autorizada para escrita. Use o único merchantId de teste configurado em IFOOD_MERCHANT_IDS.');
      setDetails(null);
      setStatus(null);
      setHours([]);
      setInterruptions([]);
      return;
    }
    setLoadingStore(true);
    setStoreError('');
    const results = await Promise.allSettled([
      callApi('details', { merchantId }),
      callApi('status', { merchantId }),
      callApi('hours', { merchantId }),
      callApi('interruptions', { merchantId })
    ]);
    setDetails(results[0].status === 'fulfilled' ? results[0].value : null);
    setStatus(results[1].status === 'fulfilled' ? results[1].value : null);
    setHours(results[2].status === 'fulfilled' ? getShifts(results[2].value) : []);
    setInterruptions(results[3].status === 'fulfilled' ? interruptionList(results[3].value) : []);
    const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason.message);
    setStoreError(errors.join(' '));
    setLoadingStore(false);
  }

  async function loadCategories() {
    if (!merchantId) return;
    if (!authorizedMerchantIds.includes(merchantId)) {
      setCategories([]);
      setCategoryId('');
      setCurrentItem(null);
      return;
    }
    setLoadingCatalog(true);
    setCatalogError('');
    try {
      const result = await callApi('categories', { merchantId });
      const available = getList(result, 'categories');
      setCategories(available);
      const categoryIds = available.map((category) => category.id || category.categoryId);
      setCategoryId((current) => categoryIds.includes(current) ? current : categoryIds[0] || '');
    } catch (error) {
      setCatalogError(error.message);
    } finally {
      setLoadingCatalog(false);
    }
  }

  useEffect(() => { loadMerchants(); }, []);
  useEffect(() => {
    if (!merchantId) return;
    setCurrentItem(null);
    loadStore();
    loadCategories();
  }, [merchantId, authorizedMerchantIds]);

  const selectedMerchant = useMemo(
    () => merchants.find((merchant) => getMerchantId(merchant) === merchantId),
    [merchants, merchantId]
  );
  const isAuthorizedMerchant = authorizedMerchantIds.includes(merchantId);

  async function perform(action, args, successMessage, after) {
    setBusy(true);
    setNotice('');
    setStoreError('');
    setCatalogError('');
    try {
      let result = await callApi(action, { merchantId, ...args }, 'POST');
      if (result?.batchId) result = await waitForBatch(result.batchId);
      if (after) await after(result);
      setNotice(successMessage);
      return result;
    } catch (error) {
      if (activeTab === 'merchant') setStoreError(error.message);
      else setCatalogError(error.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function waitForBatch(batchId) {
    const deadline = Date.now() + 45_000;
    let latest;
    while (Date.now() < deadline) {
      latest = await callApi('batch', { merchantId, batchId });
      const state = latest?.batchStatus || latest?.status;
      if (state === 'COMPLETED') {
        if (Number(latest.failureCount || 0) > 0) {
          throw new Error(`Lote concluído com ${latest.failureCount} falha(s). Confira o detalhe do lote no Developer Portal.`);
        }
        return latest;
      }
      if (state === 'FAILED') throw new Error(`O lote ${batchId} falhou no iFood.`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(`O iFood ainda não concluiu o lote ${batchId}. Consulte o status antes de reenviar a operação.`);
  }

  async function createInterruption() {
    const start = localDateTime(new Date());
    const end = localDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000));
    await perform('create-interruption', { description: pauseDescription, start, end }, 'Pausa cadastrada.', loadStore);
  }

  async function removeInterruption(interruptionId) {
    await perform('delete-interruption', { interruptionId }, 'Pausa removida.', loadStore);
  }

  async function applyChecklistHours() {
    if (!hours) return;
    const unchanged = hours.filter((shift) => !['SATURDAY', 'SUNDAY'].includes(shift.dayOfWeek));
    const shifts = [
      ...unchanged,
      { dayOfWeek: 'SATURDAY', start: '10:00:00', duration: 540 },
      { dayOfWeek: 'SUNDAY', start: '09:00:00', duration: 180 },
      { dayOfWeek: 'SUNDAY', start: '13:00:00', duration: 180 },
      { dayOfWeek: 'SUNDAY', start: '17:00:00', duration: 360 }
    ];
    await perform('set-hours', { shifts }, 'Horários de funcionamento atualizados no iFood.', loadStore);
  }

  async function uploadImage(file) {
    const image = await fileToDataUrl(file);
    if (!image) return null;
    const result = await callApi('upload-image', { merchantId, image }, 'POST');
    const imagePath = result?.imagePath || result?.path;
    if (!imagePath) throw new Error('O iFood recebeu a imagem, mas não retornou imagePath.');
    return imagePath;
  }

  async function createCategory() {
    const result = await perform('create-category', { name: categoryName }, 'Categoria criada.', loadCategories);
    const newId = result?.id || result?.categoryId;
    if (newId) setCategoryId(newId);
  }

  async function createCatalogItem() {
    setBusy(true);
    setCatalogError('');
    setNotice('');
    try {
      if (!categoryId) throw new Error('Crie ou selecione uma categoria antes de cadastrar o item.');
      if (!itemImage || optionImages.some((file) => !file)) {
        throw new Error('Selecione a foto do item e as fotos dos dois complementos.');
      }
      const ids = Array.from({ length: 4 }, () => crypto.randomUUID());
      const [itemImagePath, optionImage1, optionImage2] = await Promise.all([
        uploadImage(itemImage),
        uploadImage(optionImages[0]),
        uploadImage(optionImages[1])
      ]);
      const payload = {
        item: {
          id: ids[0],
          type: 'DEFAULT',
          categoryId,
          status: 'AVAILABLE',
          price: { value: parsePrice(itemPrice) },
          externalCode: ids[0]
        },
        products: [
          { id: ids[1], name: itemName, description: itemName, externalCode: ids[1], ...(itemImagePath ? { imagePath: itemImagePath } : {}) },
          { id: ids[2], name: optionNames[0], description: optionNames[0], externalCode: ids[2], ...(optionImage1 ? { imagePath: optionImage1 } : {}) },
          { id: ids[3], name: optionNames[1], description: optionNames[1], externalCode: ids[3], ...(optionImage2 ? { imagePath: optionImage2 } : {}) }
        ],
        optionGroups: [{
          id: crypto.randomUUID(),
          name: groupName,
          status: 'AVAILABLE',
          optionGroupType: 'OFFER_UNIT',
          min: 0,
          max: 2,
          optionIds: [crypto.randomUUID(), crypto.randomUUID()]
        }],
        options: []
      };
      payload.options = payload.optionGroups[0].optionIds.map((id, index) => ({
        id,
        productId: ids[index + 2],
        status: 'AVAILABLE',
        index,
        price: { value: parsePrice(optionPrices[index]) }
      }));

      await callApi('save-item', { merchantId, payload }, 'POST');
      setCurrentItem(payload);
      setBatchItems([payload]);
      setEditItemName(itemName);
      setEditOptionNames([...optionNames]);
      setUpdatedItemPrice(itemPrice);
      setUpdatedOptionPrices([...optionPrices]);
      setNotice('Item e grupo com dois complementos criados.');
      await loadCategories();
    } catch (error) {
      setCatalogError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveItemNamesAndImages() {
    if (!currentItem) return;
    setBusy(true);
    setCatalogError('');
    setNotice('');
    try {
      if (!editItemImage || editOptionImages.some((file) => !file)) {
        throw new Error('Selecione as novas fotos do item e dos dois complementos.');
      }
      const payload = JSON.parse(JSON.stringify(currentItem));
      const productChanges = await Promise.all([
        uploadImage(editItemImage),
        uploadImage(editOptionImages[0]),
        uploadImage(editOptionImages[1])
      ]);
      payload.products[0].name = editItemName;
      payload.products[0].description = editItemName;
      if (productChanges[0]) payload.products[0].imagePath = productChanges[0];
      for (let index = 0; index < 2; index += 1) {
        payload.products[index + 1].name = editOptionNames[index];
        payload.products[index + 1].description = editOptionNames[index];
        if (productChanges[index + 1]) payload.products[index + 1].imagePath = productChanges[index + 1];
      }
      await callApi('save-item', { merchantId, payload }, 'POST');
      setCurrentItem(payload);
      setNotice('Nomes e imagens atualizados com PUT /items.');
      await loadCategories();
    } catch (error) {
      setCatalogError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function patchPrice(action, updates, message) {
    await perform(action, { updates }, message, async () => {
      const next = JSON.parse(JSON.stringify(currentItem));
      if (action === 'patch-item-price') {
        next.item.price = updates[0].price;
        setBatchItems((current) => current.map((item) => ({
          ...item,
          item: { ...item.item, price: updates.find((update) => update.itemId === item.item.id)?.price || item.item.price }
        })));
      }
      else updates.forEach((update) => {
        const option = next.options.find((entry) => entry.id === update.optionId);
        if (option) option.price = update.price;
      });
      setCurrentItem(next);
      await loadCategories();
    });
  }

  async function updatePrice(action, buildUpdates, message) {
    try {
      await patchPrice(action, buildUpdates(), message);
    } catch (error) {
      setCatalogError(error.message);
    }
  }

  async function createBatchItem() {
    if (!currentItem) return;
    setBusy(true);
    setCatalogError('');
    setNotice('');
    try {
      const itemId = crypto.randomUUID();
      const productId = crypto.randomUUID();
      const payload = {
        item: {
          id: itemId,
          type: 'DEFAULT',
          categoryId: currentItem.item.categoryId,
          status: 'AVAILABLE',
          price: { value: parsePrice(itemPrice) },
          externalCode: itemId
        },
        products: [{
          id: productId,
          name: 'Produto Teste 2',
          description: 'Produto Teste 2',
          externalCode: productId,
          ...(currentItem.products[0].imagePath ? { imagePath: currentItem.products[0].imagePath } : {})
        }],
        optionGroups: [],
        options: []
      };
      await callApi('save-item', { merchantId, payload }, 'POST');
      setBatchItems((current) => [...current, payload]);
      setNotice('Produto Teste 2 criado para demonstrar atualização em lote.');
      await loadCategories();
    } catch (error) {
      setCatalogError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function patchStatus(action, updates, message) {
    await perform(action, { updates }, message, async () => {
      const next = JSON.parse(JSON.stringify(currentItem));
      if (action === 'patch-item-status') {
        next.item.status = updates[0].status;
        setBatchItems((current) => current.map((item) => ({
          ...item,
          item: { ...item.item, status: updates.find((update) => update.itemId === item.item.id)?.status || item.item.status }
        })));
      }
      else updates.forEach((update) => {
        const option = next.options.find((entry) => entry.id === update.optionId);
        if (option) option.status = update.status;
      });
      setCurrentItem(next);
      await loadCategories();
    });
  }

  const activeInterruptions = interruptions.filter((interruption) => {
    const start = new Date(interruption.start).getTime();
    const end = new Date(interruption.end).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && start <= Date.now() && end > Date.now();
  });
  const availability = getAvailability(status, details || selectedMerchant);
  const hoursByDay = hours.reduce((grouped, shift) => {
    const shiftsForDay = grouped[shift.dayOfWeek] || [];
    return { ...grouped, [shift.dayOfWeek]: [...shiftsForDay, shift] };
  }, {});
  const catalogItemCount = categories.reduce((count, category) => count + getList(category, 'items').length, 0);

  const formatDateTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || '—';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo'
    }).format(date);
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-wrap items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
                  <path d="M3.5 9.5h17l-1.6-5h-13l-2.4 5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <path d="M5 9.5v10h14v-10M9 19.5v-6h6v6M3.5 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-bold text-gray-900">Levita Delivery</p>
                  <Badge color="amber">AMBIENTE DE TESTE</Badge>
                </div>
                <p className="truncate text-xs text-gray-500">Gestão de lojas e cardápio · iFood</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-gray-500 sm:inline">{profile?.name}</span>
              <Link to="/admin" className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Pedidos
              </Link>
              <Button variant="ghost" onClick={signOut}>Sair</Button>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4 border-t border-gray-100 py-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Operações</p>
              <h1 className="text-lg font-bold text-gray-900">Gestão da loja</h1>
            </div>
            <label className="w-full max-w-sm text-xs font-semibold uppercase tracking-wide text-gray-400">
              Loja vinculada
              <select
                className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-medium normal-case text-gray-800 focus:border-brand-500 focus:outline-none"
                value={merchantId}
                onChange={(event) => setMerchantId(event.target.value)}
                disabled={loadingMerchants}
              >
                <option value="">{loadingMerchants ? 'Carregando lojas…' : 'Selecione uma loja'}</option>
                {merchants.map((merchant) => {
                  const id = getMerchantId(merchant);
                  return <option key={id} value={id}>{merchant.name || id} · {id}</option>;
                })}
              </select>
            </label>
          </div>

          <div className="flex gap-5">
            {[
              ['merchant', 'Minha loja'],
              ['catalog', 'Cardápio']
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`border-b-2 px-1 pb-3 text-sm font-semibold transition ${
                  activeTab === id
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <span className="mt-0.5 text-amber-600" aria-hidden="true">●</span>
          <div>
            <p className="text-sm font-bold text-amber-900">Ambiente de desenvolvimento conectado</p>
            <p className="mt-1 text-sm text-amber-800">
              As consultas e alterações desta tela são feitas na loja de teste vinculada a este ambiente. Não use dados de produção aqui.
            </p>
          </div>
        </div>

        {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
        {!isAuthorizedMerchant && merchantId && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Esta tela requer exatamente um merchantId de teste em IFOOD_MERCHANT_IDS.
          </p>
        )}

        {activeTab === 'merchant' ? (
          <div className="space-y-5">
            {storeError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{storeError}</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Disponibilidade</p>
                <div className="mt-2"><Badge color={availability.color}>{loadingStore ? 'Consultando…' : availability.label}</Badge></div>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Interrupções ativas</p>
                <p className="mt-2 text-xl font-bold text-gray-900">{loadingStore ? '—' : activeInterruptions.length}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Categorias no cardápio</p>
                <p className="mt-2 text-xl font-bold text-gray-900">{loadingCatalog ? '—' : categories.length}</p>
              </Card>
            </div>

            <Panel title="Informações da loja">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{details?.name || selectedMerchant?.name || 'Loja vinculada'}</h2>
                  <p className="mt-1 text-sm text-gray-500">ID da loja: <span className="font-mono text-xs">{merchantId || '—'}</span></p>
                  {details?.address && (
                    <p className="mt-2 text-sm text-gray-600">
                      {[details.address.street, details.address.number, details.address.city, details.address.state].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <ActionButton secondary onClick={() => { loadStore(); loadCategories(); }} disabled={!merchantId || busy || loadingStore || loadingCatalog}>
                    {loadingStore || loadingCatalog ? 'Atualizando…' : 'Atualizar informações'}
                  </ActionButton>
                </div>
              </div>
              {loadingStore ? (
                <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">Consultando informações diretamente no iFood…</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <JsonPanel title="Dados comerciais retornados pelo iFood" value={details} />
                  <JsonPanel title="Disponibilidade retornada pelo iFood" value={status} />
                </div>
              )}
            </Panel>

            <Panel title="Funcionamento e interrupções">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-gray-800">Horário de funcionamento</h3>
                    <p className="mt-1 text-sm text-gray-500">A configuração atual da loja, organizada por dia da semana.</p>
                  </div>
                  {loadingStore ? <p className="text-sm text-gray-500">Carregando horários…</p> : hours.length === 0 ? (
                    <EmptyState message="Nenhum horário retornado para esta loja." />
                  ) : (
                    <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                      {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) => {
                        const shifts = hoursByDay[day] || [];
                        return (
                          <div key={day} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                            <span className="font-medium text-gray-700">{DAY_LABELS[day]}</span>
                            <span className="text-right text-gray-500">{shifts.length ? shifts.map(formatShift).join(', ') : 'Fechado'}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                    <p className="font-semibold text-gray-700">Atualização de fim de semana</p>
                    <p className="mt-1">Sáb. 10:00–19:00 · Dom. 09:00–12:00, 13:00–16:00 e 17:00–23:00</p>
                    <p className="mt-1 text-xs text-gray-500">Os horários dos outros dias são preservados.</p>
                  </div>
                  <ActionButton onClick={applyChecklistHours} disabled={!isAuthorizedMerchant || busy || loadingStore}>
                    Aplicar horários de funcionamento
                  </ActionButton>
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-gray-800">Interrupções</h3>
                    <p className="mt-1 text-sm text-gray-500">Gerencie pausas temporárias e confira o retorno do iFood.</p>
                  </div>
                  <Field label="Descrição da interrupção" value={pauseDescription} onChange={setPauseDescription} />
                  <ActionButton onClick={createInterruption} disabled={!isAuthorizedMerchant || busy}>
                    {busy ? 'Enviando…' : 'Adicionar interrupção por 24 horas'}
                  </ActionButton>
                  {loadingStore ? <p className="text-sm text-gray-500">Carregando interrupções…</p> : interruptions.length === 0 ? (
                    <EmptyState message="Nenhuma interrupção cadastrada." />
                  ) : (
                    <div className="space-y-2">
                      {interruptions.map((interruption) => {
                        const active = activeInterruptions.some((entry) => entry.id === interruption.id);
                        return (
                          <div key={interruption.id || `${interruption.start}-${interruption.end}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 p-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-gray-800">{interruption.description || 'Interrupção'}</p>
                                <Badge color={active ? 'amber' : 'gray'}>{active ? 'Ativa' : 'Programada/encerrada'}</Badge>
                              </div>
                              <p className="mt-1 text-xs text-gray-500">{formatDateTime(interruption.start)} – {formatDateTime(interruption.end)}</p>
                            </div>
                            {interruption.id && (
                              <ActionButton secondary onClick={() => removeInterruption(interruption.id)} disabled={!isAuthorizedMerchant || busy}>
                                Remover
                              </ActionButton>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          </div>
        ) : (
          <div className="space-y-5">
            {catalogError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{catalogError}</p>}
            <Panel title="Categorias do cardápio">
              <p className="text-sm text-gray-500">Categorias atualmente vinculadas à loja.</p>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field label="Nova categoria" value={categoryName} onChange={setCategoryName} />
                <div className="self-end"><ActionButton onClick={createCategory} disabled={!isAuthorizedMerchant || busy}>Adicionar categoria</ActionButton></div>
              </div>
              {loadingCatalog ? <p className="text-sm text-gray-500">Carregando cardápio…</p> : categories.length === 0 ? (
                <EmptyState message="Nenhuma categoria retornada para esta loja." />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {categories.map((category) => {
                    const id = category.id || category.categoryId;
                    const items = getList(category, 'items');
                    return (
                      <button
                        key={id}
                        onClick={() => setCategoryId(id)}
                        className={`rounded-xl border-2 p-4 text-left transition ${categoryId === id ? 'border-brand-300 bg-brand-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-800">{category.name || 'Categoria sem nome'}</p>
                            <p className="mt-1 text-xs text-gray-500">{items.length} {items.length === 1 ? 'item' : 'itens'}</p>
                          </div>
                          <Badge color={category.status === 'AVAILABLE' ? 'green' : 'gray'}>{category.status || '—'}</Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <JsonPanel title="Dados completos das categorias" value={categories} />
            </Panel>

            <Panel title="Cadastrar produto e complementos">
              <p className="text-sm text-gray-500">O produto, o grupo de complementos e suas opções são enviados ao cardápio da loja selecionada.</p>
              <label className="block text-sm font-medium text-gray-700">
                Categoria
                <select className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Selecione uma categoria</option>
                  {categories.map((category) => {
                    const id = category.id || category.categoryId;
                    return <option key={id} value={id}>{category.name || id}</option>;
                  })}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome do produto" value={itemName} onChange={setItemName} />
                <Field label="Preço (R$)" value={itemPrice} onChange={setItemPrice} inputMode="decimal" />
              </div>
              <label className="block text-sm font-medium text-gray-700">Imagem do produto
                <input className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700" type="file" accept="image/jpeg,image/png" onChange={(event) => setItemImage(event.target.files?.[0] || null)} />
              </label>

              <div className="border-t border-gray-100 pt-4">
                <div className="mb-3">
                  <h3 className="font-semibold text-gray-800">Grupo de complementos</h3>
                  <p className="mt-1 text-sm text-gray-500">Adicione duas opções ao grupo.</p>
                </div>
                <Field label="Nome do grupo" value={groupName} onChange={setGroupName} />
                <div className="mt-3 space-y-3">
                  {[0, 1].map((index) => (
                    <div key={index} className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-3">
                      <Field label={`Complemento ${index + 1}`} value={optionNames[index]} onChange={(value) => setOptionNames((current) => current.map((name, i) => i === index ? value : name))} />
                      <Field label="Preço (R$)" value={optionPrices[index]} onChange={(value) => setOptionPrices((current) => current.map((price, i) => i === index ? value : price))} inputMode="decimal" />
                      <label className="block text-sm font-medium text-gray-700">Imagem
                        <input className="mt-1 block w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-brand-50 file:px-2 file:py-1.5 file:font-semibold file:text-brand-700" type="file" accept="image/jpeg,image/png" onChange={(event) => setOptionImages((current) => current.map((file, i) => i === index ? event.target.files?.[0] || null : file))} />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <ActionButton onClick={createCatalogItem} disabled={!isAuthorizedMerchant || busy || loadingCatalog}>
                {busy ? 'Salvando no iFood…' : 'Salvar produto no cardápio'}
              </ActionButton>
            </Panel>

            {currentItem && (
              <>
                <Panel title={`Editar produto · ${editItemName || 'Produto selecionado'}`}>
                  <p className="text-sm text-gray-500">Atualize as informações comerciais e as imagens do produto e dos complementos.</p>
                  <Field label="Nome do produto" value={editItemName} onChange={setEditItemName} />
                  <label className="block text-sm font-medium text-gray-700">Nova imagem do produto
                    <input className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700" type="file" accept="image/jpeg,image/png" onChange={(event) => setEditItemImage(event.target.files?.[0] || null)} />
                  </label>
                  {[0, 1].map((index) => (
                    <div key={index} className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
                      <Field label={`Nome do complemento ${index + 1}`} value={editOptionNames[index]} onChange={(value) => setEditOptionNames((current) => current.map((name, i) => i === index ? value : name))} />
                      <label className="block text-sm font-medium text-gray-700">Nova imagem
                        <input className="mt-1 block w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-brand-50 file:px-2 file:py-1.5 file:font-semibold file:text-brand-700" type="file" accept="image/jpeg,image/png" onChange={(event) => setEditOptionImages((current) => current.map((file, i) => i === index ? event.target.files?.[0] || null : file))} />
                      </label>
                    </div>
                  ))}
                  <ActionButton onClick={saveItemNamesAndImages} disabled={busy}>Salvar alterações</ActionButton>
                  {batchItems.length < 2 && (
                    <ActionButton secondary onClick={createBatchItem} disabled={busy}>
                      Adicionar outro produto
                    </ActionButton>
                  )}
                  <JsonPanel title="Identificadores técnicos do produto" value={currentItem} />
                </Panel>

                <Panel title="Preços e disponibilidade">
                  <p className="text-sm text-gray-500">As alterações de preço e status são enviadas pelos endpoints PATCH do iFood.</p>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <Field label={`Preço para ${batchItems.length} produto(s) (R$)`} value={updatedItemPrice} onChange={setUpdatedItemPrice} inputMode="decimal" />
                    <div className="self-end">
                      <ActionButton disabled={busy} onClick={() => updatePrice('patch-item-price', () => batchItems.map((item) => ({ itemId: item.item.id, price: { value: parsePrice(updatedItemPrice) } })), 'Preços dos produtos atualizados.')}>Atualizar preços</ActionButton>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {currentItem.options.map((option, index) => (
                      <Field key={option.id} label={`Preço de ${editOptionNames[index] || `complemento ${index + 1}`} (R$)`} value={updatedOptionPrices[index]} onChange={(value) => setUpdatedOptionPrices((current) => current.map((price, i) => i === index ? value : price))} inputMode="decimal" />
                    ))}
                  </div>
                  {currentItem.options.length > 0 && (
                    <ActionButton secondary disabled={busy} onClick={() => updatePrice('patch-option-price', () => currentItem.options.map((option, index) => ({ optionId: option.id, price: { value: parsePrice(updatedOptionPrices[index]) } })), 'Preços dos complementos atualizados.')}>Atualizar preços dos complementos</ActionButton>
                  )}
                  <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                    <ActionButton secondary disabled={busy} onClick={() => patchStatus('patch-item-status', batchItems.map((item) => ({ itemId: item.item.id, status: 'UNAVAILABLE' })), 'Produtos pausados.')}>Pausar produtos</ActionButton>
                    <ActionButton secondary disabled={busy} onClick={() => patchStatus('patch-item-status', batchItems.map((item) => ({ itemId: item.item.id, status: 'AVAILABLE' })), 'Produtos ativados.')}>Ativar produtos</ActionButton>
                    {currentItem.options.length > 0 && (
                      <ActionButton secondary disabled={busy} onClick={() => patchStatus('patch-option-status', currentItem.options.map((option) => ({ optionId: option.id, status: 'UNAVAILABLE' })), 'Complementos pausados.')}>Pausar complementos</ActionButton>
                    )}
                    {currentItem.options.length > 0 && (
                      <ActionButton secondary disabled={busy} onClick={() => patchStatus('patch-option-status', currentItem.options.map((option) => ({ optionId: option.id, status: 'AVAILABLE' })), 'Complementos ativados.')}>Ativar complementos</ActionButton>
                    )}
                  </div>
                </Panel>
              </>
            )}

            <Panel title="Resumo do cardápio">
              <div className="flex flex-wrap gap-6 text-sm">
                <p><span className="text-gray-500">Categorias</span><strong className="ml-2 text-gray-900">{categories.length}</strong></p>
                <p><span className="text-gray-500">Itens listados</span><strong className="ml-2 text-gray-900">{catalogItemCount}</strong></p>
              </div>
              <JsonPanel title="Dados detalhados do cardápio" value={categories} />
            </Panel>
          </div>
        )}
      </div>
    </main>
  );
}
