begin;
select plan(19);

insert into public.categories (id, name, active) values
  ('20000000-0000-0000-0000-000000000001', 'Teste pedido', true),
  ('20000000-0000-0000-0000-000000000002', 'Teste pedido inativa', false);

insert into public.products (id, category_id, name, base_price, shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm, active) values
  ('20000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000001', 'Produto A', 10.00, 1, 1, 1, 1, true),
  ('20000000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-000000000001', 'Produto B', 25.50, 1, 1, 1, 1, true),
  ('20000000-0000-0000-0000-0000000000b3', '20000000-0000-0000-0000-000000000001', 'Produto inativo', 5.00, 1, 1, 1, 1, false),
  ('20000000-0000-0000-0000-0000000000b4', '20000000-0000-0000-0000-000000000002', 'Produto em categoria inativa', 5.00, 1, 1, 1, 1, true);

insert into public.customers (id, phone) values
  ('20000000-0000-0000-0000-0000000000c1', '5511977770001'),
  ('20000000-0000-0000-0000-0000000000c2', '5511977770002');

-- Caminho feliz; itens repetidos são somados
create temporary table created as
select public.create_order_with_items(
  '20000000-0000-0000-0000-0000000000c1',
  '[{"product_id": "20000000-0000-0000-0000-0000000000b1", "quantity": 2},
    {"product_id": "20000000-0000-0000-0000-0000000000b2", "quantity": 1},
    {"product_id": "20000000-0000-0000-0000-0000000000b1", "quantity": 1}]',
  'key-1'
) as order_id;

select is((select count(*)::int from public.orders where idempotency_key = 'key-1'), 1, 'pedido criado');
select is((select count(*)::int from public.order_items where order_id = (select order_id from created)), 2, 'um item por produto');
select is(
  (select quantity from public.order_items where order_id = (select order_id from created) and product_id = '20000000-0000-0000-0000-0000000000b1'),
  3, 'quantidades do mesmo produto somadas'
);
select is((select subtotal from public.orders where id = (select order_id from created)), 55.50::numeric, 'subtotal calculado com preços do banco');
select is((select status from public.orders where id = (select order_id from created))::text, 'received', 'status inicial received');
select is(
  (select count(*)::int from public.order_status_history
   where order_id = (select order_id from created) and previous_status is null and new_status = 'received'),
  1, 'status inicial registrado no histórico'
);

-- Idempotência
select is(
  public.create_order_with_items('20000000-0000-0000-0000-0000000000c1',
    '[{"product_id": "20000000-0000-0000-0000-0000000000b2", "quantity": 9}]', 'key-1'),
  (select order_id from created),
  'mesma chave devolve o pedido existente'
);
select is((select count(*)::int from public.orders where idempotency_key = 'key-1'), 1, 'mesma chave não cria dois pedidos');
select throws_ok(
  $$select public.create_order_with_items('20000000-0000-0000-0000-0000000000c2',
      '[{"product_id": "20000000-0000-0000-0000-0000000000b1", "quantity": 1}]', 'key-1')$$,
  'P0001', 'idempotency_key_conflict', 'chave de outro cliente é rejeitada'
);

-- Atomicidade e validação: nenhum pedido criado quando um item é inválido
select throws_ok(
  $$select public.create_order_with_items('20000000-0000-0000-0000-0000000000c1',
      '[{"product_id": "20000000-0000-0000-0000-0000000000b1", "quantity": 1},
        {"product_id": "20000000-0000-0000-0000-0000000000b3", "quantity": 1}]', 'key-2')$$,
  'P0001', 'product_unavailable', 'produto inativo é rejeitado'
);
select throws_ok(
  $$select public.create_order_with_items('20000000-0000-0000-0000-0000000000c1',
      '[{"product_id": "20000000-0000-0000-0000-0000000000b4", "quantity": 1}]', 'key-3')$$,
  'P0001', 'product_unavailable', 'produto de categoria inativa é rejeitado'
);
select throws_ok(
  $$select public.create_order_with_items('20000000-0000-0000-0000-0000000000c1',
      '[{"product_id": "20000000-0000-0000-0000-0000000000b1", "quantity": 0}]', 'key-4')$$,
  'P0001', 'invalid_quantity', 'quantidade zero é rejeitada'
);
select throws_ok(
  $$select public.create_order_with_items('20000000-0000-0000-0000-0000000000c1',
      '[{"product_id": "20000000-0000-0000-0000-0000000000b1", "quantity": 1.5}]', 'key-5')$$,
  'P0001', 'invalid_quantity', 'quantidade fracionada é rejeitada'
);
select throws_ok(
  $$select public.create_order_with_items('20000000-0000-0000-0000-0000000000c1',
      '[{"product_id": "20000000-0000-0000-0000-0000000000b1"}]', 'key-7')$$,
  'P0001', 'invalid_quantity', 'item sem quantidade é rejeitado'
);
select throws_ok(
  $$select public.create_order_with_items('20000000-0000-0000-0000-0000000000c1',
      '[{"quantity": 1}]', 'key-8')$$,
  'P0001', 'invalid_items', 'item sem produto é rejeitado'
);
select throws_ok(
  $$select public.create_order_with_items('20000000-0000-0000-0000-0000000000c1', '[]', 'key-6')$$,
  'P0001', 'invalid_items', 'carrinho vazio é rejeitado'
);
select is(
  (select count(*)::int from public.orders where customer_id = '20000000-0000-0000-0000-0000000000c1'),
  1, 'chamadas com falha não deixaram pedido parcial'
);

-- Histórico de preço e de status
update public.products set base_price = 99.99, name = 'Produto A renomeado' where id = '20000000-0000-0000-0000-0000000000b1';
select is(
  (select unit_price_snapshot from public.order_items
   where order_id = (select order_id from created) and product_id = '20000000-0000-0000-0000-0000000000b1'),
  10.00::numeric, 'alterar o preço do produto não altera pedidos antigos'
);

update public.orders set status = 'in_review' where id = (select order_id from created);
select is(
  (select count(*)::int from public.order_status_history
   where order_id = (select order_id from created) and previous_status = 'received' and new_status = 'in_review'),
  1, 'mudança de status registrada no histórico'
);

select * from finish();
rollback;
