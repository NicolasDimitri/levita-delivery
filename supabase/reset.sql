-- ============================================================
-- ⚠️  RESET COMPLETO DO BANCO — APAGA TUDO IRREVERSIVELMENTE
-- Rode só se quiser começar do zero. Não há desfazer.
-- ============================================================

-- desabilita RLS temporariamente pra não travar o drop
set session_replication_role = replica;

-- apaga na ordem inversa das dependências (filhos antes dos pais)
drop table if exists public.webhook_events         cascade;
drop table if exists public.order_item_additions   cascade;
drop table if exists public.order_items            cascade;
drop table if exists public.delivery_history       cascade;
drop table if exists public.withdrawals            cascade;
drop table if exists public.orders                 cascade;
drop table if exists public.clientes               cascade;
drop table if exists public.expenses               cascade;
drop table if exists public.payments               cascade;
drop table if exists public.profiles               cascade;

-- apaga funções auxiliares
drop function if exists public.is_admin() cascade;

-- reativa o comportamento normal
set session_replication_role = default;

-- apaga também os usuários de auth (deixa o banco zerado de verdade)
-- ⚠️  descomente as linhas abaixo apenas se quiser apagar OS LOGINS também:
-- delete from auth.users;
