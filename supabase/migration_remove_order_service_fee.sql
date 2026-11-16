-- Remove the service fee column; it is not used by the order settlement estimate.
alter table public.orders
  drop column if exists service_fee;
