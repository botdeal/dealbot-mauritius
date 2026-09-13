-- One atomic snapshot per tick keeps the 45s transaction budget bounded.
create or replace function private.sync_tick() returns jsonb language plpgsql security invoker set search_path='' as $$
declare r record; processed int:=0; expired int:=0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('dealbot-sync:tick',42)) then return '{"state":"busy"}'; end if;
  for r in select q.id from private.sync_runs q join private.sync_sources s on s.id=q.source_id
    where q.state in ('queued','retry') and q.next_attempt_at<=now() and s.enabled order by q.id limit 1 loop
    perform public.sync_process(r.id); processed:=processed+1;
  end loop;
  update public.deals set status='expired' where sync_source is not null and status in ('active','draft') and expires_at<=now();
  get diagnostics expired=row_count;
  return jsonb_build_object('processed',processed,'expired',expired);
end; $$;

