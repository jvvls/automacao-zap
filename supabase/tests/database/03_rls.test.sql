begin;
select plan(20);

-- Fixtures (como postgres, antes de trocar de papel)
insert into auth.users (id, aud, role, email) values
  ('30000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin-rls@test.local'),
  ('30000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'intruso@test.local');
insert into public.admins (user_id) values ('30000000-0000-0000-0000-0000000000a1');

insert into public.categories (id, name) values ('30000000-0000-0000-0000-000000000001', 'Teste RLS');
insert into public.products (id, category_id, name, base_price, shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm)
values ('30000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-000000000001', 'Produto RLS', 10, 1, 1, 1, 1);
insert into public.customers (id, phone) values ('30000000-0000-0000-0000-0000000000c1', '5511966660001');
insert into public.conversations (id, customer_id, current_state, human_handoff, handoff_at)
values ('30000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000c1', 'CART_REVIEW', true, now());
insert into public.orders (id, customer_id, subtotal) values ('30000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000c1', 10);
insert into public.whatsapp_inbound_messages (wa_message_id, phone, payload) values ('wamid.rls', '5511966660001', '{}');

-- Anônimo
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok('select * from public.products', '42501', null, 'anon não lê produtos');
select throws_ok('select * from public.orders', '42501', null, 'anon não lê pedidos');
select throws_ok('select * from public.customers', '42501', null, 'anon não lê clientes');
select throws_ok(
  $$insert into public.categories (name) values ('anon')$$, '42501', null, 'anon não cria categorias'
);

-- Autenticado sem registro em admins
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "30000000-0000-0000-0000-0000000000a2", "role": "authenticated"}', true);

select ok(not public.is_admin(), 'usuário fora de admins não é admin');
select is_empty('select * from public.products', 'não-admin não vê produtos');
select is_empty('select * from public.orders', 'não-admin não vê pedidos');
select throws_ok(
  $$insert into public.categories (name) values ('intruso')$$, '42501', null, 'não-admin não cria categorias'
);

-- Admin
select set_config('request.jwt.claims', '{"sub": "30000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);

select ok(public.is_admin(), 'usuário em admins é admin');
select isnt_empty($$select * from public.products where id = '30000000-0000-0000-0000-0000000000b1'$$, 'admin vê produtos');
select lives_ok(
  $$update public.products set active = false where id = '30000000-0000-0000-0000-0000000000b1'$$,
  'admin desativa produto'
);
select lives_ok(
  $$update public.orders set status = 'approved' where id = '30000000-0000-0000-0000-0000000000e1'$$,
  'admin altera status do pedido'
);
select throws_ok(
  $$update public.orders set subtotal = 0 where id = '30000000-0000-0000-0000-0000000000e1'$$,
  '42501', null, 'admin não altera valores do pedido'
);
select throws_ok(
  $$delete from public.orders where id = '30000000-0000-0000-0000-0000000000e1'$$,
  '42501', null, 'admin não apaga pedidos'
);
select throws_ok(
  $$select public.create_order_with_items('30000000-0000-0000-0000-0000000000c1',
      '[{"product_id": "30000000-0000-0000-0000-0000000000b1", "quantity": 1}]', 'rls-key')$$,
  '42501', null, 'painel não chama a RPC interna de pedido'
);
select throws_ok(
  'select * from public.whatsapp_inbound_messages', '42501', null, 'painel não lê whatsapp_inbound_messages'
);
select throws_ok(
  $$insert into public.admins (user_id) values ('30000000-0000-0000-0000-0000000000a2')$$,
  '42501', null, 'painel não edita admins'
);

-- Reativação do bot (seção 4.4)
select lives_ok(
  $$update public.conversations set human_handoff = false where id = '30000000-0000-0000-0000-0000000000d1'$$,
  'admin reativa o bot'
);
select throws_ok(
  $$update public.conversations set context = '{"x": 1}' where id = '30000000-0000-0000-0000-0000000000d1'$$,
  '42501', null, 'admin não altera o contexto da conversa'
);

reset role;
select results_eq(
  $$select current_state::text, handoff_at is null from public.conversations where id = '30000000-0000-0000-0000-0000000000d1'$$,
  $$values ('MAIN_MENU', true)$$,
  'reativar volta a MAIN_MENU e limpa handoff_at'
);

select * from finish();
rollback;
