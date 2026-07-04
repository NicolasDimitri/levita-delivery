-- ============================================================
-- MIGRAÇÃO CONSOLIDADA DE PERMISSÕES
-- Corrije todos os grants e policies que faltavam.
-- Seguro rodar mais de uma vez (usa IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- Garante que a função is_admin existe antes de qualquer policy a usar
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ── GRANTS base ──────────────────────────────────────────────────────────
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- profiles
grant select, insert on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- clientes
grant select on public.clientes to authenticated;
grant all on public.clientes to service_role;

-- orders (update necessário pra admin atribuir entregador pelo frontend)
grant select, update on public.orders to authenticated;
grant all on public.orders to service_role;

-- order_items / order_item_additions
grant select on public.order_items to authenticated;
grant select on public.order_item_additions to authenticated;
grant all on public.order_items to service_role;
grant all on public.order_item_additions to service_role;

-- delivery_history
grant select on public.delivery_history to authenticated;
grant all on public.delivery_history to service_role;

-- withdrawals (admin insere pelo frontend, driver só lê)
grant select, insert on public.withdrawals to authenticated;
grant all on public.withdrawals to service_role;

-- webhook_events
grant all on public.webhook_events to service_role;

-- expenses
grant select, insert, update, delete on public.expenses to authenticated;
grant all on public.expenses to service_role;

-- payments
grant select, insert, update, delete on public.payments to authenticated;
grant all on public.payments to service_role;

-- ── RLS: recria policies das tabelas financeiras com segurança ────────────
-- (drop if exists antes de recriar evita erro de duplicata)

drop policy if exists "admin acesso total a expenses"  on public.expenses;
drop policy if exists "admin acesso total a payments"  on public.payments;
drop policy if exists "admin acesso total a withdrawals" on public.withdrawals;
drop policy if exists "driver ve seus proprios saques" on public.withdrawals;

create policy "admin acesso total a expenses"
  on public.expenses for all
  using (public.is_admin()) with check (public.is_admin());

create policy "admin acesso total a payments"
  on public.payments for all
  using (public.is_admin()) with check (public.is_admin());

create policy "admin acesso total a withdrawals"
  on public.withdrawals for all
  using (public.is_admin()) with check (public.is_admin());

create policy "driver ve seus proprios saques"
  on public.withdrawals for select
  using (driver_id = auth.uid());
