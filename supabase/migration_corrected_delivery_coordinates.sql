alter table public.orders
  add column if not exists corrected_latitude numeric,
  add column if not exists corrected_longitude numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_corrected_coordinates_valid' and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_corrected_coordinates_valid check (
        (corrected_latitude is null and corrected_longitude is null)
        or (corrected_latitude between -90 and 90 and corrected_longitude between -180 and 180
            and corrected_latitude is not null and corrected_longitude is not null)
      );
  end if;
end;
$$;
