alter table public.delivery_history
  alter column valor_entrega set default 5;

update public.delivery_history
set valor_entrega = 5
where valor_entrega is distinct from 5;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'delivery_history'
  ) then
    alter publication supabase_realtime add table public.delivery_history;
  end if;
end
$$;
