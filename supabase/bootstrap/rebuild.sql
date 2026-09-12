-- Run with psql against a NEW Supabase project's database, never the existing one.
-- Abort on any error; managed auth schema/roles must already exist.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if to_regclass('public.deals') is not null then
    raise exception 'Refusing rebuild: DealBot tables already exist';
  end if;
end $$;
\ir schema.sql
\ir seed.sql
\ir ../migrations/20260912105450_dealbot_autopilot.sql
\ir ../migrations/20260912160337_dealbot_autopilot_score_consistency.sql
\ir ../migrations/20260912162739_dealbot_autopilot_streams.sql
\ir ../migrations/20260912163127_dealbot_autopilot_audit_bounds.sql
\ir ../migrations/20260912163729_dealbot_autopilot_worker_budget.sql
\ir ../migrations/20260912163940_dealbot_autopilot_retry_retention.sql
commit;
\ir ../migrations/20260912105616_dealbot_autopilot_schedule.sql
\ir ../migrations/20260912162803_dealbot_autopilot_retention_schedule.sql
