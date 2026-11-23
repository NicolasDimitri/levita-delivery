-- Historical values are preserved. Resolve duplicate order_id rows before applying.
create unique index if not exists delivery_history_order_id_unique
  on public.delivery_history(order_id);

alter table public.delivery_history
  alter column valor_entrega drop not null,
  alter column valor_entrega drop default,
  add column if not exists route_distance_meters numeric,
  add column if not exists route_error text;
