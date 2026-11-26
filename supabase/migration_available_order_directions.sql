-- Limit coordinates to orders already visible to the authenticated driver.
create or replace function public.get_available_order_directions()
returns table (id uuid, latitude double precision, longitude double precision)
language sql
security definer
stable
set search_path = ''
as $$
  select o.id, o.latitude::double precision, o.longitude::double precision
  from public.orders o
  join public.get_available_delivery_orders() available on available.id = o.id;
$$;

revoke all on function public.get_available_order_directions() from public, anon;
grant execute on function public.get_available_order_directions() to authenticated, service_role;
