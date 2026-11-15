begin;
select plan(2);

select ok(
  exists (select 1 from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'),
  'orders publicada no Realtime para o aviso de pedido novo'
);

select ok(
  exists (select 1 from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'),
  'conversations publicada no Realtime para o aviso de atendimento'
);

select * from finish();
rollback;
