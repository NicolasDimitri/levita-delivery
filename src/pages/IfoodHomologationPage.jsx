import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const API_PATH = '/api/ifood/store-hours-status';
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

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
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
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
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
        secondary
          ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          : 'bg-orange-600 text-white hover:bg-orange-700'
      }`}
    >
      {children}
    </button>
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
    <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-gray-800">{title}</h2>
      {children}
    </section>
  );
}

export default function IfoodHomologationPage() {
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
  const [storeName, setStoreName] = useState('');
  const [storeError, setStoreError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [pauseDescription, setPauseDescription] = useState('Pausa de teste de homologação');
  const [itemName, setItemName] = useState('Produto Teste');
  const [itemPrice, setItemPrice] = useState('19,90');
  const [groupName, setGroupName] = useState('Complementos de teste');
  const [optionNames, setOptionNames] = useState(['Complemento 1', 'Complemento 2']);
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
  }

  async function loadCategories() {
    if (!merchantId) return;
    if (!authorizedMerchantIds.includes(merchantId)) {
      setCategories([]);
      setCategoryId('');
      setCurrentItem(null);
      return;
    }
    setCatalogError('');
    try {
      const result = await callApi('categories', { merchantId });
      const available = getList(result, 'categories');
      setCategories(available);
      const categoryIds = available.map((category) => category.id || category.categoryId);
      setCategoryId((current) => categoryIds.includes(current) ? current : categoryIds[0] || '');
    } catch (error) {
      setCatalogError(error.message);
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
    await perform('set-hours', { shifts }, 'Horários do checklist enviados ao iFood.', loadStore);
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
    const end = new Date(interruption.end).getTime();
    return Number.isFinite(end) && end > Date.now();
  });

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <Link to="/admin" className="text-sm text-orange-700 hover:underline">← Voltar ao painel</Link>
            <h1 className="mt-1 text-xl font-bold text-gray-900">Homologação iFood</h1>
            <p className="text-sm text-gray-500">Execute os cenários do checklist em uma loja do aplicativo de teste.</p>
          </div>
          <label className="min-w-64 text-sm font-medium text-gray-700">
            Loja de teste
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              value={merchantId}
              onChange={(event) => setMerchantId(event.target.value)}
            >
              <option value="">Selecione uma loja</option>
              {merchants.map((merchant) => {
                const id = getMerchantId(merchant);
                return <option key={id} value={id}>{merchant.name || id} — {id}</option>;
              })}
            </select>
          </label>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Use somente credenciais e lojas de teste. Horários, pausas, categorias, itens, preços e disponibilidade são enviados ao iFood e alteram a loja selecionada.
        </div>
        <p className="text-sm text-gray-600">
          Para abrir o chamado, grave cada cenário separadamente e anote a data/hora e o client_id do app de teste. Os logs HTTP Requests são baixados no Developer Portal e anexados ao chamado.
        </p>
        {!isAuthorizedMerchant && merchantId && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            A homologação só pode ser executada com o único merchantId de teste configurado em IFOOD_MERCHANT_IDS.
          </p>
        )}
        {notice && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
        <div className="flex gap-2">
          {[
            ['merchant', 'Merchant'],
            ['catalog', 'Catalog']
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'}`}
            >
              {label}
            </button>
          ))}
          <ActionButton secondary onClick={activeTab === 'merchant' ? loadStore : loadCategories} disabled={!merchantId || busy}>
            Atualizar dados
          </ActionButton>
          <ActionButton secondary onClick={loadMerchants} disabled={busy}>Listar lojas</ActionButton>
        </div>

        {activeTab === 'merchant' ? (
          <div className="space-y-5">
            {storeError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{storeError}</p>}
            <Panel title="Cenário 1 — Informações da Loja">
              <p className="text-sm text-gray-600">Loja selecionada: <strong>{selectedMerchant?.name || merchantId || '—'}</strong></p>
              <div className="grid gap-3 sm:grid-cols-2">
                <JsonPanel title="Detalhes completos" value={details} />
                <JsonPanel title="Disponibilidade" value={status} />
              </div>
            </Panel>

            <Panel title="Cenário 2 — Interrupção na Loja">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field label="Descrição da pausa" value={pauseDescription} onChange={setPauseDescription} />
                <div className="self-end"><ActionButton onClick={createInterruption} disabled={!isAuthorizedMerchant || busy}>Cadastrar pausa de 24h</ActionButton></div>
              </div>
              <p className="text-sm text-gray-600">Pausas ativas: {activeInterruptions.length}</p>
              {interruptions.length === 0
                ? <p className="text-sm text-gray-500">Nenhuma pausa retornada pela API.</p>
                : <div className="space-y-2">
                  {interruptions.map((interruption) => (
                    <div key={interruption.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                      <span>{interruption.description || 'Pausa'} · {interruption.start} — {interruption.end}</span>
                      {interruption.id && <ActionButton secondary onClick={() => removeInterruption(interruption.id)} disabled={!isAuthorizedMerchant || busy}>Remover pausa</ActionButton>}
                    </div>
                  ))}
                </div>}
            </Panel>

            <Panel title="Cenário 3 — Horário de Funcionamento">
              <p className="text-sm text-gray-600">O envio preserva os demais dias configurados e substitui somente sábado e domingo pelos horários do checklist.</p>
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                <p><strong>Sábado:</strong> 10:00–19:00</p>
                <p><strong>Domingo:</strong> 09:00–12:00, 13:00–16:00 e 17:00–23:00</p>
              </div>
              <ActionButton onClick={applyChecklistHours} disabled={!isAuthorizedMerchant || busy}>Cadastrar horários do checklist</ActionButton>
              <JsonPanel title="Horários consultados" value={hours} />
            </Panel>
          </div>
        ) : (
          <div className="space-y-5">
            {catalogError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{catalogError}</p>}
            <Panel title="Cenário 1 — Categoria e Item">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field label="Nome da categoria" value={categoryName} onChange={setCategoryName} />
                <div className="self-end"><ActionButton onClick={createCategory} disabled={!isAuthorizedMerchant || busy}>Criar categoria</ActionButton></div>
              </div>
              <label className="block text-sm font-medium text-gray-700">
                Categoria do item
                <select className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Selecione</option>
                  {categories.map((category) => {
                    const id = category.id || category.categoryId;
                    return <option key={id} value={id}>{category.name || id}</option>;
                  })}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome do item" value={itemName} onChange={setItemName} />
                <Field label="Preço (R$)" value={itemPrice} onChange={setItemPrice} inputMode="decimal" />
              </div>
              <label className="block text-sm text-gray-700">Foto do item (JPG/PNG)
                <input className="mt-1 block w-full text-sm" type="file" accept="image/jpeg,image/png" onChange={(event) => setItemImage(event.target.files?.[0] || null)} />
              </label>
              <ActionButton onClick={createCatalogItem} disabled={!isAuthorizedMerchant || busy}>Criar item ativo</ActionButton>
            </Panel>

            <Panel title="Cenário 2 — Grupo e Complementos">
              <Field label="Nome do grupo" value={groupName} onChange={setGroupName} />
              {[0, 1].map((index) => (
                <div key={index} className="grid gap-3 rounded-xl bg-gray-50 p-3 sm:grid-cols-3">
                  <Field label={`Nome do complemento ${index + 1}`} value={optionNames[index]} onChange={(value) => setOptionNames((current) => current.map((name, i) => i === index ? value : name))} />
                  <Field label="Preço (R$)" value={optionPrices[index]} onChange={(value) => setOptionPrices((current) => current.map((price, i) => i === index ? value : price))} inputMode="decimal" />
                  <label className="block text-sm text-gray-700">Foto (JPG/PNG)
                    <input className="mt-1 block w-full text-xs" type="file" accept="image/jpeg,image/png" onChange={(event) => setOptionImages((current) => current.map((file, i) => i === index ? event.target.files?.[0] || null : file))} />
                  </label>
                </div>
              ))}
              <p className="text-sm text-gray-500">Os dois complementos são criados junto com o item usando um grupo de opções.</p>
            </Panel>

            {currentItem && (
              <>
                <Panel title="Cenário 3 — Alteração de Item e Complementos">
                  <p className="text-sm text-gray-600">Item de teste: {currentItem.item.id}. Renomear e trocar fotos usa PUT /items; preços e disponibilidade usam os endpoints PATCH solicitados pelo suporte.</p>
                  <Field label="Novo nome do item" value={editItemName} onChange={setEditItemName} />
                  <label className="block text-sm text-gray-700">Nova foto do item
                    <input className="mt-1 block w-full text-sm" type="file" accept="image/jpeg,image/png" onChange={(event) => setEditItemImage(event.target.files?.[0] || null)} />
                  </label>
                  {[0, 1].map((index) => (
                    <div key={index} className="grid gap-3 rounded-xl bg-gray-50 p-3 sm:grid-cols-2">
                      <Field label={`Novo nome do complemento ${index + 1}`} value={editOptionNames[index]} onChange={(value) => setEditOptionNames((current) => current.map((name, i) => i === index ? value : name))} />
                      <label className="block text-sm text-gray-700">Nova foto
                        <input className="mt-1 block w-full text-sm" type="file" accept="image/jpeg,image/png" onChange={(event) => setEditOptionImages((current) => current.map((file, i) => i === index ? event.target.files?.[0] || null : file))} />
                      </label>
                    </div>
                  ))}
                  <ActionButton onClick={saveItemNamesAndImages} disabled={busy}>Salvar nomes e fotos (PUT /items)</ActionButton>
                  {batchItems.length < 2 && (
                    <ActionButton secondary onClick={createBatchItem} disabled={busy}>
                      Criar item extra para demonstrar lote
                    </ActionButton>
                  )}
                  <JsonPanel title="Payload atual do item" value={currentItem} />
                </Panel>

                <Panel title="Atualizações de preço em lote (PATCH)">
                  <p className="text-sm text-gray-600">Itens no lote: {batchItems.length}. O segundo item é opcional; crie-o para mostrar vários itens em uma chamada.</p>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <Field label="Preço a aplicar aos itens selecionados (R$)" value={updatedItemPrice} onChange={setUpdatedItemPrice} inputMode="decimal" />
                    <div className="self-end">
                      <ActionButton disabled={busy} onClick={() => updatePrice('patch-item-price', () => batchItems.map((item) => ({ itemId: item.item.id, price: { value: parsePrice(updatedItemPrice) } })), 'Preço aplicado por PATCH /items/price.')}>Atualizar {batchItems.length} item(ns)</ActionButton>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {currentItem.options.map((option, index) => (
                      <Field key={option.id} label={`Preço de ${editOptionNames[index] || `complemento ${index + 1}`} (R$)`} value={updatedOptionPrices[index]} onChange={(value) => setUpdatedOptionPrices((current) => current.map((price, i) => i === index ? value : price))} inputMode="decimal" />
                    ))}
                  </div>
                  {currentItem.options.length > 0 && (
                    <ActionButton secondary disabled={busy} onClick={() => updatePrice('patch-option-price', () => currentItem.options.map((option, index) => ({ optionId: option.id, price: { value: parsePrice(updatedOptionPrices[index]) } })), 'Preços dos complementos atualizados por PATCH /options/price.')}>Atualizar complementos (PATCH /options/price)</ActionButton>
                  )}
                </Panel>

                <Panel title="Atualizações de disponibilidade (PATCH)">
                  <div className="flex flex-wrap gap-2">
                    <ActionButton secondary disabled={busy} onClick={() => patchStatus('patch-item-status', batchItems.map((item) => ({ itemId: item.item.id, status: 'UNAVAILABLE' })), 'Itens pausados por PATCH /items/status.')}>Pausar itens do lote</ActionButton>
                    <ActionButton secondary disabled={busy} onClick={() => patchStatus('patch-item-status', batchItems.map((item) => ({ itemId: item.item.id, status: 'AVAILABLE' })), 'Itens ativados por PATCH /items/status.')}>Ativar itens do lote</ActionButton>
                    {currentItem.options.length > 0 && (
                      <ActionButton secondary disabled={busy} onClick={() => patchStatus('patch-option-status', currentItem.options.map((option) => ({ optionId: option.id, status: 'UNAVAILABLE' })), 'Complementos pausados por PATCH /options/status.')}>Pausar complementos</ActionButton>
                    )}
                    {currentItem.options.length > 0 && (
                      <ActionButton secondary disabled={busy} onClick={() => patchStatus('patch-option-status', currentItem.options.map((option) => ({ optionId: option.id, status: 'AVAILABLE' })), 'Complementos ativados por PATCH /options/status.')}>Ativar complementos</ActionButton>
                    )}
                  </div>
                </Panel>
              </>
            )}

            <Panel title="Dados atuais do Catalog">
              <JsonPanel title="Categorias, itens e complementos" value={categories} />
            </Panel>
          </div>
        )}
      </div>
    </main>
  );
}
