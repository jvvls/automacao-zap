-- Frete na criação do pedido (seções 4.3, 4.5 e 10.3). Substitui a RPC da
-- migration 20261115121716 com dois parâmetros opcionais:
--
-- p_shipping_quote_id: cotação escolhida, gravada antes em shipping_quotes
--   para a conversa do próprio cliente e ainda sem pedido. Preço, serviço e
--   CEP vêm dela; a cotação passa a apontar para o pedido.
-- p_destination_postal_code: CEP informado sem cotação (API fora do ar ou sem
--   serviços). O pedido fica com o CEP e sem frete: frete não cotado.
--
-- Erros novos: invalid_shipping_quote, invalid_postal_code.
drop function public.create_order_with_items(uuid, jsonb, text);

create function public.create_order_with_items(
  p_customer_id             uuid,
  p_items                   jsonb,
  p_idempotency_key         text,
  p_shipping_quote_id       uuid default null,
  p_destination_postal_code text default null
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
  v_shipping_cost    numeric(10,2);
  v_shipping_service varchar(100);
  v_postal_code      varchar(10);
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

  if p_shipping_quote_id is not null then
    -- Trava a cotação: duas chamadas com chaves diferentes não usam a mesma.
    select q.price, q.service_name, q.destination_postal_code
      into v_shipping_cost, v_shipping_service, v_postal_code
    from public.shipping_quotes q
    join public.conversations c on c.id = q.conversation_id
    where q.id = p_shipping_quote_id and c.customer_id = p_customer_id and q.order_id is null
    for update of q;
    if not found then
      raise exception 'invalid_shipping_quote';
    end if;
  elsif p_destination_postal_code is not null then
    if p_destination_postal_code !~ '^[0-9]{8}$' then
      raise exception 'invalid_postal_code';
    end if;
    v_postal_code := p_destination_postal_code;
  end if;

  -- Duas chamadas simultâneas com a mesma chave: só uma insere.
  insert into public.orders (
    customer_id, status, subtotal, shipping_cost, total_estimated,
    destination_postal_code, shipping_service, idempotency_key
  )
  values (
    p_customer_id, 'received', v_subtotal, v_shipping_cost, v_subtotal + coalesce(v_shipping_cost, 0),
    v_postal_code, v_shipping_service, p_idempotency_key
  )
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

  if p_shipping_quote_id is not null then
    update public.shipping_quotes set order_id = v_order_id where id = p_shipping_quote_id;
  end if;

  return v_order_id;
end;
$$;

revoke execute on function public.create_order_with_items(uuid, jsonb, text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_order_with_items(uuid, jsonb, text, uuid, text) to service_role;
