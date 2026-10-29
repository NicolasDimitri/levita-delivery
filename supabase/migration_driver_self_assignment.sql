-- Enable driver self-assignment in the development/preview Supabase project.
-- Drivers can claim available orders atomically and dispatch only their own
-- ready orders. Run this migration once in the development project's SQL Editor.

alter table public.orders
  add column if not exists ifood_dispatching_at timestamptz,
  add column if not exists route_address text;

drop policy if exists "driver ve pedidos disponiveis" on public.orders;
drop policy if exists "driver ve itens de pedidos disponiveis" on public.order_items;

create or replace function public.get_available_delivery_orders()
returns table (
  id uuid,
  display_id text,
  customer_name text,
  street text,
  street_number text,
  neighborhood text,
  route_address text,
  status text,
  order_items jsonb
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    o.id,
    o.display_id,
    o.customer_name,
    o.street,
    o.street_number,
    o.neighborhood,
    o.route_address,
    o.status,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', oi.id, 'name', oi.name, 'quantity', oi.quantity)
          order by oi.id
        )
        from public.order_items as oi
        where oi.order_id = o.id
      ),
      '[]'::jsonb
    )
  from public.orders as o
  where exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'driver'
  )
    and o.driver_id is null
    and o.ifood_dispatched_at is null
    and o.ifood_dispatching_at is null
    and o.status in ('recebido', 'em_preparo', 'pronto')
  order by o.created_at asc;
$$;

revoke all on function public.get_available_delivery_orders() from public, anon;
grant execute on function public.get_available_delivery_orders() to authenticated, service_role;

create or replace function public.accept_delivery_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := auth.uid();
  v_order_id uuid;
  v_active_count integer;
begin
  if v_driver_id is null then
    raise exception using errcode = 'P0001', message = 'Faça login para aceitar um pedido.';
  end if;

  perform 1
  from public.profiles
  where id = v_driver_id and role = 'driver'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Somente entregadores podem aceitar pedidos.';
  end if;

  select count(*)
    into v_active_count
  from public.orders
  where driver_id = v_driver_id
    and status not in ('entregue', 'cancelado');

  if v_active_count >= 3 then
    raise exception using errcode = 'P0001', message = 'Você já atingiu o limite de 3 pedidos ativos.';
  end if;

  update public.orders
  set driver_id = v_driver_id,
      assigned_at = clock_timestamp()
  where id = p_order_id
    and driver_id is null
    and status in ('recebido', 'em_preparo', 'pronto')
  and ifood_dispatched_at is null
  and ifood_dispatching_at is null
  returning id into v_order_id;

  if v_order_id is null then
    raise exception using errcode = 'P0001', message = 'Este pedido já foi aceito ou não está mais disponível.';
  end if;

  return v_order_id;
end;
$$;

revoke all on function public.accept_delivery_order(uuid) from public, anon;
grant execute on function public.accept_delivery_order(uuid) to authenticated, service_role;

create or replace function public.admin_reassign_delivery_order(
  p_order_id uuid,
  p_driver_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_active_count integer;
begin
  perform 1
  from public.profiles
  where id = p_driver_id and role = 'driver'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Entregador inválido.';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Pedido não encontrado.';
  end if;

  if v_order.status in ('entregue', 'cancelado') then
    raise exception using errcode = 'P0001', message = 'Não é possível trocar o entregador de um pedido finalizado.';
  end if;

  if v_order.status = 'pronto' and v_order.ifood_dispatching_at is not null then
    raise exception using errcode = 'P0001', message = 'Aguarde a confirmação do despacho antes de trocar o entregador.';
  end if;

  if v_order.driver_id is distinct from p_driver_id then
    select count(*)
      into v_active_count
    from public.orders
    where driver_id = p_driver_id
      and status not in ('entregue', 'cancelado')
      and id <> p_order_id;

    if v_active_count >= 3 then
      raise exception using errcode = 'P0001', message = 'Esse entregador já atingiu o limite de 3 pedidos ativos.';
    end if;
  end if;

  update public.orders
  set driver_id = p_driver_id,
      assigned_at = clock_timestamp()
  where id = p_order_id;

  return p_order_id;
end;
$$;

revoke all on function public.admin_reassign_delivery_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_reassign_delivery_order(uuid, uuid) to service_role;

create or replace function public.begin_driver_order_dispatch(
  p_order_id uuid,
  p_driver_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_dispatching_at timestamptz;
begin
  perform 1
  from public.profiles
  where id = p_driver_id and role = 'driver';
  if not found then
    raise exception using errcode = 'P0001', message = 'Entregador inválido.';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Pedido não encontrado.';
  end if;

  if v_order.driver_id is distinct from p_driver_id then
    raise exception using errcode = 'P0001', message = 'Este pedido não está atribuído a você.';
  end if;

  if v_order.status <> 'pronto' then
    raise exception using errcode = 'P0001', message = 'O pedido ainda não está pronto.';
  end if;

  if v_order.ifood_dispatched_at is not null then
    return jsonb_build_object('status', 'already_requested');
  end if;

  if v_order.ifood_dispatching_at is not null then
    return jsonb_build_object('status', 'in_progress');
  end if;

  v_dispatching_at := clock_timestamp();
  update public.orders
  set ifood_dispatching_at = v_dispatching_at
  where id = p_order_id;

  return jsonb_build_object('status', 'started', 'token', v_dispatching_at);
end;
$$;

revoke all on function public.begin_driver_order_dispatch(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_driver_order_dispatch(uuid, uuid) to service_role;
