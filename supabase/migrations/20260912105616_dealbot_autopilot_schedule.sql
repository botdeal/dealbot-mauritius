-- Database worker: no HTTP credential, paid service or external feed required.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('dealbot-autopilot-worker','* * * * *',
  $$set statement_timeout='45s'; select private.sync_tick();$$);
