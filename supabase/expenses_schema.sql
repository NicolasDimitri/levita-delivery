-- ============================================================
-- SISTEMA FINANCEIRO - rode no SQL Editor do Supabase
-- ============================================================

create table public.expenses (
  id uuid primary key default gen_random_uuid(),

  -- quem registrou
  registered_by      uuid not null references public.profiles(id),
  registered_by_name text not null,

  -- descrição e categoria
  description text not null,
  category    text not null check (category in ('pessoal', 'empresarial')),

  -- método de pagamento (8 opções)
  payment_method text not null check (payment_method in (
    'nubank', 'business', 'mercado_pago', 'ifood_pago',
    'boleto', 'pix', 'emprestimo', 'emprestado'
  )),

  -- valor: pra cartões/pix/boleto à vista = valor total
  --        pra empréstimo/boleto semanal  = valor da parcela
  amount numeric(10,2) not null,

  -- ── CARTÕES (nubank / business / mercado_pago / ifood_pago) ──────────
  -- número de parcelas mensais (1 = à vista no cartão)
  card_installments integer,

  -- ── BOLETO ───────────────────────────────────────────────────────────
  -- 'avista'          : pagamento único, vence em 14 dias
  -- 'parcelado_semanal': 1ª cobrança em 7 dias, restantes semanalmente
  boleto_type                text check (boleto_type in ('avista', 'parcelado_semanal')),
  boleto_weekly_installments integer, -- qtd de semanas (só pra parcelado_semanal)

  -- ── EMPRÉSTIMO ───────────────────────────────────────────────────────
  -- mesmo valor (amount) repetido mensalmente por loan_installments meses
  loan_installments integer,

  -- ── EMPRESTADO ───────────────────────────────────────────────────────
  -- sem data, sem parcelas — só valor + nome de quem emprestou
  lender_name text,

  -- data da compra/registro
  purchase_date date not null default current_date,

  created_at timestamptz not null default now()
);

create index expenses_registered_by_idx on public.expenses(registered_by);
create index expenses_purchase_date_idx on public.expenses(purchase_date);
create index expenses_payment_method_idx on public.expenses(payment_method);
create index expenses_category_idx on public.expenses(category);

-- RLS
alter table public.expenses enable row level security;

-- só admins acessam
create policy "admin acesso total a expenses"
  on public.expenses for all
  using (public.is_admin())
  with check (public.is_admin());

-- GRANTs
grant select, insert, update, delete on public.expenses to authenticated;
grant all on public.expenses to service_role;
