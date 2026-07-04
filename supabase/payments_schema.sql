-- ============================================================
-- MIGRAÇÃO: sistema de pagamentos (quitação de dívidas e faturas)
-- Execute no SQL Editor do Supabase
-- ============================================================

-- Tipos de pagamento possíveis
create table public.payments (
  id uuid primary key default gen_random_uuid(),

  registered_by      uuid not null references public.profiles(id),
  registered_by_name text not null,

  -- O que está sendo pago
  payment_type text not null check (payment_type in (
    'fatura_cartao',      -- pagamento normal da fatura (total ou parcial)
    'antecipacao_cartao', -- pagamento antecipado (antes do vencimento)
    'quitacao_boleto',    -- quitar um boleto parcelado
    'quitacao_emprestimo',-- quitar parcelas de empréstimo
    'quitacao_emprestado' -- devolver valor emprestado
  )),

  -- Referência (qual cartão, qual empréstimo etc.)
  -- Para cartões: 'nubank', 'business', 'mercado_pago', 'ifood_pago'
  -- Para outros: descrição livre do que está sendo quitado
  reference text not null,

  -- Valor pago
  amount numeric(10,2) not null,

  -- Para pagamentos de fatura: parcial ou total
  is_full_payment boolean default false,

  -- Categoria (pessoal/empresarial, igual aos gastos)
  category text not null check (category in ('pessoal', 'empresarial')),

  -- Observações livres (ex: "Antecipei 3 parcelas", "Quitei metade da dívida")
  notes text,

  payment_date date not null default current_date,
  created_at   timestamptz not null default now()
);

create index payments_registered_by_idx on public.payments(registered_by);
create index payments_payment_date_idx  on public.payments(payment_date);
create index payments_reference_idx     on public.payments(reference);

-- RLS
alter table public.payments enable row level security;

create policy "admin acesso total a payments"
  on public.payments for all
  using (public.is_admin())
  with check (public.is_admin());

-- GRANTs
grant select, insert, update, delete on public.payments to authenticated;
grant all on public.payments to service_role;
