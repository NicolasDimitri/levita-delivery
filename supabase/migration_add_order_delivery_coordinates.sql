alter table public.orders
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;
