-- Historical order estimates use the same fields and admin permissions as weekly estimates.
create or replace function public.get_order_settlement_history()
returns table (
  id uuid,
  merchant_id text,
  order_date date,
  date_estimated boolean,
  order_total jsonb,
  payment_pending jsonb,
  benefits_raw jsonb
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if public.is_admin() is distinct from true then
    raise exception 'Apenas administradores podem consultar o financeiro' using errcode = '42501';
  end if;

  return query
  select o.id, o.merchant_id,
    (coalesce((o.subtotal ->> 'createdAt')::timestamptz, o.created_at)
      at time zone 'America/Sao_Paulo')::date,
    o.subtotal ->> 'createdAt' is null,
    o.subtotal -> 'total', o.payment_raw -> 'pending', o.benefits_raw
  from public.orders o
  where o.status = 'entregue'
  order by o.id;
end;
$$;

revoke all on function public.get_order_settlement_history() from public, anon;
grant execute on function public.get_order_settlement_history() to authenticated;
