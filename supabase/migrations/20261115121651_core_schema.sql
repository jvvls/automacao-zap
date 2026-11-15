-- Schema central do MVP (seção 5 da arquitetura).

-- Toda tabela com updated_at usa este trigger; o controle otimista de
-- concorrência de conversations (seção 5.4) depende dele.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 5.1
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(100) not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 5.2
create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  category_id        uuid not null references public.categories (id),
  name               varchar(150) not null,
  description        text,
  base_price         numeric(10,2) not null check (base_price >= 0),
  image_path         text,
  shipping_weight_kg numeric(8,3) not null check (shipping_weight_kg > 0),
  shipping_width_cm  numeric(8,2) not null check (shipping_width_cm > 0),
  shipping_height_cm numeric(8,2) not null check (shipping_height_cm > 0),
  shipping_length_cm numeric(8,2) not null check (shipping_length_cm > 0),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index products_category_id_idx on public.products (category_id);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- 5.3. Telefone só com dígitos, com código do país (mesmo formato do wa_id da Meta).
create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(150),
  phone      varchar(30) not null unique check (phone ~ '^[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- 5.4. Uma linha por cliente; estados da seção 8.
create table public.conversations (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null unique references public.customers (id),
  current_state       varchar(50) not null default 'MAIN_MENU' check (current_state in (
                        'MAIN_MENU', 'CATEGORY_SELECTION', 'PRODUCT_SELECTION',
                        'PRODUCT_DETAILS', 'QUANTITY_INPUT', 'CART_REVIEW',
                        'POSTAL_CODE_INPUT', 'SHIPPING_SELECTION', 'ORDER_CONFIRMATION')),
  context             jsonb not null default '{}',
  human_handoff       boolean not null default false,
  handoff_at          timestamptz,
  last_interaction_at timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- Seção 4.4: ao reativar o bot (human_handoff true -> false), a conversa
-- volta a MAIN_MENU e handoff_at é limpo. Assim o painel só precisa
-- atualizar human_handoff.
create function public.reset_conversation_on_bot_reactivation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.human_handoff and not new.human_handoff then
    new.current_state := 'MAIN_MENU';
    new.handoff_at := null;
  end if;
  return new;
end;
$$;

create trigger conversations_reset_on_bot_reactivation
  before update of human_handoff on public.conversations
  for each row execute function public.reset_conversation_on_bot_reactivation();

-- 5.5
create table public.orders (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid not null references public.customers (id),
  status                  varchar(30) not null default 'received' check (status in (
                            'received', 'in_review', 'approved', 'in_production',
                            'ready', 'completed', 'cancelled')),
  subtotal                numeric(10,2) not null check (subtotal >= 0),
  shipping_cost           numeric(10,2) check (shipping_cost >= 0),
  total_estimated         numeric(10,2) check (total_estimated >= 0),
  destination_postal_code varchar(10),
  shipping_service        varchar(100),
  notes                   text,
  idempotency_key         varchar(100) unique,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index orders_customer_id_idx on public.orders (customer_id);
create index orders_created_at_idx on public.orders (created_at desc);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- 5.6
create table public.order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders (id) on delete cascade,
  product_id            uuid not null references public.products (id),
  product_name_snapshot varchar(150) not null,
  unit_price_snapshot   numeric(10,2) not null check (unit_price_snapshot >= 0),
  quantity              integer not null check (quantity > 0),
  created_at            timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

-- 5.7
create table public.shipping_quotes (
  id                      uuid primary key default gen_random_uuid(),
  conversation_id         uuid references public.conversations (id),
  order_id                uuid references public.orders (id),
  provider                varchar(50) not null,
  service_name            varchar(100) not null,
  price                   numeric(10,2) not null check (price >= 0),
  delivery_days           integer check (delivery_days >= 0),
  destination_postal_code varchar(10) not null,
  expires_at              timestamptz,
  created_at              timestamptz not null default now()
);

create index shipping_quotes_conversation_id_idx on public.shipping_quotes (conversation_id);
create index shipping_quotes_order_id_idx on public.shipping_quotes (order_id);

-- 5.8
create table public.order_status_history (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  previous_status varchar(30) check (previous_status in (
                    'received', 'in_review', 'approved', 'in_production',
                    'ready', 'completed', 'cancelled')),
  new_status      varchar(30) not null check (new_status in (
                    'received', 'in_review', 'approved', 'in_production',
                    'ready', 'completed', 'cancelled')),
  created_at      timestamptz not null default now()
);

create index order_status_history_order_id_idx on public.order_status_history (order_id);

-- Registra o status inicial e cada mudança de status do pedido.
create function public.log_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, previous_status, new_status)
    values (new.id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, previous_status, new_status)
    values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger orders_log_status_change
  after insert or update of status on public.orders
  for each row execute function public.log_order_status_change();

-- 5.9
create table public.whatsapp_inbound_messages (
  id              uuid primary key default gen_random_uuid(),
  wa_message_id   varchar(100) not null unique,
  phone           varchar(30) not null,
  conversation_id uuid references public.conversations (id),
  payload         jsonb not null,
  status          varchar(20) not null default 'received' check (status in (
                    'received', 'processed', 'ignored', 'failed')),
  error           text,
  attempts        integer not null default 0,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz
);

create index whatsapp_inbound_messages_conversation_id_idx
  on public.whatsapp_inbound_messages (conversation_id);
-- Reprocessamento de mensagens failed ou presas em received (seção 11.3).
create index whatsapp_inbound_messages_pending_idx
  on public.whatsapp_inbound_messages (received_at)
  where status in ('received', 'failed');
