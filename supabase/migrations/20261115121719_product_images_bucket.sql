-- Bucket público de fotos dos produtos (seção 6.4): leitura pública pela URL,
-- escrita só para is_admin(). Tipos e limite de 5 MB seguem o que o
-- WhatsApp aceita para imagens.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png']);

-- select é necessário para substituir arquivos (upsert) pelo painel.
create policy "admins read product images" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));

create policy "admins upload product images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));

create policy "admins update product images" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));

create policy "admins delete product images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
