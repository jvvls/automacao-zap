-- Criação transacional de pedido (seção 5.12).
--
-- p_items: [{"product_id": "<uuid>", "quantity": <inteiro > 0>}, ...]
-- Itens repetidos do mesmo produto são somados. Preços e nomes vêm do banco.
-- Se p_idempotency_key já foi usada pelo mesmo cliente, devolve o pedido
-- existente sem criar outro.
--
-- Erros (SQLSTATE P0001, mensagem = código):
--   invalid_idempotency_key, customer_not_found, idempotency_key_conflict,
--   invalid_items, invalid_quantity, product_unavailable
create function public.create_order_with_items(
  p_customer_id     uuid,
  p_items           jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_order_id    uuid;
  v_owner_id    uuid;
  v_subtotal    numeric(10,2);
  v_requested_items jsonb;
  v_requested   integer;
  v_available   integer;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0
     or length(p_idempotency_key) > 100 then
    raise exception 'invalid_idempotency_key';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'customer_not_found';
  end if;

  select id, customer_id into v_order_id, v_owner_id
  from public.orders where idempotency_key = p_idempotency_key;
  if found then
    if v_owner_id <> p_customer_id then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_order_id;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid_items';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) as item
    where jsonb_typeof(item) <> 'object'
       or coalesce(jsonb_typeof(item -> 'product_id'), '') <> 'string'
       or (item ->> 'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'invalid_items';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) as item
    where coalesce(jsonb_typeof(item -> 'quantity'), '') <> 'number'
       or (item ->> 'quantity') !~ '^[0-9]+$'
       or (item ->> 'quantity')::numeric not between 1 and 2147483647
  ) then
    raise exception 'invalid_quantity';
  end if;

  select jsonb_agg(jsonb_build_object('product_id', product_id, 'quantity', quantity)), count(*)
    into v_requested_items, v_requested
  from (
    select (item ->> 'product_id')::uuid as product_id,
           sum((item ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as item
    group by 1
  ) grouped;

  select count(*), sum(p.base_price * r.quantity)
    into v_available, v_subtotal
  from jsonb_to_recordset(v_requested_items) as r (product_id uuid, quantity integer)
  join public.products p on p.id = r.product_id
  join public.categories c on c.id = p.category_id
  where p.active and c.active;

  if v_available <> v_requested then
    raise exception 'product_unavailable';
  end if;

  -- Duas chamadas simultâneas com a mesma chave: só uma insere.
  insert into public.orders (customer_id, status, subtotal, total_estimated, idempotency_key)
  values (p_customer_id, 'received', v_subtotal, v_subtotal, p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning id into v_order_id;

  if v_order_id is null then
    select id, customer_id into v_order_id, v_owner_id
    from public.orders where idempotency_key = p_idempotency_key;
    if v_owner_id <> p_customer_id then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_order_id;
  end if;

  insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_snapshot, quantity)
  select v_order_id, p.id, p.name, p.base_price, r.quantity
  from jsonb_to_recordset(v_requested_items) as r (product_id uuid, quantity integer)
  join public.products p on p.id = r.product_id;

  return v_order_id;
end;
$$;

revoke execute on function public.create_order_with_items(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_order_with_items(uuid, jsonb, text) to service_role;
