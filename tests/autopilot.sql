-- Controlled end-to-end fixtures. No external source; every mutation rolls back.
begin;
select set_config('dealbot.sync_test_source','fixture-'||gen_random_uuid()::text,true);
create function pg_temp.submit_fixture(offers jsonb, revision bigint, complete boolean default true) returns jsonb
language plpgsql as $$
declare queued jsonb;
begin
  queued:=public.sync_enqueue(jsonb_build_object('source',current_setting('dealbot.sync_test_source'),'key','revision-'||revision,
    'revision',revision,'complete',complete,'offers',offers));
  return public.sync_process((queued->>'id')::bigint);
end; $$;
create function pg_temp.transient_fixture() returns trigger language plpgsql as $$
begin
  if new.sync_source=current_setting('dealbot.sync_test_source',true) and new.name='Temporary failure sentinel'
    and current_setting('dealbot.sync_test_failure',true)='on' then
    raise exception 'Controlled temporary failure' using errcode='40001';
  end if;
  return new;
end; $$;
create trigger autopilot_test_transient before update on public.deals for each row execute function pg_temp.transient_fixture();
do $$
declare sid text:=current_setting('dealbot.sync_test_source'); a jsonb; b jsonb; result jsonb; batch jsonb; job_id bigint; price_rows bigint;
begin
  insert into private.sync_sources(id,fixture) values(sid,true);
  a:=jsonb_build_object('external_id','phone-1','name','  Test Phone  ','price',100,'old_price',200,'currency','mur','availability','in_stock',
    'original_url','https://example.com/phone','description','Controlled description','image_url','https://example.com/phone.png',
    'merchant',jsonb_build_object('external_id','shop-1','name','Test Shop','website_url','https://example.com'),
    'category',jsonb_build_object('external_id','tech','name_fr','Test Technologie','name_en','Test Technology'));
  b:=a||'{"external_id":"phone-2","name":"Second Phone","price":150}'::jsonb;
  batch:=jsonb_build_array(a,b);
  result:=pg_temp.submit_fixture(batch,1);
  if result->>'state'<>'succeeded' or (result#>>'{result,created}')::int<>2 then raise exception 'First import failed: %',result; end if;
  if (select count(*) from public.merchants where sync_source=sid)<>1 or (select count(*) from public.categories where sync_source=sid)<>1 then raise exception 'Merchant/category duplicate'; end if;
  if (select name from public.deals where sync_source=sid and sync_external_id='phone-1')<>'Test Phone' then raise exception 'Normalization failed'; end if;
  if (select dealbot_score from public.deals where sync_source=sid and sync_external_id='phone-1')<>80 then raise exception 'Score formula mismatch'; end if;
  if exists(select 1 from public.deals where sync_source=sid and status<>'draft') then raise exception 'Fixture was published'; end if;
  result:=pg_temp.submit_fixture(batch,1);
  result:=pg_temp.submit_fixture(batch,2);
  if (result#>>'{result,created}')::int<>0 or (result#>>'{result,updated}')::int<>0 then raise exception 'Replay changed catalog'; end if;
  if (select count(*) from public.price_history h join public.deals d on d.id=h.deal_id where d.sync_source=sid)<>2 then raise exception 'Duplicate history'; end if;
  a:=a||'{"price":80}'::jsonb;
  result:=pg_temp.submit_fixture(jsonb_build_array(a,b),3);
  if result->>'state'<>'succeeded' or (select count(*) from public.price_history h join public.deals d on d.id=h.deal_id where d.sync_source=sid)<>3 then raise exception 'Price history missing: %',result; end if;
  a:=a||'{"name":"Updated Phone","merchant":{"external_id":"shop-1","name":"Renamed Shop","website_url":"https://example.com"},"category":{"external_id":"tech","name_fr":"Test Tech modifié","name_en":"Updated Test Tech"}}'::jsonb;
  -- Use the same updated shared entities in every offer; adapters must agree.
  b:=b||jsonb_build_object('merchant',a->'merchant','category',a->'category');
  result:=pg_temp.submit_fixture(jsonb_build_array(a,b),4);
  if (select name from public.merchants where sync_source=sid)<>'Renamed Shop' then raise exception 'Merchant update missing'; end if;
  if (select count(*) from public.price_history h join public.deals d on d.id=h.deal_id where d.sync_source=sid)<>3 then raise exception 'Metadata polluted history'; end if;
  result:=pg_temp.submit_fixture(jsonb_build_array(a),5);
  if (result#>>'{result,expired}')::int<>1 then raise exception 'Reconciliation failed'; end if;
  -- First offer is modified before a later offer raises a temporary SQL error.
  perform set_config('dealbot.sync_test_failure','on',true);
  a:=a||'{"price":70}'::jsonb;b:=b||'{"name":"Temporary failure sentinel"}'::jsonb;
  result:=pg_temp.submit_fixture(jsonb_build_array(a,b),6);
  job_id:=(result->>'id')::bigint;
  if result->>'state'<>'retry' or result->>'error_code'<>'40001' then raise exception 'Retry not recorded: %',result; end if;
  if (select price from public.deals where sync_source=sid and sync_external_id='phone-1')<>80 then raise exception 'Partial failed batch committed'; end if;
  perform set_config('dealbot.sync_test_failure','off',true);
  update private.sync_runs set next_attempt_at=now() where sync_runs.id=job_id;
  perform private.sync_tick();
  result:=public.sync_status(job_id);
  if result->>'state'<>'succeeded' or (result->>'attempts')::int<>2 then raise exception 'Resume failed: %',result; end if;
  if (select price from public.deals where sync_source=sid and sync_external_id='phone-1')<>70 then raise exception 'Resumed price missing'; end if;
  if (select count(*) from public.price_history h join public.deals d on d.id=h.deal_id where d.sync_source=sid)<>4 then raise exception 'Resume duplicated history'; end if;
  if not exists(select 1 from private.sync_events e where e.run_id=job_id and e.event='error') then raise exception 'Durable failure log absent'; end if;
  -- Invalid complete snapshots must never expire the remaining catalog.
  result:=pg_temp.submit_fixture(jsonb_build_array(a||'{"price":-1}'),7);
  if result->>'state'<>'failed' then raise exception 'Invalid price accepted'; end if;
  if exists(select 1 from public.deals where sync_source=sid and status='expired') then raise exception 'Failed snapshot expired offers'; end if;
  begin
    perform public.sync_enqueue(jsonb_build_object('source',sid,'key','revision-1','revision',1,'complete',true,'offers',jsonb_build_array(a)));
    raise exception 'Changed idempotency content accepted';
  exception when invalid_parameter_value then null; end;
  -- Explicit offer expiration, then scheduled cleanup for already stored deadlines.
  a:=a||jsonb_build_object('expires_at','2000-01-01T00:00:00Z');
  result:=pg_temp.submit_fixture(jsonb_build_array(a,b),8);
  if (select status from public.deals where sync_source=sid and sync_external_id='phone-1')<>'expired' then raise exception 'Explicit expiration failed'; end if;
  update public.deals set expires_at=now()-interval '1 second' where sync_source=sid and sync_external_id='phone-2';
  perform private.sync_tick();
  if exists(select 1 from public.deals where sync_source=sid and status<>'expired') then raise exception 'Scheduled expiration failed'; end if;
  if has_function_privilege('anon','public.sync_enqueue(jsonb)','execute') or has_function_privilege('authenticated','public.sync_process(bigint)','execute') then raise exception 'Public sync privilege leaked'; end if;
  if has_table_privilege('authenticated','private.sync_runs','select') then raise exception 'Private run payload leaked'; end if;
  -- Auto-publication path is tested inside this rollback transaction only.
  update private.sync_sources set fixture=false,auto_publish=true,allowed_hosts=array['example.com'] where sync_sources.id=sid;
  a:=a||'{"expires_at":null}'::jsonb;
  result:=pg_temp.submit_fixture(jsonb_build_array(a),9);
  if result->>'state'<>'succeeded' or (select status from public.deals where sync_source=sid and sync_external_id='phone-1')<>'active' then raise exception 'Auto-publication failed'; end if;
  result:=pg_temp.submit_fixture(jsonb_build_array(a||'{"affiliate_url":"https://unapproved.example/product"}'),10);
  if result->>'state'<>'failed' then raise exception 'Unapproved affiliate host accepted'; end if;
end; $$;
do $$ declare u uuid:=gen_random_uuid(); begin
  insert into auth.users(id,raw_user_meta_data) values(u,'{}');
  update public.profiles set role='admin' where id=u;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
end; $$;
set local role authenticated;
do $$ begin
  update public.deals set price=180,dealbot_score=99 where sync_source=current_setting('dealbot.sync_test_source') and sync_external_id='phone-1';
  if not exists(select 1 from public.deals where sync_source=current_setting('dealbot.sync_test_source') and sync_external_id='phone-1'
    and dealbot_score=40 and score_method='automatic-v1' and sync_hash is null) then raise exception 'Admin edit left a stale automatic score'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$ declare d bigint; begin
  select id into d from public.deals where sync_source=current_setting('dealbot.sync_test_source') and sync_external_id='phone-1';
  if d is null then raise exception 'Published imported offer hidden'; end if;
  if public.track_deal_click(d,'autopilot-test-session','deal')<>'https://example.com/phone' then raise exception 'Imported offer tracking failed'; end if;
end; $$;
reset role;
select 'PASS: import, replay, normalization, score, merchants/categories, price history, metadata, disappearance, temporary failure, atomic rollback, durable error, scheduled retry, invalid snapshot, idempotency, expiration and access controls' as autopilot_result;
rollback;
