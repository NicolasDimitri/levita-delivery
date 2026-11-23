import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Button, Card, EmptyState, ErrorMsg } from '../lib/ui';
import { fetchAllInventoryRows, parseInventoryQuantity, submitInventoryMovement } from '../lib/inventory';

const fieldClass = 'w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none';
const formatQuantity = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(value);

export default function InventoryPage() {
  const { profile, signOut } = useAuth();
  const storageKey = `inventory-pending:${import.meta.env.VITE_SUPABASE_URL}:${profile.id}:`;
  const [snapshot, setSnapshot] = useState(null);
  const [locationId, setLocationId] = useState('');
  const [itemId, setItemId] = useState('');
  const [search, setSearch] = useState('');
  const [quantity, setQuantity] = useState('');
  const [direction, setDirection] = useState('increase');
  const [note, setNote] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemKind, setItemKind] = useState('raw');
  const [itemUnit, setItemUnit] = useState('un');
  const [locationName, setLocationName] = useState('');
  const [pending, setPending] = useState([]);
  const [storageReady, setStorageReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [message, setMessage] = useState('');
  const busy = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locations, items, balances] = await Promise.all([
        fetchAllInventoryRows(supabase, 'inventory_locations', 'id,name,active'),
        fetchAllInventoryRows(supabase, 'inventory_items', 'id,name,kind,unit,active'),
        fetchAllInventoryRows(supabase, 'inventory_balances', 'location_id,item_id,quantity', ['location_id', 'item_id']),
      ]);
      const activeLocations = locations.filter(location => location.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const activeItems = items.filter(item => item.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setSnapshot({ locations: activeLocations, items: activeItems, balances });
      setLocationId(current => activeLocations.some(location => location.id === current) ? current : activeLocations[0]?.id || '');
      setItemId(current => activeItems.some(item => item.id === current) ? current : '');
      setError('');
    } catch (loadError) {
      console.error('Não foi possível carregar o estoque', loadError);
      setSnapshot(null);
      setError('Não foi possível carregar o estoque. Verifique a conexão e se a migração de estoque foi executada.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const refreshPending = useCallback(() => {
    try {
      const operations = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(storageKey)) continue;
        const operation = JSON.parse(localStorage.getItem(key));
        if (!operation?.params?.p_operation || key !== `${storageKey}${operation.params.p_operation}`) {
          throw new Error('Movimentação pendente inválida');
        }
        operations.push(operation);
      }
      setPending(operations);
      setStorageReady(true);
      setStorageError('');
      return true;
    } catch (storageError) {
      console.error('Não foi possível recuperar a movimentação pendente', storageError);
      setStorageReady(false);
      setStorageError('Não foi possível acessar a movimentação pendente neste navegador. Não registre outra até conferir o histórico.');
      return false;
    }
  }, [storageKey]);
  useEffect(() => {
    refreshPending();
    window.addEventListener('storage', refreshPending);
    return () => window.removeEventListener('storage', refreshPending);
  }, [refreshPending]);

  async function createRecord(event, table, record, onCreated) {
    event.preventDefault();
    if (busy.current || pending.length) return;
    busy.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { error: insertError } = await supabase.from(table).insert(record);
      if (insertError) throw insertError;
      onCreated();
      await load();
      setMessage('Cadastro realizado.');
    } catch (insertError) {
      console.error('Não foi possível cadastrar no estoque', insertError);
      setError(`Não foi possível confirmar o cadastro: ${insertError.message}. Atualize a lista antes de tentar novamente.`);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function sendMovement(operation) {
    busy.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await submitInventoryMovement(supabase, operation);
      if (result.status === 'unknown') {
        setError('Não foi possível confirmar a movimentação. Tente confirmar novamente antes de registrar outra.');
      } else {
        localStorage.removeItem(`${storageKey}${operation.params.p_operation}`);
        refreshPending();
        if (result.status === 'rejected') {
          setError(`Movimentação não realizada: ${result.message}`);
        } else {
          setQuantity('');
          setNote('');
          await load();
          setMessage('Movimentação registrada.');
        }
      }
    } catch (saveError) {
      console.error('Não foi possível confirmar a movimentação de estoque', saveError);
      setError('Não foi possível confirmar a movimentação. Tente confirmar novamente antes de registrar outra.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function handleMovement(event) {
    event.preventDefault();
    if (busy.current || pending.length || !storageReady) return;
    const parsed = parseInventoryQuantity(quantity);
    if (!selectedLocation || !selectedItem || !parsed || !note.trim()) {
      setError('Selecione local e item, informe quantidade positiva com até 3 casas decimais e uma justificativa.');
      return;
    }
    let operation;
    try {
      operation = {
        params: {
          p_operation: crypto.randomUUID(),
          p_location: locationId,
          p_item: itemId,
          p_kind: 'adjustment',
          p_quantity: direction === 'decrease' ? `-${parsed}` : parsed,
          p_note: note.trim(),
        },
        label: `${direction === 'decrease' ? 'Diminuir' : 'Aumentar'} ${quantity} ${selectedItem.unit} de ${selectedItem.name} em ${selectedLocation.name}`,
      };
      localStorage.setItem(`${storageKey}${operation.params.p_operation}`, JSON.stringify(operation));
    } catch (storageError) {
      console.error('Não foi possível salvar a movimentação pendente', storageError);
      setError('Não foi possível preparar a movimentação com segurança neste navegador. Nenhuma alteração foi enviada.');
      return;
    }
    if (!refreshPending()) return;
    await sendMovement(operation);
  }

  const selectedLocation = snapshot?.locations.find(location => location.id === locationId);
  const selectedItem = snapshot?.items.find(item => item.id === itemId);
  const filteredItems = snapshot?.items.filter(item => item.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))) || [];
  const balanceByItem = new Map((snapshot?.balances || [])
    .filter(balance => balance.location_id === locationId)
    .map(balance => [balance.item_id, balance.quantity]));
  const disabled = loading || saving || pending.length > 0 || !storageReady;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div><p className="font-bold text-gray-800">Estoque</p><p className="text-xs text-gray-400">Olá, {profile.name}</p></div>
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-xs font-medium text-brand-600 hover:underline">← Pedidos</Link>
            <Button variant="ghost" onClick={signOut}>Sair</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 pt-5">
        <p className="text-sm text-gray-600">Consulte e movimente o saldo por local. Para compartilhar um item entre lojas, use o mesmo local de estoque.</p>
        <ErrorMsg message={error} />
        <ErrorMsg message={storageError} />
        {message && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}
        {pending.map(operation => (
          <Card key={operation.params.p_operation} className="border-amber-300 bg-amber-50">
            <p className="text-sm font-semibold text-amber-900">Movimentação aguardando confirmação</p>
            <p className="mt-1 text-sm text-amber-800">{operation.label}</p>
            <p className="mt-1 text-xs text-amber-800">A mesma operação será reutilizada para evitar uma baixa duplicada.</p>
            <Button className="mt-3" size="sm" disabled={saving} onClick={() => { if (!busy.current) sendMovement(operation); }}>Confirmar novamente</Button>
          </Card>
        ))}

        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-52 flex-1 text-sm font-medium text-gray-700">Local do estoque
              <select className={`${fieldClass} mt-1`} value={locationId} disabled={!snapshot || disabled} onChange={event => setLocationId(event.target.value)}>
                {!snapshot?.locations.length && <option value="">Nenhum local cadastrado</option>}
                {snapshot?.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>
            <Button variant="secondary" disabled={loading || saving} onClick={load}>Atualizar saldos</Button>
          </div>
          <label className="mt-4 block text-sm font-medium text-gray-700">Buscar item
            <input className={`${fieldClass} mt-1`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do insumo ou produto" />
          </label>
          {loading && <p className="mt-4 text-sm text-gray-500">Carregando estoque...</p>}
          {!loading && snapshot && !locationId && <EmptyState message="Cadastre um local para consultar o estoque." />}
          {!loading && snapshot && locationId && filteredItems.length === 0 && <EmptyState message="Nenhum item encontrado. Cadastre um item abaixo." />}
          {!loading && snapshot && locationId && filteredItems.length > 0 && (
            <div className="mt-4 divide-y divide-gray-100">
              {filteredItems.map(item => (
                <button key={item.id} type="button" disabled={disabled} onClick={() => setItemId(item.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-3 text-left hover:bg-gray-50 ${itemId === item.id ? 'bg-brand-50' : ''}`}>
                  <span><span className="block text-sm font-semibold text-gray-800">{item.name}</span><span className="text-xs text-gray-500">{item.kind === 'prepared' ? 'Preparado' : 'Insumo / produto'}</span></span>
                  <span className="whitespace-nowrap text-sm font-bold text-gray-800">{formatQuantity(balanceByItem.get(item.id) ?? 0)} {item.unit}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-bold text-gray-800">Movimentar estoque</h2>
          <form onSubmit={handleMovement} className="mt-3 space-y-3">
            <label className="block text-sm font-medium text-gray-700">Item
              <select required className={`${fieldClass} mt-1`} value={itemId} onChange={event => setItemId(event.target.value)} disabled={disabled || !locationId}>
                <option value="">Selecione um item</option>
                {snapshot?.items.map(item => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
              </select>
            </label>
            {selectedItem && locationId && <p className="text-sm text-gray-600">Saldo consultado: <strong>{formatQuantity(balanceByItem.get(itemId) ?? 0)} {selectedItem.unit}</strong></p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">Operação
                <select className={`${fieldClass} mt-1`} value={direction} onChange={event => setDirection(event.target.value)} disabled={disabled}>
                  <option value="increase">Aumentar</option><option value="decrease">Diminuir</option>
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">Quantidade {selectedItem ? `(${selectedItem.unit})` : ''}
                <input required inputMode="decimal" className={`${fieldClass} mt-1`} value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="Ex.: 1 ou 1,5" disabled={disabled} />
              </label>
            </div>
            <label className="block text-sm font-medium text-gray-700">Justificativa
              <input required className={`${fieldClass} mt-1`} value={note} onChange={event => setNote(event.target.value)} placeholder="Ex.: compra, consumo ou correção" disabled={disabled} />
            </label>
            <p className="text-xs text-gray-500">A quantidade é somada ou subtraída do saldo atual. Saídas sem saldo suficiente são bloqueadas.</p>
            <Button type="submit" disabled={disabled || !selectedItem || !selectedLocation}>{saving ? 'Salvando...' : 'Registrar movimentação'}</Button>
          </form>
        </Card>

        <details className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer font-semibold text-gray-800">Cadastrar local ou item</summary>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <form onSubmit={event => createRecord(event, 'inventory_locations', { name: locationName.trim() }, () => setLocationName(''))} className="space-y-3">
              <h2 className="text-sm font-bold text-gray-800">Novo local</h2>
              <label className="block text-sm text-gray-700">Nome do local<input required className={`${fieldClass} mt-1`} value={locationName} onChange={event => setLocationName(event.target.value)} disabled={disabled} placeholder="Ex.: Estoque compartilhado" /></label>
              <Button type="submit" size="sm" disabled={disabled || !locationName.trim()}>Cadastrar local</Button>
            </form>
            <form onSubmit={event => createRecord(event, 'inventory_items', { name: itemName.trim(), kind: itemKind, unit: itemUnit }, () => setItemName(''))} className="space-y-3">
              <h2 className="text-sm font-bold text-gray-800">Novo item</h2>
              <label className="block text-sm text-gray-700">Nome do item<input required className={`${fieldClass} mt-1`} value={itemName} onChange={event => setItemName(event.target.value)} disabled={disabled} placeholder="Ex.: Coca-Cola lata" /></label>
              <label className="block text-sm text-gray-700">Tipo<select className={`${fieldClass} mt-1`} value={itemKind} onChange={event => setItemKind(event.target.value)} disabled={disabled}><option value="raw">Insumo / produto</option><option value="prepared">Preparado na cozinha</option></select></label>
              <label className="block text-sm text-gray-700">Unidade<select className={`${fieldClass} mt-1`} value={itemUnit} onChange={event => setItemUnit(event.target.value)} disabled={disabled}><option value="un">Unidade (un)</option><option value="g">Gramas (g)</option><option value="ml">Mililitros (ml)</option></select></label>
              <p className="text-xs text-gray-500">A unidade e o tipo não podem ser alterados depois. Cadastre o item apenas uma vez para o estoque compartilhado.</p>
              <Button type="submit" size="sm" disabled={disabled || !itemName.trim()}>Cadastrar item</Button>
            </form>
          </div>
        </details>
      </main>
    </div>
  );
}
