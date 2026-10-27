-- Levita Delivery - complete schema for a NEW development Supabase project.
-- Run this once in Supabase Dashboard > SQL Editor > New query.
-- This script creates structure and security rules only; it inserts no data.

begin;

create extension if not exists pgcrypto;

-- User profiles linked to Supabase Auth users.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'driver')),
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- iFood customers and last successfully verified delivery code.
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  ifood_customer_id text not null unique,
  nome text,
  ultimo_codigo_confirmacao text,
  ultimo_codigo_confirmado_em timestamptz,
  created_at timestamptz not null default now()
);

-- Orders imported from iFood.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  ifood_order_id text not null unique,
  display_id text,
  merchant_id text not null,
  ifood_customer_id text references public.clientes(ifood_customer_id),
  customer_name text not null,
  street text,
  street_number text,
  neighborhood text,
  complement text,
  reference text,
  payment_category text not null
    check (payment_category in ('online', 'dinheiro', 'debito', 'credito')),
  payment_raw jsonb,
  total_value numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  status text not null default 'recebido'
    check (status in ('recebido', 'em_preparo', 'pronto', 'em_rota', 'entregue', 'cancelado')),
  delivery_date_time timestamptz,
  ifood_dispatched_at timestamptz,
  requires_delivery_code boolean not null default true,
  delivery_code_confirmado text,
  driver_id uuid references public.profiles(id),
  assigned_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index orders_driver_id_idx on public.orders(driver_id);
create index orders_status_idx on public.orders(status);
create index orders_ifood_customer_id_idx on public.orders(ifood_customer_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  name text not null,
  quantity integer not null default 1,
  unit_price numeric(10,2) not null default 0
);

create index order_items_order_id_idx on public.order_items(order_id);

create table public.order_item_additions (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  name text not null,
  quantity integer not null default 1,
  unit_price numeric(10,2) not null default 0
);

create index order_item_additions_item_id_idx
  on public.order_item_additions(order_item_id);

create table public.delivery_history (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id),
  order_id uuid not null references public.orders(id),
  valor_entrega numeric(10,2) not null default 0,
  concluded_at timestamptz not null default now()
);

create index delivery_history_driver_id_idx
  on public.delivery_history(driver_id);

-- A deleted admin profile must not erase or block historical withdrawals.
create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id),
  valor numeric(10,2) not null,
  paid_at timestamptz not null default now(),
  paid_by uuid,
  constraint withdrawals_paid_by_fkey
    foreign key (paid_by) references public.profiles(id) on delete set null
);

create index withdrawals_driver_id_idx on public.withdrawals(driver_id);

-- Deduplication of iFood webhook events.
create table public.webhook_events (
  id text primary key,
  received_at timestamptz not null default now()
);

create index webhook_events_received_at_idx
  on public.webhook_events(received_at);

-- Financial expenses.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  registered_by uuid not null references public.profiles(id),
  registered_by_name text not null,
  description text not null,
  category text not null check (category in ('pessoal', 'empresarial')),
  payment_method text not null check (payment_method in (
    'nubank', 'business', 'mercado_pago', 'ifood_pago',
    'boleto', 'pix', 'emprestimo', 'emprestado'
  )),
  amount numeric(10,2) not null,
  card_installments integer,
  boleto_type text check (boleto_type in ('avista', 'parcelado_semanal')),
  boleto_weekly_installments integer,
  loan_installments integer,
  lender_name text,
  purchase_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index expenses_registered_by_idx on public.expenses(registered_by);
create index expenses_purchase_date_idx on public.expenses(purchase_date);
create index expenses_payment_method_idx on public.expenses(payment_method);
create index expenses_category_idx on public.expenses(category);

-- Financial payments and debt settlements.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  registered_by uuid not null references public.profiles(id),
  registered_by_name text not null,
  payment_type text not null check (payment_type in (
    'fatura_cartao', 'antecipacao_cartao',
    'quitacao_boleto', 'quitacao_emprestimo', 'quitacao_emprestado'
  )),
  reference text not null,
  amount numeric(10,2) not null,
  is_full_payment boolean not null default false,
  category text not null check (category in ('pessoal', 'empresarial')),
  notes text,
  payment_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index payments_registered_by_idx on public.payments(registered_by);
create index payments_payment_date_idx on public.payments(payment_date);
create index payments_reference_idx on public.payments(reference);

-- Helper used by RLS policies. The fixed empty search_path prevents object
-- shadowing; referenced objects are explicitly schema-qualified.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

-- Enable row-level security on every application table.
alter table public.profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_additions enable row level security;
alter table public.delivery_history enable row level security;
alter table public.withdrawals enable row level security;
alter table public.webhook_events enable row level security;
alter table public.expenses enable row level security;
alter table public.payments enable row level security;

-- profiles: users may read their own profile; admins may read all profiles.
create policy "ver o proprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "admin ve todos os perfis"
  on public.profiles for select
  using (public.is_admin());

-- Public signup can only create the caller's own driver profile.
create policy "signup publico cria perfil de driver"
  on public.profiles for insert
  with check (auth.uid() = id and role = 'driver');

create policy "admin acessa clientes"
  on public.clientes for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin acesso total a orders"
  on public.orders for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "driver ve seus pedidos"
  on public.orders for select
  using (driver_id = auth.uid());

create policy "admin acesso total a order_items"
  on public.order_items for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "driver ve itens dos seus pedidos"
  on public.order_items for select
  using (
    exists (
      select 1
      from public.orders
      where orders.id = order_items.order_id
        and orders.driver_id = auth.uid()
    )
  );

create policy "admin acesso total a order_item_additions"
  on public.order_item_additions for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "driver ve adicionais dos seus pedidos"
  on public.order_item_additions for select
  using (
    exists (
      select 1
      from public.order_items
      join public.orders on orders.id = order_items.order_id
      where order_items.id = order_item_additions.order_item_id
        and orders.driver_id = auth.uid()
    )
  );

create policy "admin ve todo o historico"
  on public.delivery_history for select
  using (public.is_admin());

create policy "driver ve seu proprio historico"
  on public.delivery_history for select
  using (driver_id = auth.uid());

create policy "admin acesso total a withdrawals"
  on public.withdrawals for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "driver ve seus proprios saques"
  on public.withdrawals for select
  using (driver_id = auth.uid());

create policy "admin acesso total a expenses"
  on public.expenses for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin acesso total a payments"
  on public.payments for all
  using (public.is_admin())
  with check (public.is_admin());

-- webhook_events intentionally has no authenticated/anon policies.

-- Explicit table grants; RLS above restricts which rows authenticated users see.
grant usage on schema public to authenticated, service_role;

grant select, insert on public.profiles to authenticated;
grant select on public.clientes to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select on public.order_item_additions to authenticated;
grant select on public.delivery_history to authenticated;
grant select, insert on public.withdrawals to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.payments to authenticated;

grant all on public.profiles to service_role;
grant all on public.clientes to service_role;
grant all on public.orders to service_role;
grant all on public.order_items to service_role;
grant all on public.order_item_additions to service_role;
grant all on public.delivery_history to service_role;
grant all on public.withdrawals to service_role;
grant all on public.webhook_events to service_role;
grant all on public.expenses to service_role;
grant all on public.payments to service_role;

-- Realtime updates consumed by the admin and driver order screens.
alter publication supabase_realtime add table public.orders;

commit;

-- After running this script, create an Auth user for the administrator:
-- Dashboard > Authentication > Users > Add user.
-- Then copy that user's UUID and run the following separately:
--
-- insert into public.profiles (id, role, name)
-- values ('AUTH_USER_UUID_HERE', 'admin', 'Development Admin');
--
-- Do not copy production data or production credentials into this project.
