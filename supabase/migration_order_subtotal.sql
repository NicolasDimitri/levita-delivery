-- Store the complete iFood order.total object in this column for inspection.
alter table public.orders
  add column if not exists subtotal jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'subtotal'
      and data_type <> 'jsonb'
  ) then
    alter table public.orders
      alter column subtotal type jsonb using to_jsonb(subtotal);
  end if;
end
$$;
