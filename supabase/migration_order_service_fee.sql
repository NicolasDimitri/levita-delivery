-- Store the iFood service fee returned with order details.
alter table public.orders
  add column if not exists service_fee numeric(10,2);
