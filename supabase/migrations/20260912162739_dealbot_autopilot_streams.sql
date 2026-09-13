-- Transport chunks are immutable. Only a sealed complete manifest can reconcile.
create table private.sync_snapshots (
 id uuid primary key default gen_random_uuid(), source_id text not null references private.sync_sources(id),
 snapshot_key text not null, revision bigint not null check(revision>0),
 expected_pages int not null check(expected_pages between 1 and 1000),
 expected_offers int not null check(expected_offers between 0 and 10000),
 state text not null default 'uploading' check(state in ('uploading','sealed','abandoned')),
 created_at timestamptz not null default now(), run_id bigint references private.sync_runs(id),
 unique(source_id,snapshot_key), unique(source_id,revision)
);
create table private.sync_chunks (
 snapshot_id uuid not null references private.sync_snapshots(id) on delete cascade,
 page int not null check(page>=0), digest text not null, offers jsonb not null,
 offer_count int not null, byte_count int not null, primary key(snapshot_id,page)
);
alter table private.sync_snapshots enable row level security;
alter table private.sync_chunks enable row level security;
revoke all on private.sync_snapshots,private.sync_chunks from public,anon,authenticated;
grant all on private.sync_snapshots,private.sync_chunks to service_role;
create index sync_snapshots_retention on private.sync_snapshots(created_at);
create function public.sync_snapshot(request jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s private.sync_snapshots; src text; k text; rev bigint; n int; h text; previous text;
 total int; bytes bigint; payload jsonb; rid bigint; hashes jsonb;
begin
 if jsonb_typeof(request) is distinct from 'object' then raise exception 'Invalid request' using errcode='22023'; end if;
 if request->>'op'='begin' then
  if request-array['op','source','key','revision','pages','offers']<>'{}'::jsonb
   or request->>'revision' !~ '^[1-9][0-9]{0,14}$'
   or request->>'pages' !~ '^[1-9][0-9]{0,3}$' or request->>'offers' !~ '^[0-9]{1,5}$'
   or jsonb_typeof(request->'revision') is distinct from 'number'
   or jsonb_typeof(request->'pages') is distinct from 'number' or jsonb_typeof(request->'offers') is distinct from 'number'
  then raise exception 'Invalid manifest' using errcode='22023'; end if;
  src:=private.sync_text(request,'source',50); k:=private.sync_text(request,'key',100); rev:=(request->>'revision')::bigint;
  perform pg_advisory_xact_lock(hashtextextended('dealbot-sync:'||src,42));
  if exists(select 1 from private.sync_runs where source_id=src and revision=rev)
    and not exists(select 1 from private.sync_snapshots where source_id=src and snapshot_key=k and revision=rev) then
   raise exception 'Revision already used' using errcode='22023'; end if;
  if rev<=(select last_revision from private.sync_sources where id=src) and not exists(select 1 from private.sync_snapshots where source_id=src and snapshot_key=k) then raise exception 'Stale snapshot revision' using errcode='22023'; end if;
  insert into private.sync_snapshots(source_id,snapshot_key,revision,expected_pages,expected_offers)
   values(src,k,rev,(request->>'pages')::int,(request->>'offers')::int) on conflict(source_id,snapshot_key) do nothing;
  select * into s from private.sync_snapshots where source_id=src and snapshot_key=k;
  if (s.revision,s.expected_pages,s.expected_offers) is distinct from (rev,(request->>'pages')::int,(request->>'offers')::int) then
   raise exception 'Manifest key reused' using errcode='22023'; end if;
 else
  select * into s from private.sync_snapshots where id=(request->>'id')::uuid for update;
  if s.id is null then raise exception 'Snapshot missing' using errcode='22023'; end if;
  if request->>'op'='chunk' then
   if request-array['op','id','page','offers']<>'{}'::jsonb or jsonb_typeof(request->'offers') is distinct from 'array'
    or jsonb_typeof(request->'page') is distinct from 'number' or request->>'page' !~ '^[0-9]{1,4}$' then
    raise exception 'Invalid chunk' using errcode='22023'; end if;
   n:=(request->>'page')::int;
   if n>=s.expected_pages or jsonb_array_length(request->'offers')>500 or octet_length(request::text)>2097152 then
    raise exception 'Chunk outside bounds' using errcode='22023'; end if;
   h:=encode(sha256(convert_to((request->'offers')::text,'UTF8')),'hex');
   select digest into previous from private.sync_chunks where snapshot_id=s.id and page=n;
   if previous is not null then
    if previous<>h then raise exception 'Chunk content changed' using errcode='22023'; end if;
   else
    if s.state<>'uploading' then raise exception 'Snapshot closed' using errcode='22023'; end if;
    select coalesce(sum(offer_count),0),coalesce(sum(byte_count),0) into total,bytes from private.sync_chunks where snapshot_id=s.id;
    if total+jsonb_array_length(request->'offers')>s.expected_offers or bytes+octet_length(request::text)>67108864 then
     raise exception 'Snapshot capacity exceeded' using errcode='22023'; end if;
    -- Validate on receipt, then again atomically before catalog writes.
    perform private.sync_normalize(value) from jsonb_array_elements(request->'offers');
    insert into private.sync_chunks values(s.id,n,h,request->'offers',jsonb_array_length(request->'offers'),octet_length(request::text));
   end if;
   return jsonb_build_object('id',s.id,'state',s.state,'page',n,'digest',h);
  elsif request->>'op'='seal' then
   if request-array['op','id','digests']<>'{}'::jsonb then raise exception 'Invalid seal' using errcode='22023'; end if;
   select count(*),coalesce(sum(offer_count),0),jsonb_agg(digest order by page) into n,total,hashes from private.sync_chunks where snapshot_id=s.id;
   if n<>s.expected_pages or total<>s.expected_offers or hashes is distinct from request->'digests' then
    raise exception 'Incomplete or changed manifest' using errcode='22023'; end if;
   if s.state='uploading' then
    perform pg_advisory_xact_lock(hashtextextended('dealbot-sync:'||s.source_id,42));
    select coalesce(jsonb_agg(o.value order by c.page,o.ordinality),'[]') into payload
     from private.sync_chunks c cross join lateral jsonb_array_elements(c.offers) with ordinality o where c.snapshot_id=s.id;
    payload:=jsonb_build_object('source',s.source_id,'key',s.snapshot_key,'revision',s.revision,'complete',true,'allow_empty',true,'offers',payload);
    insert into private.sync_runs(source_id,batch_key,revision,payload,payload_hash)
     values(s.source_id,s.snapshot_key,s.revision,payload,encode(sha256(convert_to(payload::text,'UTF8')),'hex')) returning id into rid;
    insert into private.sync_events(run_id,event,details) values(rid,'snapshot_sealed',jsonb_build_object('pages',n,'offers',total));
    update private.sync_snapshots set state='sealed',run_id=rid where id=s.id returning * into s;
   elsif s.state<>'sealed' then raise exception 'Snapshot abandoned' using errcode='22023'; end if;
  elsif request->>'op'<>'status' then raise exception 'Unsupported snapshot operation' using errcode='22023'; end if;
 end if;
 return jsonb_build_object('id',s.id,'state',s.state,'run_id',s.run_id,'pages',s.expected_pages,'offers',s.expected_offers,
  'received_pages',(select count(*) from private.sync_chunks where snapshot_id=s.id));
end; $$;
revoke all on function public.sync_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.sync_snapshot(jsonb) to service_role;
create or replace function public.sync_process(run_id bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r private.sync_runs; src private.sync_sources; o jsonb; raw jsonb; normalized jsonb:='[]';
  m bigint; c bigint; d public.deals; score jsonb; h text; seen text[]:='{}'; wanted public.deal_status;
  made int:=0; changed int:=0; expired int:=0; unchanged int:=0; err text; outcome jsonb; host text;
begin
  select * into r from private.sync_runs where id=run_id;
  if r.id is null then raise exception 'Run not found' using errcode='22023'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('dealbot-sync:'||r.source_id,42)) then return jsonb_build_object('id',run_id,'state','busy'); end if;
  select * into r from private.sync_runs where id=run_id for update;
  if r.state not in ('queued','retry') or r.next_attempt_at>now() then return jsonb_build_object('id',r.id,'state',r.state,'result',r.result); end if;
  select * into src from private.sync_sources where id=r.source_id for update;
  if not src.enabled then return jsonb_build_object('id',r.id,'state','paused'); end if;
  if r.revision<=src.last_revision then
    update private.sync_runs set state='superseded',finished_at=now() where id=r.id;
    insert into private.sync_events(run_id,event) values(r.id,'superseded');
    return jsonb_build_object('id',r.id,'state','superseded');
  end if;
  update private.sync_runs set attempts=attempts+1 where id=r.id;
  insert into private.sync_events(run_id,event,details) values(r.id,'attempt',jsonb_build_object('number',r.attempts+1));
  begin
    -- Validate the entire batch before any catalog write.
    select coalesce(jsonb_agg(private.sync_normalize(value)),'[]') into normalized from jsonb_array_elements(r.payload->'offers');
    if exists(select 1 from jsonb_array_elements(normalized) p group by p->>'external_id' having count(*)>1)
      or exists(select 1 from jsonb_array_elements(normalized) p group by p#>>'{merchant,external_id}' having count(distinct p->'merchant')>1)
      or exists(select 1 from jsonb_array_elements(normalized) p group by p#>>'{category,external_id}' having count(distinct p->'category')>1) then
      raise exception 'Duplicate identity or inconsistent shared entity' using errcode='22023'; end if;
    select coalesce(array_agg(value->>'external_id'),'{}') into seen from jsonb_array_elements(normalized);
    if src.auto_publish and exists(select 1 from jsonb_array_elements(normalized) p cross join lateral
      unnest(array[p->>'original_url',coalesce(p->>'affiliate_url',p->>'original_url')]) u(url)
      where not(lower(split_part(split_part(split_part(substring(url from 9),'/',1),'?',1),'#',1))=any(src.allowed_hosts))) then
      raise exception 'Destination host not allowed' using errcode='22023'; end if;
    for o in select value from jsonb_array_elements(normalized) loop
      insert into public.merchants(name,slug,website_url,external_id,sync_source,sync_external_id)
        values(o#>>'{merchant,name}','sync-'||md5(src.id||':'||(o#>>'{merchant,external_id}')),o#>>'{merchant,website_url}',o#>>'{merchant,external_id}',src.id,o#>>'{merchant,external_id}')
        on conflict(sync_source,sync_external_id) where sync_source is not null do update set name=excluded.name,website_url=excluded.website_url
        where (merchants.name,merchants.website_url) is distinct from (excluded.name,excluded.website_url) returning id into m;
      if m is null then select id into m from public.merchants where sync_source=src.id and sync_external_id=o#>>'{merchant,external_id}'; end if;
      insert into public.categories(slug,name_fr,name_en,sync_source,sync_external_id)
        values('sync-'||md5(src.id||':'||(o#>>'{category,external_id}')),o#>>'{category,name_fr}',o#>>'{category,name_en}',src.id,o#>>'{category,external_id}')
        on conflict(sync_source,sync_external_id) where sync_source is not null do update set name_fr=excluded.name_fr,name_en=excluded.name_en
        where (categories.name_fr,categories.name_en) is distinct from (excluded.name_fr,excluded.name_en) returning id into c;
      if c is null then select id into c from public.categories where sync_source=src.id and sync_external_id=o#>>'{category,external_id}'; end if;
      score:=private.sync_score(o,(select is_verified from public.merchants where id=m));
      h:=encode(sha256(convert_to((o||jsonb_build_object('score',score))::text,'UTF8')),'hex');
      wanted:=case when (o->>'expires_at')::timestamptz<=now() then 'expired' when src.auto_publish and not src.fixture then 'active' else 'draft' end;
      select * into d from public.deals where sync_source=src.id and sync_external_id=o->>'external_id';
      if d.id is null then
        insert into public.deals(merchant_id,category_id,external_id,slug,name,description,image_url,price,old_price,currency,availability,
          original_url,affiliate_url,starts_at,expires_at,status,dealbot_score,score_method,score_details,sync_source,sync_external_id,sync_hash,sync_revision,last_checked_at)
        values(m,c,o->>'external_id','sync-'||md5(src.id||':'||(o->>'external_id')),o->>'name',o->>'description',o->>'image_url',
          (o->>'price')::numeric,(o->>'old_price')::numeric,o->>'currency',(o->>'availability')::public.stock_status,
          o->>'original_url',o->>'affiliate_url',(o->>'starts_at')::timestamptz,(o->>'expires_at')::timestamptz,wanted,
          (score->>'total')::int,'automatic-v1',score,src.id,o->>'external_id',h,r.revision,now());
        made:=made+1;
      elsif d.status in ('archived','paused') then
        -- Manual withdrawal is sticky; imports never republish it.
        unchanged:=unchanged+1;
      elsif d.sync_hash is distinct from h or d.status<>wanted then
        update public.deals set merchant_id=m,category_id=c,name=o->>'name',description=o->>'description',image_url=o->>'image_url',
          price=(o->>'price')::numeric,old_price=(o->>'old_price')::numeric,currency=o->>'currency',availability=(o->>'availability')::public.stock_status,
          original_url=o->>'original_url',affiliate_url=o->>'affiliate_url',starts_at=(o->>'starts_at')::timestamptz,expires_at=(o->>'expires_at')::timestamptz,
          status=wanted,dealbot_score=(score->>'total')::int,score_method='automatic-v1',score_details=score,sync_hash=h,sync_revision=r.revision,last_checked_at=now() where id=d.id;
        changed:=changed+1;
      else
        update public.deals set last_checked_at=now(),sync_revision=r.revision where id=d.id;
        unchanged:=unchanged+1;
      end if;
    end loop;
    if (r.payload->>'complete')::boolean then
      update public.deals set status='expired',last_checked_at=now(),sync_revision=r.revision
        where sync_source=src.id and status in ('active','draft') and not(sync_external_id=any(seen));
      get diagnostics expired=row_count;
    end if;
    update private.sync_sources set last_revision=r.revision where id=src.id;
    outcome:=jsonb_build_object('received',jsonb_array_length(normalized),'created',made,'updated',changed,'unchanged',unchanged,'expired',expired);
    update private.sync_runs set state='succeeded',finished_at=now(),error_code=null,result=outcome where id=r.id;
    insert into private.sync_events(run_id,event,details) values(r.id,'succeeded',outcome);
  exception when others then
    get stacked diagnostics err=returned_sqlstate;
    update private.sync_runs set state=case when (left(err,2) in ('08','40','53','57') or err='55P03') and attempts<5 then 'retry' else 'failed' end,
      error_code=err,next_attempt_at=now()+make_interval(secs=>least(900,30*power(2,attempts-1)::int)),finished_at=now() where id=r.id;
    insert into private.sync_events(run_id,event,details) values(r.id,'error',jsonb_build_object('sqlstate',err));
  end;
  select * into r from private.sync_runs where id=run_id;
  return jsonb_build_object('id',r.id,'state',r.state,'attempts',r.attempts,'error_code',r.error_code,'result',r.result);
end; $$;

create or replace function public.sync_enqueue(batch jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare sid text; k text; rev bigint; h text; r private.sync_runs;
begin
  if jsonb_typeof(batch) is distinct from 'object' or octet_length(batch::text)>2097152
    or (batch-array['source','key','revision','complete','allow_empty','offers'])<>'{}'::jsonb
    or jsonb_typeof(batch->'offers') is distinct from 'array'
    or jsonb_typeof(batch->'complete') is distinct from 'boolean'
    or (batch ? 'allow_empty' and jsonb_typeof(batch->'allow_empty') is distinct from 'boolean') then
    raise exception 'Invalid batch envelope' using errcode='22023'; end if;
  if jsonb_array_length(batch->'offers')>500 or (jsonb_array_length(batch->'offers')=0 and not coalesce((batch->>'allow_empty')::boolean,false)) then
    raise exception 'Batch must contain 1..500 offers; empty requires explicit allow_empty' using errcode='22023'; end if;
  sid:=private.sync_text(batch,'source',50); k:=private.sync_text(batch,'key',100);
  if jsonb_typeof(batch->'revision') is distinct from 'number' or batch->>'revision' !~ '^[1-9][0-9]{0,14}$' then
    raise exception 'Invalid monotonic revision' using errcode='22023'; end if;
  rev:=(batch->>'revision')::bigint;
  if not exists(select 1 from private.sync_sources where id=sid) then raise exception 'Unknown source' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('dealbot-sync:'||sid,42));
  if exists(select 1 from private.sync_snapshots where source_id=sid and revision=rev) then raise exception 'Revision reserved by snapshot' using errcode='22023'; end if;
  if rev<=(select last_revision from private.sync_sources where id=sid) and not exists(select 1 from private.sync_runs where source_id=sid and batch_key=k) then raise exception 'Stale revision' using errcode='22023'; end if;
  h:=encode(sha256(convert_to(batch::text,'UTF8')),'hex');
  insert into private.sync_runs(source_id,batch_key,revision,payload,payload_hash) values(sid,k,rev,batch,h)
    on conflict(source_id,batch_key) do nothing returning * into r;
  if r.id is null then
    select * into r from private.sync_runs where source_id=sid and batch_key=k;
    if r.payload_hash<>h then raise exception 'Idempotency key reused with different content' using errcode='22023'; end if;
  else insert into private.sync_events(run_id,event) values(r.id,'queued'); end if;
  return jsonb_build_object('id',r.id,'state',r.state,'attempts',r.attempts);
end; $$;


-- Bounded retention: no catalog, personal data or price history deletion.
create function private.sync_cleanup() returns jsonb language plpgsql security invoker set search_path='' as $$
declare ids bigint[]; removed int;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('dealbot-sync:retention',42)) then return '{"state":"busy"}'; end if;
 update private.sync_runs set state='failed',error_code='QUEUE_EXPIRED',finished_at=now() where id in (select id from private.sync_runs where state in ('queued','retry') and created_at<now()-interval '7 days' limit 500);
 update private.sync_runs set payload='{}' where id in (select id from private.sync_runs where state in ('succeeded','superseded','failed') and finished_at<now()-interval '7 days' and payload<>'{}'::jsonb limit 500);
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
revoke all on function private.sync_cleanup() from public,anon,authenticated;
grant execute on function private.sync_cleanup() to service_role;
notify pgrst,'reload schema';
