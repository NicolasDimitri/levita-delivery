-- Store the iFood order subtotal separately from the total amount.
alter table public.orders
  add column if not exists subtotal numeric(10,2);
