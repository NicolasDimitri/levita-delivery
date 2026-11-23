begin;

create table public.driver_balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id),
  amount numeric(10,2) not null check (amount <> 0),
  reason text not null check (length(trim(reason)) between 1 and 300),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create index driver_balance_adjustments_driver_id_idx
  on public.driver_balance_adjustments(driver_id);

alter table public.driver_balance_adjustments enable row level security;

create policy "admin ve ajustes de saldo"
  on public.driver_balance_adjustments for select
  using (public.is_admin());

create policy "driver ve seus ajustes de saldo"
  on public.driver_balance_adjustments for select
  using (driver_id = auth.uid());

create policy "admin registra ajustes de saldo"
  on public.driver_balance_adjustments for insert
  with check (
    public.is_admin()
    and created_by = auth.uid()
    and exists (
      select 1 from public.profiles
      where profiles.id = driver_id and profiles.role = 'driver'
    )
  );

grant select, insert on public.driver_balance_adjustments to authenticated;
grant all on public.driver_balance_adjustments to service_role;

alter publication supabase_realtime add table public.driver_balance_adjustments;

commit;
