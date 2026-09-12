-- Hourly bounded cleanup; never deletes catalog or personal data.
select cron.schedule('dealbot-autopilot-retention','17 * * * *',
 $$set statement_timeout='30s'; select private.sync_cleanup();$$);
-- pg_cron's own execution records also need a bounded lifetime.
select cron.schedule('dealbot-autopilot-cron-history','23 3 * * *',
 $$delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname like 'dealbot-autopilot-%') and end_time < now()-interval '14 days';$$);
