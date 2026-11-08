-- Persist iFood order discounts/benefits for newly received orders.
alter table public.orders
  add column if not exists benefits_raw jsonb not null default '[]'::jsonb,
  add column if not exists benefits_value numeric(10,2) not null default 0;
