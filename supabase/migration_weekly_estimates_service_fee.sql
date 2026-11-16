-- Include service-fee details from the stored Order API snapshot in estimates.
create or replace function public.get_weekly_order_estimates(p_start date, p_end date)
returns table (
  id uuid,
  display_id text,
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
  if p_start is null or p_end is null or p_end <= p_start or p_end - p_start > 7 then
    raise exception 'Período inválido para consulta de pedidos' using errcode = '22023';
  end if;

  return query
  select o.id, o.display_id, o.merchant_id,
    (coalesce((o.subtotal ->> 'createdAt')::timestamptz, o.created_at)
      at time zone 'America/Sao_Paulo')::date,
    o.subtotal ->> 'createdAt' is null,
    case
      when jsonb_typeof(o.subtotal -> 'additionalFees') = 'array' then
        jsonb_set(
          o.subtotal -> 'total',
          '{serviceFees}',
          coalesce((
            select jsonb_agg(fee)
            from jsonb_array_elements(o.subtotal -> 'additionalFees') as fees(fee)
            where lower(btrim(fee ->> 'description')) = 'taxa de serviço'
          ), '[]'::jsonb),
          true
        )
      else jsonb_set(o.subtotal -> 'total', '{serviceFees}', 'null'::jsonb, true)
    end,
    o.payment_raw -> 'pending', o.benefits_raw
  from public.orders o
  where o.status = 'entregue'
    and (coalesce((o.subtotal ->> 'createdAt')::timestamptz, o.created_at)
      at time zone 'America/Sao_Paulo')::date >= p_start
    and (coalesce((o.subtotal ->> 'createdAt')::timestamptz, o.created_at)
      at time zone 'America/Sao_Paulo')::date < p_end
  order by o.id;
end;
$$;

revoke all on function public.get_weekly_order_estimates(date, date) from public, anon;
grant execute on function public.get_weekly_order_estimates(date, date) to authenticated;
