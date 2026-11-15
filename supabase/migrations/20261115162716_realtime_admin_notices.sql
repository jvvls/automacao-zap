-- Aviso no painel de pedidos novos e pedidos de atendimento (Fase 4): o
-- painel escuta mudanças nestas tabelas pelo Realtime. As políticas de RLS
-- valem também para o Realtime, então só administradores recebem os eventos.
alter publication supabase_realtime add table public.orders, public.conversations;
