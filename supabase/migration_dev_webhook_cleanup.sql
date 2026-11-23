-- Execute apenas no projeto Supabase de desenvolvimento.
create extension if not exists pg_cron;

select cron.schedule(
  'dev-webhook-events-cleanup',
  '0 6 * * *',
  $cleanup$
    delete from public.webhook_events
    where received_at < now() - interval '48 hours';

    delete from public.ifood_webhook_attempts
    where received_at < now() - interval '30 days';
  $cleanup$
);
