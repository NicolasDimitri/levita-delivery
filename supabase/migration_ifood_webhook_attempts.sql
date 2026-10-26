create table if not exists public.ifood_webhook_attempts (
  id bigint generated always as identity primary key,
  event_id text,
  order_id text,
  code text,
  outcome text not null check (outcome in ('received', 'processed', 'duplicate', 'failed')),
  error_message text,
  received_at timestamptz not null default now()
);

create index ifood_webhook_attempts_received_at_idx
  on public.ifood_webhook_attempts(received_at);
create index ifood_webhook_attempts_order_id_idx
  on public.ifood_webhook_attempts(order_id);

alter table public.ifood_webhook_attempts enable row level security;
revoke all on public.ifood_webhook_attempts from anon, authenticated;
grant all on public.ifood_webhook_attempts to service_role;
