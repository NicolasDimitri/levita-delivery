-- ============================================================
-- SCHEMA COMPLETO - Sistema de Entregas iFood
-- Execute este arquivo inteiro no SQL Editor do Supabase
-- (Supabase Dashboard > SQL Editor > New Query > cole tudo > Run)
-- ============================================================

-- Extensão necessária para gen_random_uuid()
create extension if not exists "pgcrypto";

-- ============================================================
-- TABELA: profiles
-- Um registro por usuário de autenticação (admin OU driver)
-- O admin é inserido manualmente por você (veja README)
-- Drivers se cadastram pela tela de signup do app
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'driver')),
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TABELA: clientes
-- Um registro por cliente do iFood (identificado pelo customer.id do iFood)
-- ultimo_codigo_confirmacao começa NULL e só é preenchido depois
-- que um entregador confirma a entrega pela 1a vez com sucesso
-- ============================================================
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  ifood_customer_id text not null unique,
  nome text,
  ultimo_codigo_confirmacao text,
  ultimo_codigo_confirmado_em timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TABELA: orders
-- ============================================================
create table public.orders (
  id uuid primary key default gen_random_uuid(),

  -- referência ao pedido no iFood
  ifood_order_id text not null unique,
  display_id text,
  merchant_id text not null,

  -- cliente
  ifood_customer_id text references public.clientes(ifood_customer_id),
  customer_name text not null,

  -- endereço
  street text,
  street_number text,
  neighborhood text,
  complement text,
  reference text,

  -- pagamento
  payment_category text not null check (payment_category in ('online', 'dinheiro', 'debito', 'credito')),
  payment_raw jsonb,
  total_value numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,

  -- itens (guardados também em tabelas filhas, ver abaixo)
  -- status do ciclo de vida no SEU sistema (não confundir com status do iFood)
  status text not null default 'recebido'
    check (status in ('recebido', 'em_preparo', 'a_caminho', 'entregue', 'cancelado')),

  -- confirmação de entrega (código do iFood, ver verifyDeliveryCode)
  requires_delivery_code boolean not null default true,
  delivery_code_confirmado text,

  -- atribuição ao entregador
  driver_id uuid references public.profiles(id),
  assigned_at timestamptz,
  delivered_at timestamptz,

  created_at timestamptz not null default now()
);

create index orders_driver_id_idx on public.orders(driver_id);
create index orders_status_idx on public.orders(status);
create index orders_ifood_customer_id_idx on public.orders(ifood_customer_id);

-- ============================================================
-- TABELA: order_items
-- ============================================================
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  name text not null,
  quantity integer not null default 1,
  unit_price numeric(10,2) not null default 0
);

create index order_items_order_id_idx on public.order_items(order_id);

-- ============================================================
-- TABELA: order_item_additions (adicionais de cada item)
-- ============================================================
create table public.order_item_additions (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  name text not null,
  quantity integer not null default 1,
  unit_price numeric(10,2) not null default 0
);

create index order_item_additions_item_id_idx on public.order_item_additions(order_item_id);

-- ============================================================
-- TABELA: delivery_history
-- Histórico de entregas concluídas por cada entregador
-- ============================================================
create table public.delivery_history (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id),
  order_id uuid not null references public.orders(id),
  valor_entrega numeric(10,2) not null default 0,
  concluded_at timestamptz not null default now()
);

create index delivery_history_driver_id_idx on public.delivery_history(driver_id);

-- ============================================================
-- TABELA: webhook_events
-- Guarda o ID de cada evento do iFood já processado, pra evitar
-- processar o mesmo evento duas vezes (o iFood pode reenviar)
-- ============================================================
create table public.webhook_events (
  id text primary key,
  received_at timestamptz not null default now()
);

-- ============================================================
-- FUNÇÃO AUXILIAR: is_admin()
-- usada dentro das políticas de RLS abaixo
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- RLS: ativar em todas as tabelas
-- ============================================================
alter table public.profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_additions enable row level security;
alter table public.delivery_history enable row level security;
alter table public.webhook_events enable row level security;

-- ---------- profiles ----------
-- qualquer usuário autenticado pode ver o próprio perfil (pra saber se é admin ou driver)
create policy "ver o proprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

-- admin ve todos os perfis (pra listar entregadores na hora de atribuir pedido)
create policy "admin ve todos os perfis"
  on public.profiles for select
  using (public.is_admin());

-- cadastro público (tela de signup) só pode criar o PRÓPRIO perfil e só como driver
-- isso impede que alguém se cadastre como admin pela tela pública
create policy "signup publico cria perfil de driver"
  on public.profiles for insert
  with check (auth.uid() = id and role = 'driver');

-- ---------- clientes ----------
-- só admin acessa direto (o fluxo de confirmação de entrega usa service_role, que ignora RLS)
create policy "admin acessa clientes"
  on public.clientes for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- orders ----------
-- admin: acesso total (ver, criar, editar, apagar)
create policy "admin acesso total a orders"
  on public.orders for all
  using (public.is_admin())
  with check (public.is_admin());

-- driver: só ve os pedidos atribuídos a ele
create policy "driver ve seus pedidos"
  on public.orders for select
  using (driver_id = auth.uid());

-- Importante: NÃO existe policy de update para o driver.
-- Toda confirmação de entrega passa pela função serverless /api/ifood/verify-delivery,
-- que usa a service_role key (ignora RLS) só depois de validar o código com o iFood.
-- Isso evita que o driver marque uma entrega como concluída sem validação real.

-- ---------- order_items / order_item_additions ----------
-- seguem a regra do pedido pai: admin total, driver só leitura do que é dele
create policy "admin acesso total a order_items"
  on public.order_items for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "driver ve itens dos seus pedidos"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders
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
      select 1 from public.order_items
      join public.orders on orders.id = order_items.order_id
      where order_items.id = order_item_additions.order_item_id
      and orders.driver_id = auth.uid()
    )
  );

-- ---------- delivery_history ----------
create policy "admin ve todo o historico"
  on public.delivery_history for select
  using (public.is_admin());

create policy "driver ve seu proprio historico"
  on public.delivery_history for select
  using (driver_id = auth.uid());

-- webhook_events: nenhuma policy = bloqueado para todo mundo exceto service_role
-- (service_role sempre ignora RLS, então não precisa de policy aqui)

-- ============================================================
-- REALTIME: habilita atualização em tempo real na tabela orders
-- ============================================================
alter publication supabase_realtime add table public.orders;

-- ============================================================
-- FIM DO SCHEMA
-- Próximo passo: criar o usuário admin manualmente (veja README.md)
-- ============================================================
