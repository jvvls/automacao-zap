-- Retenção do payload de whatsapp_inbound_messages (seção 5.9): limpa o
-- conteúdo das mensagens já tratadas após 7 dias. A linha fica, para manter
-- a deduplicação por wa_message_id. Mensagens failed/received mantêm o
-- payload para reprocessamento.
create extension if not exists pg_cron;

select cron.schedule(
  'purge-whatsapp-inbound-payloads',
  '0 3 * * *',
  $$
    update public.whatsapp_inbound_messages
    set payload = '{}'::jsonb
    where status in ('processed', 'ignored')
      and received_at < now() - interval '7 days'
      and payload <> '{}'::jsonb
  $$
);
