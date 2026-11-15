begin;
select plan(15);

insert into public.categories (id, name) values ('10000000-0000-0000-0000-000000000001', 'Teste constraints');

-- Produto: preço, peso e dimensões (seção 14)
prepare negative_price as
  insert into public.products (category_id, name, base_price, shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm)
  values ('10000000-0000-0000-0000-000000000001', 'x', -1, 1, 1, 1, 1);
select throws_ok('negative_price', '23514', null, 'produto não aceita preço negativo');

prepare zero_price as
  insert into public.products (category_id, name, base_price, shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm)
  values ('10000000-0000-0000-0000-000000000001', 'x', 0, 1, 1, 1, 1);
select throws_ok('zero_price', '23514', null, 'produto não aceita preço zero');

prepare zero_weight as
  insert into public.products (category_id, name, base_price, shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm)
  values ('10000000-0000-0000-0000-000000000001', 'x', 10, 0, 1, 1, 1);
select throws_ok('zero_weight', '23514', null, 'peso deve ser positivo');

prepare zero_width as
  insert into public.products (category_id, name, base_price, shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm)
  values ('10000000-0000-0000-0000-000000000001', 'x', 10, 1, 0, 1, 1);
select throws_ok('zero_width', '23514', null, 'largura deve ser positiva');

prepare negative_height as
  insert into public.products (category_id, name, base_price, shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm)
  values ('10000000-0000-0000-0000-000000000001', 'x', 10, 1, 1, -2, 1);
select throws_ok('negative_height', '23514', null, 'altura deve ser positiva');

prepare zero_length as
  insert into public.products (category_id, name, base_price, shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm)
  values ('10000000-0000-0000-0000-000000000001', 'x', 10, 1, 1, 1, 0);
select throws_ok('zero_length', '23514', null, 'comprimento deve ser positivo');

prepare missing_category as
  insert into public.products (category_id, name, base_price, shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm)
  values (null, 'x', 10, 1, 1, 1, 1);
select throws_ok('missing_category', '23502', null, 'produto exige categoria');

prepare unknown_category as
  insert into public.products (category_id, name, base_price, shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm)
  values (gen_random_uuid(), 'x', 10, 1, 1, 1, 1);
select throws_ok('unknown_category', '23503', null, 'produto exige categoria existente');

-- Cliente, conversa e pedido
prepare bad_phone as insert into public.customers (phone) values ('+55 11 99999-0000');
select throws_ok('bad_phone', '23514', null, 'telefone só com dígitos e código do país');

insert into public.customers (id, phone) values ('10000000-0000-0000-0000-0000000000c1', '5511988880001');

prepare second_conversation as
  insert into public.conversations (customer_id) values ('10000000-0000-0000-0000-0000000000c1'), ('10000000-0000-0000-0000-0000000000c1');
select throws_ok('second_conversation', '23505', null, 'uma única conversa por cliente');

prepare bad_state as
  insert into public.conversations (customer_id, current_state) values ('10000000-0000-0000-0000-0000000000c1', 'HUMAN_HANDOFF');
select throws_ok('bad_state', '23514', null, 'estado da conversa fora da seção 8 é rejeitado');

prepare bad_status as
  insert into public.orders (customer_id, status, subtotal) values ('10000000-0000-0000-0000-0000000000c1', 'paid', 0);
select throws_ok('bad_status', '23514', null, 'status de pedido fora da lista é rejeitado');

insert into public.orders (id, customer_id, subtotal) values ('10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000c1', 0);
insert into public.products (id, category_id, name, base_price, shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm)
values ('10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001', 'ok', 10, 1, 1, 1, 1);

prepare zero_quantity as
  insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_snapshot, quantity)
  values ('10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000b1', 'ok', 10, 0);
select throws_ok('zero_quantity', '23514', null, 'quantidade do item deve ser positiva');

prepare duplicate_message as
  insert into public.whatsapp_inbound_messages (wa_message_id, phone, payload)
  values ('wamid.1', '5511988880001', '{}'), ('wamid.1', '5511988880001', '{}');
select throws_ok('duplicate_message', '23505', null, 'wa_message_id repetido é rejeitado (deduplicação)');

-- updated_at muda a cada update (base do controle otimista da seção 5.4)
update public.products set updated_at = '2000-01-01' where id = '10000000-0000-0000-0000-0000000000b1';
select ok(
  (select updated_at > '2000-01-01' from public.products where id = '10000000-0000-0000-0000-0000000000b1'),
  'trigger grava now() em updated_at'
);

select * from finish();
rollback;
