-- Base de estoque: execute uma vez no SQL Editor de um projeto existente.
-- Quantidades sao sempre expressas na unidade base do item (g, ml ou un).
begin;

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  kind text not null check (kind in ('raw', 'prepared')),
  unit text not null check (unit in ('g', 'ml', 'un')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Uma ficha tecnica descreve o rendimento esperado; o preparo registra o real.
create table public.inventory_recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  output_item_id uuid not null references public.inventory_items(id),
  expected_output numeric not null check (expected_output > 0 and expected_output < 1000000000000 and scale(expected_output) <= 3),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.inventory_recipe_ingredients (
  recipe_id uuid not null references public.inventory_recipes(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  quantity numeric not null check (quantity > 0 and quantity < 1000000000000 and scale(quantity) <= 3),
  primary key (recipe_id, item_id)
);

create table public.inventory_balances (
  location_id uuid not null references public.inventory_locations(id),
  item_id uuid not null references public.inventory_items(id),
  quantity numeric not null default 0 check (quantity >= 0 and quantity < 1000000000000 and scale(quantity) <= 3),
  primary key (location_id, item_id)
);

create table public.inventory_operations (
  id uuid primary key,
  kind text not null check (kind in ('entry', 'loss', 'adjustment', 'transfer', 'production')),
  actor_id uuid not null references public.profiles(id),
  recipe_id uuid references public.inventory_recipes(id),
  note text,
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  operation_id uuid not null references public.inventory_operations(id),
  location_id uuid not null references public.inventory_locations(id),
  item_id uuid not null references public.inventory_items(id),
  quantity_change numeric not null check (quantity_change <> 0 and abs(quantity_change) < 1000000000000 and scale(quantity_change) <= 3),
  created_at timestamptz not null default now()
);

create index inventory_movements_location_item_idx
  on public.inventory_movements(location_id, item_id, id);
create index inventory_movements_operation_idx on public.inventory_movements(operation_id);

-- Unidade e tipo nao podem ser alterados apos o cadastro: invalidariam o historico.
create function public.inventory_item_identity_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.unit is distinct from old.unit or new.kind is distinct from old.kind then
    raise exception 'Unidade e tipo do item nao podem ser alterados; crie outro item.';
  end if;
  return new;
end;
$$;
create trigger inventory_item_identity_immutable
  before update on public.inventory_items
  for each row execute function public.inventory_item_identity_immutable();

-- O item final deve ser preparado; uma receita nao pode consumir a si mesma.
create function public.inventory_validate_recipe()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_output uuid;
begin
  if tg_table_name = 'inventory_recipes' then
    if not exists (select 1 from public.inventory_items where id = new.output_item_id and kind = 'prepared') then
      raise exception 'O resultado da receita deve ser um item preparado.';
    end if;
    if exists (select 1 from public.inventory_recipe_ingredients where recipe_id = new.id and item_id = new.output_item_id) then
      raise exception 'O resultado nao pode ser ingrediente da propria receita.';
    end if;
  else
    select output_item_id into v_output
      from public.inventory_recipes where id = new.recipe_id for update;
    if v_output = new.item_id then
      raise exception 'O resultado nao pode ser ingrediente da propria receita.';
    end if;
  end if;
  return new;
end;
$$;
create trigger inventory_validate_recipe_output
  before insert or update on public.inventory_recipes
  for each row execute function public.inventory_validate_recipe();
create trigger inventory_validate_recipe_ingredient
  before insert or update on public.inventory_recipe_ingredients
  for each row execute function public.inventory_validate_recipe();

alter table public.inventory_locations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_recipes enable row level security;
alter table public.inventory_recipe_ingredients enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_operations enable row level security;
alter table public.inventory_movements enable row level security;

create policy inventory_locations_admin on public.inventory_locations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy inventory_items_admin on public.inventory_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy inventory_recipes_admin on public.inventory_recipes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy inventory_recipe_ingredients_admin on public.inventory_recipe_ingredients for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy inventory_balances_read on public.inventory_balances for select to authenticated using (public.is_admin());
create policy inventory_operations_read on public.inventory_operations for select to authenticated using (public.is_admin());
create policy inventory_movements_read on public.inventory_movements for select to authenticated using (public.is_admin());

revoke all on public.inventory_locations, public.inventory_items, public.inventory_recipes, public.inventory_recipe_ingredients,
  public.inventory_balances, public.inventory_operations, public.inventory_movements from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.inventory_locations, public.inventory_items, public.inventory_recipes, public.inventory_recipe_ingredients to authenticated;
grant select on public.inventory_balances, public.inventory_operations, public.inventory_movements to authenticated;
grant select on public.inventory_locations, public.inventory_items, public.inventory_recipes, public.inventory_recipe_ingredients,
  public.inventory_balances, public.inventory_operations, public.inventory_movements to service_role;

-- Apenas funcoes internas alteram saldos e movimentos; o bloqueio evita saldo negativo concorrente.
create function public.inventory_lock_balance(p_location uuid, p_item uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.inventory_locations where id = p_location and active) then
    raise exception 'Local de estoque inexistente ou inativo.';
  end if;
  if not exists (select 1 from public.inventory_items where id = p_item and active) then
    raise exception 'Item de estoque inexistente ou inativo.';
  end if;
  insert into public.inventory_balances(location_id, item_id)
    values (p_location, p_item) on conflict do nothing;
  perform 1 from public.inventory_balances
    where location_id = p_location and item_id = p_item for update;
end;
$$;

create function public.inventory_apply_movement(p_operation uuid, p_location uuid, p_item uuid, p_change numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_change is null or p_change = 0 or abs(p_change) >= 1000000000000 or scale(p_change) > 3 then
    raise exception 'Quantidade invalida: use ate tres casas decimais.';
  end if;
  update public.inventory_balances
    set quantity = quantity + p_change
    where location_id = p_location and item_id = p_item
      and quantity + p_change >= 0 and quantity + p_change < 1000000000000;
  if not found then
    raise exception 'Saldo insuficiente ou quantidade acima do limite para o item %.', p_item;
  end if;
  insert into public.inventory_movements(operation_id, location_id, item_id, quantity_change)
    values (p_operation, p_location, p_item, p_change);
end;
$$;

-- O UUID da operacao e fornecido pelo cliente: reenvios duplicados sao recusados.
create function public.inventory_record_movement(
  p_operation uuid, p_location uuid, p_item uuid, p_kind text, p_quantity numeric, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_change numeric;
begin
  if public.is_admin() is distinct from true then raise exception 'Apenas administradores podem movimentar estoque.'; end if;
  if p_operation is null or p_kind is null or p_kind not in ('entry', 'loss', 'adjustment')
     or p_quantity is null or p_quantity = 0 or abs(p_quantity) >= 1000000000000 or scale(p_quantity) > 3
     or (p_kind in ('entry', 'loss') and p_quantity < 0)
     or (p_kind in ('loss', 'adjustment') and nullif(btrim(p_note), '') is null) then
    raise exception 'Operacao, quantidade ou justificativa invalida.';
  end if;
  v_change := case when p_kind = 'loss' then -p_quantity else p_quantity end;
  insert into public.inventory_operations(id, kind, actor_id, note) values (p_operation, p_kind, auth.uid(), p_note);
  perform public.inventory_lock_balance(p_location, p_item);
  perform public.inventory_apply_movement(p_operation, p_location, p_item, v_change);
  return p_operation;
end;
$$;

create function public.inventory_transfer(
  p_operation uuid, p_source uuid, p_destination uuid, p_item uuid, p_quantity numeric, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_location uuid;
begin
  if public.is_admin() is distinct from true then raise exception 'Apenas administradores podem movimentar estoque.'; end if;
  if p_operation is null or p_source is null or p_destination is null or p_source = p_destination
     or p_quantity is null or p_quantity <= 0 or p_quantity >= 1000000000000 or scale(p_quantity) > 3 then
    raise exception 'Transferencia ou quantidade invalida.';
  end if;
  insert into public.inventory_operations(id, kind, actor_id, note) values (p_operation, 'transfer', auth.uid(), p_note);
  for v_location in select location_id from (values (p_source), (p_destination)) as locations(location_id) order by location_id loop
    perform public.inventory_lock_balance(v_location, p_item);
  end loop;
  perform public.inventory_apply_movement(p_operation, p_source, p_item, -p_quantity);
  perform public.inventory_apply_movement(p_operation, p_destination, p_item, p_quantity);
  return p_operation;
end;
$$;

-- Inputs reais sao informados explicitamente: [{"item_id":"uuid","quantity":1000}].
create function public.inventory_produce(
  p_operation uuid, p_location uuid, p_recipe uuid, p_output_quantity numeric, p_inputs jsonb, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_output uuid;
  v_input record;
  v_item uuid;
begin
  if public.is_admin() is distinct from true then raise exception 'Apenas administradores podem movimentar estoque.'; end if;
  if p_operation is null or p_output_quantity is null or p_output_quantity <= 0
     or p_output_quantity >= 1000000000000 or scale(p_output_quantity) > 3
     or jsonb_typeof(p_inputs) is distinct from 'array' then
    raise exception 'Preparo ou quantidade de saida invalida.';
  end if;
  if jsonb_array_length(p_inputs) = 0 then raise exception 'Informe os ingredientes utilizados.'; end if;
  select output_item_id into v_output from public.inventory_recipes where id = p_recipe and active for share;
  if v_output is null then raise exception 'Receita inexistente ou inativa.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_inputs) e
    where jsonb_typeof(e) is distinct from 'object'
      or jsonb_typeof(e->'item_id') is distinct from 'string'
      or jsonb_typeof(e->'quantity') is distinct from 'number'
  ) then raise exception 'Ingredientes devem ter item_id e quantity validos.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_inputs) as x(item_id uuid, quantity numeric)
    where item_id is null or item_id = v_output or quantity is null or quantity <= 0
      or quantity >= 1000000000000 or scale(quantity) > 3
  ) then raise exception 'Ingrediente ou quantidade invalida.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_inputs) as x(item_id uuid, quantity numeric)
    group by item_id having count(*) > 1
  ) then raise exception 'Nao repita ingredientes no mesmo preparo.'; end if;
  insert into public.inventory_operations(id, kind, actor_id, recipe_id, note)
    values (p_operation, 'production', auth.uid(), p_recipe, p_note);
  for v_item in
    select item_id from (
      select item_id from jsonb_to_recordset(p_inputs) as x(item_id uuid, quantity numeric)
      union select v_output
    ) items order by item_id
  loop
    perform public.inventory_lock_balance(p_location, v_item);
  end loop;
  for v_input in select * from jsonb_to_recordset(p_inputs) as x(item_id uuid, quantity numeric) order by item_id loop
    perform public.inventory_apply_movement(p_operation, p_location, v_input.item_id, -v_input.quantity);
  end loop;
  perform public.inventory_apply_movement(p_operation, p_location, v_output, p_output_quantity);
  return p_operation;
end;
$$;

revoke all on function public.inventory_lock_balance(uuid, uuid) from public, anon, authenticated;
revoke all on function public.inventory_apply_movement(uuid, uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.inventory_record_movement(uuid, uuid, uuid, text, numeric, text) from public, anon;
revoke all on function public.inventory_transfer(uuid, uuid, uuid, uuid, numeric, text) from public, anon;
revoke all on function public.inventory_produce(uuid, uuid, uuid, numeric, jsonb, text) from public, anon;
revoke all on function public.inventory_lock_balance(uuid, uuid), public.inventory_apply_movement(uuid, uuid, uuid, numeric),
  public.inventory_record_movement(uuid, uuid, uuid, text, numeric, text),
  public.inventory_transfer(uuid, uuid, uuid, uuid, numeric, text),
  public.inventory_produce(uuid, uuid, uuid, numeric, jsonb, text) from service_role;
grant execute on function public.inventory_record_movement(uuid, uuid, uuid, text, numeric, text) to authenticated;
grant execute on function public.inventory_transfer(uuid, uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.inventory_produce(uuid, uuid, uuid, numeric, jsonb, text) to authenticated;

commit;
