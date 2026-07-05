-- ============================================================
-- SCHEMA COMPLETO — Levita Delivery + Controle Financeiro
-- Arquivo único, rode do zero após o reset.sql se necessário.
-- Inclui: tabelas, índices, funções, RLS, grants e realtime.
-- ============================================================

-- extensão necessária
create extension if not exists "pgcrypto";

-- ============================================================
-- TABELA: profiles
-- ============================================================
create table public.profiles (
  id    uuid primary key references auth.users(id) on delete cascade,
  role  text not null check (role in ('admin', 'driver')),
  name  text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TABELA: clientes (identificados pelo customer.id do iFood)
-- ============================================================
create table public.clientes (
  id                        uuid primary key default gen_random_uuid(),
  ifood_customer_id         text not null unique,
  nome                      text,
  ultimo_codigo_confirmacao text,
  ultimo_codigo_confirmado_em timestamptz,
  created_at                timestamptz not null default now()
);

-- ============================================================
-- TABELA: orders
-- ============================================================
create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  ifood_order_id   text not null unique,
  display_id       text,
  merchant_id      text not null,
  ifood_customer_id text references public.clientes(ifood_customer_id),
  customer_name    text not null,
  street           text,
  street_number    text,
  neighborhood     text,
  complement       text,
  reference        text,
  payment_category text not null check (payment_category in ('online','dinheiro','debito','credito')),
  payment_raw      jsonb,
  total_value      numeric(10,2) not null default 0,
  delivery_fee     numeric(10,2) not null default 0,
  delivery_date_time timestamptz,
  status           text not null default 'recebido'
    check (status in ('recebido','em_preparo','pronto','em_rota','entregue','cancelado')),
  requires_delivery_code boolean not null default true,
  delivery_code_confirmado text,
  ifood_dispatched_at timestamptz,
  driver_id        uuid references public.profiles(id),
  assigned_at      timestamptz,
  delivered_at     timestamptz,
  created_at       timestamptz not null default now()
);

create index orders_driver_id_idx        on public.orders(driver_id);
create index orders_status_idx           on public.orders(status);
create index orders_ifood_customer_id_idx on public.orders(ifood_customer_id);

-- ============================================================
-- TABELA: order_items
-- ============================================================
create table public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  name       text not null,
  quantity   integer not null default 1,
  unit_price numeric(10,2) not null default 0
);

create index order_items_order_id_idx on public.order_items(order_id);

-- ============================================================
-- TABELA: order_item_additions
-- ============================================================
create table public.order_item_additions (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  name          text not null,
  quantity      integer not null default 1,
  unit_price    numeric(10,2) not null default 0
);

create index order_item_additions_item_id_idx on public.order_item_additions(order_item_id);

-- ============================================================
-- TABELA: delivery_history
-- ============================================================
create table public.delivery_history (
  id           uuid primary key default gen_random_uuid(),
  driver_id    uuid not null references public.profiles(id),
  order_id     uuid not null references public.orders(id),
  valor_entrega numeric(10,2) not null default 0,
  concluded_at timestamptz not null default now()
);

create index delivery_history_driver_id_idx on public.delivery_history(driver_id);

-- ============================================================
-- TABELA: withdrawals (saques manuais do saldo do entregador)
-- ============================================================
create table public.withdrawals (
  id        uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id),
  valor     numeric(10,2) not null,
  paid_at   timestamptz not null default now(),
  paid_by   uuid references public.profiles(id)
);

create index withdrawals_driver_id_idx on public.withdrawals(driver_id);

-- ============================================================
-- TABELA: webhook_events (dedupe de eventos do iFood)
-- ============================================================
create table public.webhook_events (
  id          text primary key,
  received_at timestamptz not null default now()
);

create index webhook_events_received_at_idx on public.webhook_events(received_at);

-- ============================================================
-- TABELA: expenses (controle financeiro — gastos)
-- ============================================================
create table public.expenses (
  id                         uuid primary key default gen_random_uuid(),
  registered_by              uuid not null references public.profiles(id),
  registered_by_name         text not null,
  description                text not null,
  category                   text not null check (category in ('pessoal','empresarial')),
  payment_method             text not null check (payment_method in (
    'nubank','business','mercado_pago','ifood_pago',
    'boleto','pix','emprestimo','emprestado'
  )),
  amount                     numeric(10,2) not null,
  card_installments          integer,
  boleto_type                text check (boleto_type in ('avista','parcelado_semanal')),
  boleto_weekly_installments integer,
  loan_installments          integer,
  lender_name                text,
  purchase_date              date not null default current_date,
  created_at                 timestamptz not null default now()
);

create index expenses_registered_by_idx  on public.expenses(registered_by);
create index expenses_purchase_date_idx  on public.expenses(purchase_date);
create index expenses_payment_method_idx on public.expenses(payment_method);
create index expenses_category_idx       on public.expenses(category);

-- ============================================================
-- TABELA: payments (controle financeiro — pagamentos)
-- ============================================================
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  registered_by      uuid not null references public.profiles(id),
  registered_by_name text not null,
  payment_type       text not null check (payment_type in (
    'fatura_cartao','antecipacao_cartao',
    'quitacao_boleto','quitacao_emprestimo','quitacao_emprestado'
  )),
  reference          text not null,
  amount             numeric(10,2) not null,
  is_full_payment    boolean default false,
  category           text not null check (category in ('pessoal','empresarial')),
  notes              text,
  payment_date       date not null default current_date,
  created_at         timestamptz not null default now()
);

create index payments_registered_by_idx on public.payments(registered_by);
create index payments_payment_date_idx  on public.payments(payment_date);
create index payments_reference_idx     on public.payments(reference);

-- ============================================================
-- FUNÇÃO: is_admin() — usada dentro das policies de RLS
-- security definer = roda com permissão do criador, não do chamador
-- ============================================================
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- RLS: habilita em todas as tabelas
-- ============================================================
alter table public.profiles              enable row level security;
alter table public.clientes              enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_item_additions  enable row level security;
alter table public.delivery_history      enable row level security;
alter table public.withdrawals           enable row level security;
alter table public.webhook_events        enable row level security;
alter table public.expenses              enable row level security;
alter table public.payments              enable row level security;

-- ── profiles ─────────────────────────────────────────────────────────────
create policy "ver o proprio perfil"
  on public.profiles for select using (auth.uid() = id);

create policy "admin ve todos os perfis"
  on public.profiles for select using (public.is_admin());

create policy "signup cria perfil de driver"
  on public.profiles for insert
  with check (auth.uid() = id and role = 'driver');

-- ── clientes ─────────────────────────────────────────────────────────────
create policy "admin acessa clientes"
  on public.clientes for all
  using (public.is_admin()) with check (public.is_admin());

-- ── orders ───────────────────────────────────────────────────────────────
create policy "admin acesso total a orders"
  on public.orders for all
  using (public.is_admin()) with check (public.is_admin());

create policy "driver ve seus pedidos"
  on public.orders for select using (driver_id = auth.uid());

-- ── order_items ──────────────────────────────────────────────────────────
create policy "admin acesso total a order_items"
  on public.order_items for all
  using (public.is_admin()) with check (public.is_admin());

create policy "driver ve itens dos seus pedidos"
  on public.order_items for select using (
    exists (select 1 from public.orders where orders.id = order_items.order_id and orders.driver_id = auth.uid())
  );

-- ── order_item_additions ─────────────────────────────────────────────────
create policy "admin acesso total a order_item_additions"
  on public.order_item_additions for all
  using (public.is_admin()) with check (public.is_admin());

create policy "driver ve adicionais dos seus pedidos"
  on public.order_item_additions for select using (
    exists (
      select 1 from public.order_items
      join public.orders on orders.id = order_items.order_id
      where order_items.id = order_item_additions.order_item_id
      and orders.driver_id = auth.uid()
    )
  );

-- ── delivery_history ─────────────────────────────────────────────────────
create policy "admin ve todo o historico"
  on public.delivery_history for select using (public.is_admin());

create policy "driver ve seu proprio historico"
  on public.delivery_history for select using (driver_id = auth.uid());

-- ── withdrawals ──────────────────────────────────────────────────────────
create policy "admin acesso total a withdrawals"
  on public.withdrawals for all
  using (public.is_admin()) with check (public.is_admin());

create policy "driver ve seus proprios saques"
  on public.withdrawals for select using (driver_id = auth.uid());

-- ── expenses e payments ──────────────────────────────────────────────────
create policy "admin acesso total a expenses"
  on public.expenses for all
  using (public.is_admin()) with check (public.is_admin());

create policy "admin acesso total a payments"
  on public.payments for all
  using (public.is_admin()) with check (public.is_admin());

-- webhook_events: sem policy = só service_role acessa (ignora RLS)

-- ============================================================
-- GRANTS
-- ============================================================
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- authenticated (frontend — protegido pelo RLS acima)
grant select, insert on public.profiles             to authenticated;
grant select         on public.clientes             to authenticated;
grant select, update on public.orders               to authenticated;
grant select         on public.order_items          to authenticated;
grant select         on public.order_item_additions to authenticated;
grant select         on public.delivery_history     to authenticated;
grant select, insert on public.withdrawals          to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.payments to authenticated;

-- service_role (funções serverless /api — ignora RLS)
grant all on public.profiles             to service_role;
grant all on public.clientes             to service_role;
grant all on public.orders               to service_role;
grant all on public.order_items          to service_role;
grant all on public.order_item_additions to service_role;
grant all on public.delivery_history     to service_role;
grant all on public.withdrawals          to service_role;
grant all on public.webhook_events       to service_role;
grant all on public.expenses             to service_role;
grant all on public.payments             to service_role;

-- ============================================================
-- REALTIME: atualizações em tempo real na tabela orders
-- ============================================================
alter publication supabase_realtime add table public.orders;

-- ============================================================
-- FIM DO SCHEMA
-- Próximo passo: criar o usuário admin manualmente:
--
-- 1. Supabase → Authentication → Users → Add user → Create new user
-- 2. Copie o UUID gerado
-- 3. Execute:
--    insert into public.profiles (id, role, name)
--    values ('UUID_AQUI', 'admin', 'Seu Nome');
-- ============================================================
