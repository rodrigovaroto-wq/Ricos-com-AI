-- Retenção de 90 dias como cron do próprio banco (R8.2). Aplicado em 2026-09-06.
-- Fora do n8n de propósito: se o n8n cair, o dado pessoal continua expirando.
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'purge-expired-daily',
  '0 4 * * *',
  $$select public.purge_expired()$$
);

-- O toque 1 da régua de silêncio retoma do ponto exato onde ela parou.
alter table public.followups add column if not exists stop_point text;
comment on column public.followups.stop_point is 'before_size | after_price | link_sent — decide a copy do toque 1.';
