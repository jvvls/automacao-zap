-- Autorização do painel (seções 5.10, 6.4 e 11.1).

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins where user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Funções de trigger não são chamadas pela API.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.reset_conversation_on_bot_reactivation() from public, anon, authenticated;
revoke execute on function public.log_order_status_change() from public, anon, authenticated;

alter table public.categories                enable row level security;
alter table public.products                  enable row level security;
alter table public.customers                 enable row level security;
alter table public.conversations             enable row level security;
alter table public.orders                    enable row level security;
alter table public.order_items               enable row level security;
alter table public.shipping_quotes           enable row level security;
alter table public.order_status_history      enable row level security;
alter table public.whatsapp_inbound_messages enable row level security;
alter table public.admins                    enable row level security;

-- Privilégios explícitos: anon não acessa nada; authenticated só o que o
-- painel usa, e as policies abaixo exigem is_admin(). As Edge Functions
-- usam service_role, que ignora RLS.
revoke all on all tables in schema public from anon, authenticated;

grant select, insert, update on public.categories to authenticated;
grant select, insert, update on public.products   to authenticated;
grant select on public.customers            to authenticated;
grant select on public.orders               to authenticated;
grant select on public.order_items          to authenticated;
grant select on public.shipping_quotes      to authenticated;
grant select on public.order_status_history to authenticated;
grant select on public.conversations        to authenticated;
-- Painel só altera o status do pedido (seção 6.3) e reativa o bot (seção 4.4).
grant update (status)        on public.orders        to authenticated;
grant update (human_handoff) on public.conversations to authenticated;
-- whatsapp_inbound_messages e admins: sem acesso pelo painel.

create policy "admins manage categories" on public.categories
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins manage products" on public.products
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins read customers" on public.customers
  for select to authenticated using ((select public.is_admin()));

create policy "admins read conversations" on public.conversations
  for select to authenticated using ((select public.is_admin()));

create policy "admins update conversations" on public.conversations
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins read orders" on public.orders
  for select to authenticated using ((select public.is_admin()));

create policy "admins update orders" on public.orders
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins read order items" on public.order_items
  for select to authenticated using ((select public.is_admin()));

create policy "admins read shipping quotes" on public.shipping_quotes
  for select to authenticated using ((select public.is_admin()));

create policy "admins read order status history" on public.order_status_history
  for select to authenticated using ((select public.is_admin()));
