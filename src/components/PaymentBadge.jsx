// src/components/PaymentBadge.jsx
// verde = pago online | azul = dinheiro | amarelo = débito | vermelho = crédito

const STYLES = {
  online: { bg: 'bg-green-600', label: 'PAGO ONLINE' },
  dinheiro: { bg: 'bg-blue-600', label: 'RECEBER EM DINHEIRO' },
  debito: { bg: 'bg-yellow-500', label: 'RECEBER NO DÉBITO' },
  credito: { bg: 'bg-red-600', label: 'RECEBER NO CRÉDITO' }
};

export default function PaymentBadge({ category, value }) {
  const style = STYLES[category] || STYLES.online;

  return (
    <div className={`${style.bg} rounded-lg px-4 py-3 text-center text-white shadow-sm`}>
      <p className="text-xs font-medium tracking-wide opacity-90">FORMA DE PAGAMENTO</p>
      <p className="text-lg font-bold leading-tight">{style.label}</p>
      {category !== 'online' && typeof value === 'number' && (
        <p className="mt-0.5 text-sm font-medium">Cobrar R$ {value.toFixed(2)}</p>
      )}
    </div>
  );
}
