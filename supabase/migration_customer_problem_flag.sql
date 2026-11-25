alter table public.clientes
  add column if not exists problematic boolean not null default false,
  add column if not exists motivo_problematico text;

grant select, update on public.clientes to authenticated;
