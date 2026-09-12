-- Source-neutral, bounded, atomic imports. Only service_role and database owner.
grant usage on schema private to service_role;
create table private.sync_sources (
  id text primary key check (id ~ '^[a-z][a-z0-9_-]{0,49}$'),
  enabled boolean not null default true,
  fixture boolean not null default true,
  auto_publish boolean not null default false,
  allowed_hosts text[] not null default '{}',
  last_revision bigint not null default 0,
  check (not fixture or not auto_publish),
  check (not auto_publish or cardinality(allowed_hosts)>0)
);
create table private.sync_runs (
  id bigint generated always as identity primary key,
  source_id text not null references private.sync_sources(id),
  batch_key text not null check(length(batch_key) between 1 and 100),
  revision bigint not null check(revision>0),
  payload jsonb not null,
  payload_hash text not null,
  state text not null default 'queued' check(state in ('queued','retry','succeeded','failed','superseded')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text,
  result jsonb,
  unique(source_id,batch_key), unique(source_id,revision)
);
create index sync_due_idx on private.sync_runs(next_attempt_at,id) where state in ('queued','retry');
create table private.sync_events (
  id bigint generated always as identity primary key,
  run_id bigint not null references private.sync_runs(id),
  at timestamptz not null default now(),
  event text not null,
  details jsonb not null default '{}'
);
create index sync_events_run_idx on private.sync_events(run_id,id);
alter table private.sync_sources enable row level security;
alter table private.sync_runs enable row level security;
alter table private.sync_events enable row level security;
revoke all on private.sync_sources,private.sync_runs,private.sync_events from public,anon,authenticated;
grant all on private.sync_sources,private.sync_runs,private.sync_events to service_role;
grant usage,select on sequence private.sync_runs_id_seq,private.sync_events_id_seq to service_role;

alter table public.deals add column sync_source text references private.sync_sources(id),
  add column sync_external_id text,
  add column sync_hash text,
  add column sync_revision bigint,
  add column score_method text not null default 'editorial',
  add column score_details jsonb;
create unique index deals_sync_identity on public.deals(sync_source,sync_external_id) where sync_source is not null;
alter table public.merchants add column sync_source text references private.sync_sources(id), add column sync_external_id text;
create unique index merchants_sync_identity on public.merchants(sync_source,sync_external_id) where sync_source is not null;
alter table public.categories add column sync_source text references private.sync_sources(id), add column sync_external_id text;
create unique index categories_sync_identity on public.categories(sync_source,sync_external_id) where sync_source is not null;

create function private.sync_text(v jsonb, field text, max_length integer) returns text
language plpgsql immutable set search_path='' as $$
declare s text;
begin
  if jsonb_typeof(v->field) is distinct from 'string' then raise exception 'Missing/invalid text field: %',field using errcode='22023'; end if;
  s:=btrim(v->>field);
  if length(s) not between 1 and max_length or s ~ '[[:cntrl:]]' then raise exception 'Invalid text field: %',field using errcode='22023'; end if;
  return s;
end; $$;
create function private.sync_url(v text) returns text language plpgsql immutable set search_path='' as $$
begin
  if v is null or length(v)>2048 or v ~ '[[:space:]\\]' or v !~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]*(:443)?([/?#]|$)'
    or split_part(split_part(substring(v from 9),'/',1),'?',1) ~ '@' then
    raise exception 'Invalid HTTPS URL' using errcode='22023';
  end if;
  return v;
end; $$;
create function private.sync_normalize(o jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare p numeric; oldp numeric; c text; a text; start_at timestamptz; end_at timestamptz; m jsonb; cat jsonb; n jsonb;
begin
  if jsonb_typeof(o) is distinct from 'object' or (o - array['external_id','name','description','image_url','price','old_price','currency','availability','original_url','affiliate_url','starts_at','expires_at','merchant','category']) <> '{}'::jsonb then
    raise exception 'Unknown offer fields' using errcode='22023'; end if;
  if jsonb_typeof(o->'price') is distinct from 'number' then raise exception 'Invalid price' using errcode='22023'; end if;
  p:=(o->>'price')::numeric;
  if p<0 or p>999999999999.99 or p<>round(p,2) then raise exception 'Invalid price precision/range' using errcode='22023'; end if;
  if coalesce(o->'old_price','null')<>'null'::jsonb then
    if jsonb_typeof(o->'old_price')<>'number' then raise exception 'Invalid old price' using errcode='22023'; end if;
    oldp:=(o->>'old_price')::numeric;
    if oldp<p or oldp>999999999999.99 or oldp<>round(oldp,2) then raise exception 'Invalid reference price' using errcode='22023'; end if;
  end if;
  c:=upper(private.sync_text(o,'currency',3));
  if c not in ('MUR','EUR','USD','GBP') then raise exception 'Unsupported currency' using errcode='22023'; end if;
  a:=lower(private.sync_text(o,'availability',20));
  if a not in ('in_stock','limited','out_of_stock','unknown') then raise exception 'Invalid stock' using errcode='22023'; end if;
  if o->>'starts_at' is not null then
    if o->>'starts_at' !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then raise exception 'Timezone required' using errcode='22023'; end if;
    start_at:=(o->>'starts_at')::timestamptz;
  end if;
  if o->>'expires_at' is not null then
    if o->>'expires_at' !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then raise exception 'Timezone required' using errcode='22023'; end if;
    end_at:=(o->>'expires_at')::timestamptz;
  end if;
  if start_at>=end_at then raise exception 'Reversed dates' using errcode='22023'; end if;
  m:=o->'merchant'; cat:=o->'category';
  if jsonb_typeof(m) is distinct from 'object' or (m-array['external_id','name','website_url'])<>'{}'::jsonb
    or jsonb_typeof(cat) is distinct from 'object' or (cat-array['external_id','name_fr','name_en'])<>'{}'::jsonb then
    raise exception 'Invalid merchant/category fields' using errcode='22023'; end if;
  n:=jsonb_build_object('external_id',private.sync_text(o,'external_id',150),'name',private.sync_text(o,'name',250),
    'price',p,'old_price',oldp,'currency',c,'availability',a,'original_url',private.sync_url(o->>'original_url'),
    'starts_at',start_at,'expires_at',end_at,
    'merchant',jsonb_build_object('external_id',private.sync_text(m,'external_id',150),'name',private.sync_text(m,'name',150),'website_url',private.sync_url(m->>'website_url')),
    'category',jsonb_build_object('external_id',private.sync_text(cat,'external_id',150),'name_fr',private.sync_text(cat,'name_fr',150),'name_en',private.sync_text(cat,'name_en',150)));
  if o->>'affiliate_url' is not null then n:=n||jsonb_build_object('affiliate_url',private.sync_url(o->>'affiliate_url')); end if;
  if o->>'image_url' is not null then n:=n||jsonb_build_object('image_url',private.sync_url(o->>'image_url')); end if;
  if o->>'description' is not null then n:=n||jsonb_build_object('description',private.sync_text(o,'description',5000)); end if;
  return n;
end; $$;

-- Transparent quality score v1: discount 0..50; stock 0/5/15/20;
-- description 5; image 5; verified merchant 20. Not a price prediction.
create function private.sync_score(o jsonb, verified boolean) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('method','automatic-v1','discount',d,'stock',s,'completeness',c,'trust',t,'total',d+s+c+t)
  from (select case when (o->>'old_price')::numeric>0 then least(50,round(100*(1-(o->>'price')::numeric/(o->>'old_price')::numeric))::int) else 0 end d,
    case o->>'availability' when 'in_stock' then 20 when 'limited' then 15 when 'unknown' then 5 else 0 end s,
    (case when o->>'description' is not null then 5 else 0 end)+(case when o->>'image_url' is not null then 5 else 0 end) c,
    case when verified then 20 else 0 end t) scores;
$$;

create function public.sync_enqueue(batch jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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
  h:=encode(sha256(convert_to(batch::text,'UTF8')),'hex');
  insert into private.sync_runs(source_id,batch_key,revision,payload,payload_hash) values(sid,k,rev,batch,h)
    on conflict(source_id,batch_key) do nothing returning * into r;
  if r.id is null then
    select * into r from private.sync_runs where source_id=sid and batch_key=k;
    if r.payload_hash<>h then raise exception 'Idempotency key reused with different content' using errcode='22023'; end if;
  else insert into private.sync_events(run_id,event) values(r.id,'queued'); end if;
  return jsonb_build_object('id',r.id,'state',r.state,'attempts',r.attempts);
end; $$;

create function public.sync_process(run_id bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
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
    for raw in select value from jsonb_array_elements(r.payload->'offers') loop
      o:=private.sync_normalize(raw);
      if exists(select 1 from jsonb_array_elements(normalized) p where
        (p#>>'{merchant,external_id}'=o#>>'{merchant,external_id}' and p->'merchant'<>o->'merchant') or
        (p#>>'{category,external_id}'=o#>>'{category,external_id}' and p->'category'<>o->'category')) then
        raise exception 'Conflicting shared merchant/category in batch' using errcode='22023';
      end if;
      if o->>'external_id'=any(seen) then raise exception 'Duplicate external_id inside batch' using errcode='22023'; end if;
      seen:=array_append(seen,o->>'external_id');
      if src.auto_publish then
        foreach host in array array[o->>'original_url',coalesce(o->>'affiliate_url',o->>'original_url')] loop
          if not (lower(split_part(split_part(split_part(substring(host from 9),'/',1),'?',1),'#',1))=any(src.allowed_hosts)) then
            raise exception 'Destination host not allowed for source' using errcode='22023'; end if;
        end loop;
      end if;
      normalized:=normalized||jsonb_build_array(o);
    end loop;
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

create function public.sync_status(run_id bigint) returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object('id',id,'source',source_id,'state',state,'attempts',attempts,'next_attempt_at',next_attempt_at,'error_code',error_code,'result',result) from private.sync_runs where id=run_id;
$$;
create function private.sync_tick() returns jsonb language plpgsql security invoker set search_path='' as $$
declare r record; processed int:=0; expired int:=0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('dealbot-sync:tick',42)) then return '{"state":"busy"}'; end if;
  for r in select q.id from private.sync_runs q join private.sync_sources s on s.id=q.source_id
    where q.state in ('queued','retry') and q.next_attempt_at<=now() and s.enabled order by q.id limit 5 loop
    perform public.sync_process(r.id); processed:=processed+1;
  end loop;
  update public.deals set status='expired' where sync_source is not null and status in ('active','draft') and expires_at<=now();
  get diagnostics expired=row_count;
  return jsonb_build_object('processed',processed,'expired',expired);
end; $$;

-- Automatic scores cannot silently become editorial numbers through the admin UI.
create function private.protect_automatic_score() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is not null and old.score_method='automatic-v1' and new.dealbot_score is distinct from old.dealbot_score then
    raise exception 'Automatic score is managed by Autopilot' using errcode='22023';
  end if;
  return new;
end; $$;
create trigger protect_automatic_score before update of dealbot_score on public.deals for each row execute function private.protect_automatic_score();
revoke all on function private.protect_automatic_score() from public,anon,authenticated;

create function public.sync_retry(run_id bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r private.sync_runs;
begin
  select * into r from private.sync_runs where id=run_id for update;
  if r.state<>'failed' or not (left(r.error_code,2) in ('08','40','53','57') or r.error_code='55P03') then
    raise exception 'Only transient dead letters may be retried; invalid data needs a new batch' using errcode='22023';
  end if;
  update private.sync_runs set state='retry',attempts=0,next_attempt_at=now(),finished_at=null where id=r.id;
  insert into private.sync_events(run_id,event) values(r.id,'manual_retry');
  return public.sync_status(r.id);
end; $$;
revoke all on function public.sync_retry(bigint) from public,anon,authenticated;
grant execute on function public.sync_retry(bigint) to service_role;
create function public.sync_health() returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object('deals',(select count(*) from public.deals),'merchants',(select count(*) from public.merchants),
    'categories',(select count(*) from public.categories),'sources',(select count(*) from private.sync_sources),
    'pending',(select count(*) from private.sync_runs where state in ('queued','retry')));
$$;
revoke all on function public.sync_health() from public,anon,authenticated;
grant execute on function public.sync_health() to service_role;

revoke all on function private.sync_text(jsonb,text,integer),private.sync_url(text),private.sync_normalize(jsonb),private.sync_score(jsonb,boolean),private.sync_tick() from public,anon,authenticated;
grant execute on function private.sync_text(jsonb,text,integer),private.sync_url(text),private.sync_normalize(jsonb),private.sync_score(jsonb,boolean),private.sync_tick() to service_role;
revoke all on function public.sync_enqueue(jsonb),public.sync_process(bigint),public.sync_status(bigint) from public,anon,authenticated;
grant execute on function public.sync_enqueue(jsonb),public.sync_process(bigint),public.sync_status(bigint) to service_role;
notify pgrst,'reload schema';
