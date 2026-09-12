-- Keep failed payloads for the full 90-day retry window.
create or replace function private.sync_cleanup() returns jsonb language plpgsql security invoker set search_path='' as $$
declare ids bigint[]; removed int;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('dealbot-sync:retention',42)) then return '{"state":"busy"}'; end if;
 update private.sync_runs set state='failed',error_code='QUEUE_EXPIRED',finished_at=now() where id in (select id from private.sync_runs where state in ('queued','retry') and created_at<now()-interval '7 days' limit 500);
 update private.sync_runs set payload='{}' where id in (select id from private.sync_runs where state in ('succeeded','superseded') and finished_at<now()-interval '7 days' and payload<>'{}'::jsonb limit 500);
 update private.sync_snapshots set state='abandoned' where state='uploading' and created_at<now()-interval '24 hours';
 delete from private.sync_snapshots where id in (select id from private.sync_snapshots
  where (state='abandoned' and created_at<now()-interval '7 days') or (state='sealed' and created_at<now()-interval '7 days'
   and exists(select 1 from private.sync_runs r where r.id=run_id and r.state in ('succeeded','superseded','failed'))) limit 100);
 select array_agg(id) into ids from (select id from private.sync_runs r where
  ((state in ('succeeded','superseded') and finished_at<now()-interval '30 days') or
   (state='failed' and finished_at<now()-interval '90 days'))
  and not exists(select 1 from private.sync_snapshots s where s.run_id=r.id) order by id limit 500) q;
 delete from private.sync_events where run_id=any(ids);
 delete from private.sync_runs where id=any(ids); get diagnostics removed=row_count;
 return jsonb_build_object('runs_removed',removed);
end; $$;
