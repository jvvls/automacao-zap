begin;
select plan(3);

insert into auth.users (id, aud, role, email) values
  ('40000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin-storage@test.local'),
  ('40000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'intruso-storage@test.local');
insert into public.admins (user_id) values ('40000000-0000-0000-0000-0000000000a1');

select ok(
  (select public from storage.buckets where id = 'product-images'),
  'bucket product-images é público'
);

set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "40000000-0000-0000-0000-0000000000a2", "role": "authenticated"}', true);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('product-images', 'intruso.jpg', '40000000-0000-0000-0000-0000000000a2')$$,
  '42501', null, 'não-admin não envia fotos'
);

select set_config('request.jwt.claims', '{"sub": "40000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('product-images', 'produto.jpg', '40000000-0000-0000-0000-0000000000a1')$$,
  'admin envia fotos'
);

select * from finish();
rollback;
