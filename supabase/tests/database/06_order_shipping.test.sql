begin;
select plan(12);

insert into public.categories (id, name, active) values
  ('60000000-0000-0000-0000-000000000001', 'Teste frete', true);

insert into public.products (id, category_id, name, base_price, shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm, active) values
  ('60000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-000000000001', 'Produto frete', 40.00, 1, 1, 1, 1, true);

insert into public.customers (id, phone) values
  ('60000000-0000-0000-0000-0000000000c1', '5511966660001'),
  ('60000000-0000-0000-0000-0000000000c2', '5511966660002');

insert into public.conversations (id, customer_id, current_state) values
  ('60000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000c1', 'SHIPPING_SELECTION'),
  ('60000000-0000-0000-0000-0000000000a2', '60000000-0000-0000-0000-0000000000c2', 'SHIPPING_SELECTION');

insert into public.shipping_quotes (id, conversation_id, provider, service_name, price, delivery_days, destination_postal_code) values
  ('60000000-0000-0000-0000-0000000000f1', '60000000-0000-0000-0000-0000000000a1', 'melhor_envio', 'Correios PAC', 22.35, 6, '30140071'),
  ('60000000-0000-0000-0000-0000000000f2', '60000000-0000-0000-0000-0000000000a2', 'melhor_envio', 'Correios SEDEX', 35.00, 2, '01001000');

-- Com cotação: frete, serviço e CEP vêm da cotação
create temporary table quoted as
select public.create_order_with_items(
  '60000000-0000-0000-0000-0000000000c1',
  '[{"product_id": "60000000-0000-0000-0000-0000000000b1", "quantity": 2}]',
  'ship-key-1',
  '60000000-0000-0000-0000-0000000000f1'
) as order_id;

select is((select shipping_cost from public.orders where id = (select order_id from quoted)), 22.35::numeric, 'frete da cotação');
select is((select total_estimated from public.orders where id = (select order_id from quoted)), 102.35::numeric, 'total = subtotal + frete');
select is((select shipping_service from public.orders where id = (select order_id from quoted))::text, 'Correios PAC', 'serviço da cotação');
select is((select destination_postal_code from public.orders where id = (select order_id from quoted))::text, '30140071', 'CEP da cotação');
select is(
  (select order_id from public.shipping_quotes where id = '60000000-0000-0000-0000-0000000000f1'),
  (select order_id from quoted), 'cotação aponta para o pedido'
);

-- Reprocessar com a mesma chave devolve o mesmo pedido, mesmo com a cotação já usada
select is(
  public.create_order_with_items('60000000-0000-0000-0000-0000000000c1',
    '[{"product_id": "60000000-0000-0000-0000-0000000000b1", "quantity": 2}]', 'ship-key-1',
    '60000000-0000-0000-0000-0000000000f1'),
  (select order_id from quoted), 'mesma chave devolve o pedido com frete'
);

-- Cotação já usada, de outro cliente ou inexistente
select throws_ok(
  $$select public.create_order_with_items('60000000-0000-0000-0000-0000000000c1',
      '[{"product_id": "60000000-0000-0000-0000-0000000000b1", "quantity": 1}]', 'ship-key-2',
      '60000000-0000-0000-0000-0000000000f1')$$,
  'P0001', 'invalid_shipping_quote', 'cotação já usada em outro pedido é rejeitada'
);
select throws_ok(
  $$select public.create_order_with_items('60000000-0000-0000-0000-0000000000c1',
      '[{"product_id": "60000000-0000-0000-0000-0000000000b1", "quantity": 1}]', 'ship-key-3',
      '60000000-0000-0000-0000-0000000000f2')$$,
  'P0001', 'invalid_shipping_quote', 'cotação de outro cliente é rejeitada'
);

-- Sem cotação: CEP registrado e frete não cotado
create temporary table unquoted as
select public.create_order_with_items(
  '60000000-0000-0000-0000-0000000000c1',
  '[{"product_id": "60000000-0000-0000-0000-0000000000b1", "quantity": 1}]',
  'ship-key-4', null, '30140071'
) as order_id;

select is(
  (select row(destination_postal_code::text, shipping_cost, shipping_service::text, total_estimated)::text
   from public.orders where id = (select order_id from unquoted)),
  row('30140071', null::numeric, null::text, 40.00::numeric)::text,
  'CEP sem cotação: pedido sem frete e total = subtotal'
);
select throws_ok(
  $$select public.create_order_with_items('60000000-0000-0000-0000-0000000000c1',
      '[{"product_id": "60000000-0000-0000-0000-0000000000b1", "quantity": 1}]', 'ship-key-5', null, '3014-071')$$,
  'P0001', 'invalid_postal_code', 'CEP fora do formato é rejeitado'
);

-- Sem frete nem CEP, como antes
create temporary table plain as
select public.create_order_with_items(
  '60000000-0000-0000-0000-0000000000c1',
  '[{"product_id": "60000000-0000-0000-0000-0000000000b1", "quantity": 1}]', 'ship-key-6'
) as order_id;

select is(
  (select total_estimated from public.orders where id = (select order_id from plain)),
  40.00::numeric, 'pedido sem CEP segue sem frete'
);
select is(
  (select count(*)::int from public.orders where customer_id = '60000000-0000-0000-0000-0000000000c1'),
  3, 'chamadas com falha não criaram pedido'
);

select * from finish();
rollback;
