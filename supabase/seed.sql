-- Dados fictícios para desenvolvimento local. Não aplicar em produção.

-- Usuário administrativo: admin@scrapbook.local / admin123456
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'admin@scrapbook.local',
  extensions.crypt('admin123456', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', '{}', now(), now(), '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001', 'email',
  '{"sub": "a0000000-0000-0000-0000-000000000001", "email": "admin@scrapbook.local", "email_verified": true}',
  now(), now(), now()
);

insert into public.admins (user_id) values ('a0000000-0000-0000-0000-000000000001');

insert into public.categories (id, name, active) values
  ('c0000000-0000-0000-0000-000000000001', 'Álbuns', true),
  ('c0000000-0000-0000-0000-000000000002', 'Cadernos', true),
  ('c0000000-0000-0000-0000-000000000003', 'Kits de papel', false);

insert into public.products (
  id, category_id, name, description, base_price,
  shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm, active
) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'Álbum de casamento', 'Álbum artesanal com 30 páginas.', 189.90, 1.200, 32, 6, 32, true),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
   'Álbum de bebê', 'Álbum para o primeiro ano, 24 páginas.', 159.90, 0.950, 28, 5, 28, true),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002',
   'Caderno de receitas', 'Capa dura, 80 folhas.', 79.90, 0.600, 22, 3, 30, true),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002',
   'Caderno de viagem', 'Fora de linha.', 69.90, 0.500, 15, 3, 21, false),
  ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000003',
   'Kit papéis florais', '20 folhas 30x30.', 49.90, 0.400, 31, 1, 31, true);

insert into public.customers (id, name, phone) values
  ('e0000000-0000-0000-0000-000000000001', 'Cliente Teste', '5511999990001');

insert into public.conversations (customer_id) values
  ('e0000000-0000-0000-0000-000000000001');

select public.create_order_with_items(
  'e0000000-0000-0000-0000-000000000001',
  '[{"product_id": "d0000000-0000-0000-0000-000000000001", "quantity": 1},
    {"product_id": "d0000000-0000-0000-0000-000000000003", "quantity": 2}]',
  'seed-order-1'
);
