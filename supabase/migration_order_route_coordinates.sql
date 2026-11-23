alter table public.orders
  add column if not exists route_latitude numeric,
  add column if not exists route_longitude numeric;

alter table public.orders
  add constraint orders_route_coordinates_valid check (
    (route_latitude is null and route_longitude is null)
    or (route_latitude is not null and route_longitude is not null
      and route_latitude between -90 and 90
      and route_longitude between -180 and 180)
  );
