-- Create a driver profile when a new Supabase Auth user signs up.
-- Required when email confirmation is enabled, because signup then has no
-- authenticated session to insert into public.profiles from the client.

create or replace function public.create_driver_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'driver_signup' is distinct from 'true' then
    return new;
  end if;

  insert into public.profiles (id, role, name, phone)
  values (
    new.id,
    'driver',
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Entregador'
    ),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_driver_profile_after_signup on auth.users;
create trigger create_driver_profile_after_signup
  after insert on auth.users
  for each row
  execute function public.create_driver_profile_for_new_user();
