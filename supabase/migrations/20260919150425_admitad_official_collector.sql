-- Account-generated official source. Initial imports remain drafts until verified.
insert into private.sync_sources(id,enabled,fixture,auto_publish,allowed_hosts)
values('admitad-aliexpress-hot-usd',true,false,false,array['www.aliexpress.com','aliexpress.com','rzekl.com'])
on conflict(id) do nothing;

-- Narrow RPC for the authenticated GitHub collector. Existing engine is unchanged.
create function public.admitad_snapshot(request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare source constant text := 'admitad-aliexpress-hot-usd'; existing_count int; s private.sync_snapshots; r private.sync_runs;
begin
 if jsonb_typeof(request) is distinct from 'object' then raise exception 'Invalid request' using errcode='22023'; end if;
 if request->>'op'='run_status' then
  select * into r from private.sync_runs where id=(request->>'id')::bigint and source_id=source;
  if r.id is null then raise exception 'Unknown source run' using errcode='22023'; end if;
  return jsonb_build_object('run',public.sync_status(r.id));
 end if;
 if request->>'op'='begin' then
  perform pg_advisory_xact_lock(hashtextextended('dealbot-sync:'||source,42));
  if request->>'source' is distinct from source or (request->>'offers')::int not between 1 and 1000
    or (request->>'pages')::int not between 1 and 10 then
   raise exception 'Collector scope exceeds budget' using errcode='22023'; end if;
  if pg_database_size(current_database()) > 350*1024*1024 then raise exception 'Database free budget guard' using errcode='22023'; end if;
  select count(*) into existing_count from public.deals where sync_source=source and status in ('active','draft');
  if (request->>'offers')::int < existing_count*0.5 then
   raise exception 'Abnormal catalogue shrink; preserve existing offers' using errcode='22023'; end if;
 else
  select * into s from private.sync_snapshots where id=(request->>'id')::uuid and source_id=source;
  if s.id is null then raise exception 'Unknown source snapshot' using errcode='22023'; end if;
 end if;
 return public.sync_snapshot(request);
end; $$;
revoke all on function public.admitad_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.admitad_snapshot(jsonb) to service_role;

-- Stale catalogue withdrawal is a DealBot freshness policy, not an invented
-- merchant expiration date. Source disappearance is reconciled by full snapshots.
create function private.admitad_withdraw_stale() returns void
language sql security invoker set search_path='' as $$
 update public.deals set status='expired'
 where sync_source='admitad-aliexpress-hot-usd' and status='active'
   and last_checked_at < now()-interval '72 hours';
$$;
revoke all on function private.admitad_withdraw_stale() from public,anon,authenticated;
select cron.schedule('dealbot-admitad-stale','47 * * * *','select private.admitad_withdraw_stale()');
