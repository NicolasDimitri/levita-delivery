-- Execute em banco de teste, depois do schema e de migration_inventory.sql.
-- Todos os dados de teste sao revertidos ao final.
begin;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');
insert into public.profiles(id, role, name) values
  ('00000000-0000-0000-0000-000000000001', 'admin', 'Teste estoque'),
  ('00000000-0000-0000-0000-000000000002', 'driver', 'Teste entregador');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

insert into public.inventory_locations(id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Cozinha teste'),
  ('10000000-0000-0000-0000-000000000002', 'Loja teste');
insert into public.inventory_items(id, name, kind, unit) values
  ('20000000-0000-0000-0000-000000000001', 'Carne crua teste', 'raw', 'g'),
  ('20000000-0000-0000-0000-000000000002', 'Carne cozida teste', 'prepared', 'g'),
  ('20000000-0000-0000-0000-000000000003', 'Sal teste', 'raw', 'g'),
  ('20000000-0000-0000-0000-000000000004', 'Arroz cru teste', 'raw', 'g'),
  ('20000000-0000-0000-0000-000000000005', 'Arroz cozido teste', 'prepared', 'g');
insert into public.inventory_recipes(id, name, output_item_id, expected_output) values
  ('30000000-0000-0000-0000-000000000001', 'Carne cozida teste',
   '20000000-0000-0000-0000-000000000002', 700),
  ('30000000-0000-0000-0000-000000000002', 'Arroz cozido teste',
   '20000000-0000-0000-0000-000000000005', 2000);
insert into public.inventory_recipe_ingredients(recipe_id, item_id, quantity) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1000),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 10),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', 1000);

select public.inventory_record_movement('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'entry', 2000, null);
select public.inventory_record_movement('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'entry', 20, null);
select public.inventory_produce(
  '40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001', 700,
  '[{"item_id":"20000000-0000-0000-0000-000000000001","quantity":1000},{"item_id":"20000000-0000-0000-0000-000000000003","quantity":10}]', null
);
select public.inventory_transfer('40000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002', 250, null);
select public.inventory_record_movement('40000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
  'loss', 50, 'Desperdicio');
select public.inventory_record_movement('40000000-0000-0000-0000-000000000009',
  '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'entry', 1000, null);
select public.inventory_produce('40000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 2000,
  '[{"item_id":"20000000-0000-0000-0000-000000000004","quantity":1000}]', null);

do $$
declare v_failed boolean;
begin
  if (select quantity from public.inventory_balances where location_id = '10000000-0000-0000-0000-000000000001' and item_id = '20000000-0000-0000-0000-000000000001') <> 1000
    or (select quantity from public.inventory_balances where location_id = '10000000-0000-0000-0000-000000000001' and item_id = '20000000-0000-0000-0000-000000000002') <> 450
    or (select quantity from public.inventory_balances where location_id = '10000000-0000-0000-0000-000000000002' and item_id = '20000000-0000-0000-0000-000000000002') <> 200
    or (select quantity from public.inventory_balances where location_id = '10000000-0000-0000-0000-000000000001' and item_id = '20000000-0000-0000-0000-000000000005') <> 2000
    or (select count(*) from public.inventory_movements where operation_id = '40000000-0000-0000-0000-000000000003') <> 3 then
    raise exception 'Saldos ou movimentacoes incorretos.';
  end if;

  v_failed := false;
  begin
    perform public.inventory_produce('40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001', 700,
      '[{"item_id":"20000000-0000-0000-0000-000000000001","quantity":1000},{"item_id":"20000000-0000-0000-0000-000000000003","quantity":100}]', null);
  exception when others then v_failed := true; end;
  if not v_failed or exists (select 1 from public.inventory_operations where id = '40000000-0000-0000-0000-000000000006')
    or (select quantity from public.inventory_balances where location_id = '10000000-0000-0000-0000-000000000001' and item_id = '20000000-0000-0000-0000-000000000001') <> 1000 then
    raise exception 'Preparo insuficiente deve ser revertido integralmente.';
  end if;

  v_failed := false;
  begin
    perform public.inventory_transfer('40000000-0000-0000-0000-000000000007',
      '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002', 201, null);
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'Transferencia sem saldo foi aceita.'; end if;

  v_failed := false;
  begin
    perform public.inventory_record_movement('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'entry', 2000, null);
  exception when unique_violation then v_failed := true; end;
  if not v_failed then raise exception 'Operacao duplicada foi aceita.'; end if;

  v_failed := false;
  begin
    perform public.inventory_produce('40000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001', 1,
      '[{"item_id":"20000000-0000-0000-0000-000000000001","quantity":1},{"item_id":"20000000-0000-0000-0000-000000000001","quantity":1}]', null);
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'Ingredientes duplicados foram aceitos.'; end if;

  v_failed := false;
  begin
    perform public.inventory_record_movement('40000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'adjustment', -1, null);
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'Ajuste sem justificativa foi aceito.'; end if;

  v_failed := false;
  begin
    update public.inventory_items set unit = 'ml' where id = '20000000-0000-0000-0000-000000000001';
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'Unidade de item foi alterada.'; end if;

  v_failed := false;
  begin
    update public.inventory_balances set quantity = 9999;
  exception when insufficient_privilege then v_failed := true; end;
  if not v_failed then raise exception 'Alteracao direta de saldo foi aceita.'; end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
  if exists (select 1 from public.inventory_balances) then raise exception 'Entregador pode ver saldos.'; end if;
  v_failed := false;
  begin
    perform public.inventory_record_movement('40000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'entry', 1, null);
  exception when others then v_failed := true; end;
  if not v_failed then raise exception 'Entregador movimentou estoque.'; end if;
end;
$$;

rollback;
