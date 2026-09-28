-- Fast source-independent index. Private, bounded demand aggregates; no IP/user ID.
create function public.dealbot_search_terms(value text) returns text
language sql immutable parallel safe set search_path='' as $$
 select string_agg(case word
 when 'ecran' then 'monitor' when 'ecrans' then 'monitor' when 'ordinateur' then 'computer' when 'ordinateurs' then 'computer'
 when 'lampe' then 'lamp' when 'lampes' then 'lamp' when 'luminaire' then 'light' when 'luminaires' then 'light'
 when 'perceuse' then 'drill' when 'perceuses' then 'drill' when 'noir' then 'black' when 'noire' then 'black'
 when 'blanc' then 'white' when 'blanche' then 'white' when 'rouge' then 'red' when 'bleu' then 'blue' when 'bleue' then 'blue'
 when 'vert' then 'green' when 'verte' then 'green' when 'telephone' then 'phone' when 'telephones' then 'phone'
 when 'ecouteurs' then 'earbuds' when 'casque' then 'headphones' when 'souris' then 'mouse' when 'clavier' then 'keyboard'
 when 'pour' then null when 'avec' then null when 'the' then null when 'for' then null when 'with' then null else word end,' ' order by n)
 from regexp_split_to_table(trim(regexp_replace(regexp_replace(regexp_replace(translate(lower(coalesce(value,'')), 'éèêëàâäîïôöùûüç','eeeeaaaiioouuuc'), '(\d+)\s*(gb|go)\y','\1gb','g'),'(\d+)\s*(tb|to)\y','\1tb','g'),'[^a-z0-9]+',' ','g')),'\s+') with ordinality as t(word,n) where word<>'';
$$;
create index deals_universal_search_idx on public.deals using gin(to_tsvector('simple'::regconfig,coalesce(public.dealbot_search_terms(name),'') || ' ' || coalesce(commerce->>'gtin','') || ' ' || coalesce(commerce->>'mpn','')));
create function public.search_dealbot(query text,country text default '') returns jsonb
language plpgsql stable security invoker set search_path='' set statement_timeout='2s' as $$
declare q text; terms tsquery; result jsonb;
begin
 if length(query)>120 or length(country)>2 then return jsonb_build_object('offers','[]'::jsonb,'count',0);end if;
 q:=public.dealbot_search_terms(query);
 if coalesce(length(q),0)<2 then return jsonb_build_object('offers','[]'::jsonb,'count',0);end if;
 select to_tsquery('simple',string_agg(quote_literal(word)||':*',' & ')) into terms from (select word from regexp_split_to_table(q,' ') word limit 12) t;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into result from (
  select d.*,m.name as merchant_name,c.slug as category_slug from public.deals d left join public.merchants m on m.id=d.merchant_id left join public.categories c on c.id=d.category_id
  where d.status='active' and (d.starts_at is null or d.starts_at<=now()) and (d.expires_at is null or d.expires_at>now())
   and (country='' or d.commerce->'markets' is null or d.commerce->'markets' ? country)
   and to_tsvector('simple',coalesce(public.dealbot_search_terms(d.name),'') || ' ' || coalesce(d.commerce->>'gtin','') || ' ' || coalesce(d.commerce->>'mpn','')) @@ terms
  order by ts_rank(to_tsvector('simple',coalesce(public.dealbot_search_terms(d.name),'')),terms) desc,d.id limit 50
 ) r;
 return jsonb_build_object('offers',result,'count',jsonb_array_length(result),'count_capped',jsonb_array_length(result)=50);
end;$$;
revoke all on function public.search_dealbot(text,text) from public;
grant execute on function public.search_dealbot(text,text),public.dealbot_search_terms(text) to anon,authenticated,service_role;

create table private.search_demand(
 day date not null default current_date, query text not null check(length(query) between 3 and 80), country text not null,
 searches integer not null default 0, zero_results integer not null default 0, clicked_searches integer not null default 0,
 result_count integer not null default 0, last_seen timestamptz not null default now(),
 last_collected timestamptz,feed_matches integer, primary key(day,query,country)
);
create table private.search_receipts(
 id uuid primary key default gen_random_uuid(),day date not null default current_date,visitor_hash text not null,
 query text not null,country text not null,result_ids bigint[] not null,clicked boolean not null default false,
 created_at timestamptz not null default now(),unique(day,visitor_hash,query,country)
);
create table private.discovery_sources(
 id text primary key references private.sync_sources(id),network text not null,program text not null,
 mode text not null check(mode in ('scheduled_feed','search_api')),enabled boolean not null default false,
 affiliate_authorized boolean not null default false,cache_permitted boolean not null default false,
 scope text not null, last_consumed_at timestamptz
);
insert into private.discovery_sources values('admitad-aliexpress-hot-usd','Admitad','AliExpress WW','scheduled_feed',true,true,true,'Official Hot Products discounted USD 75–100 partition; 100 per allowed category, 1000 total',null);
alter table private.search_demand enable row level security;
alter table private.search_receipts enable row level security;
alter table private.discovery_sources enable row level security;
revoke all on private.search_demand,private.search_receipts,private.discovery_sources from public,anon,authenticated;
grant all on private.search_demand,private.search_receipts,private.discovery_sources to service_role;

-- Intentionally anonymous bounded aggregate ingestion, not account authorization.
create function public.record_search_demand(query text,country text,visitor uuid) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='3s' as $$
declare q text; h text; r jsonb; ids bigint[]; receipt uuid; n integer;
begin
 if visitor is null or length(query)>120 or length(country)>2 or query ~ '[@:/\\]' or lower(query) ~ '\m(password|token|email|adresse)\M' or query ~ '[0-9]{7,}' then return jsonb_build_object('recorded',false);end if;
 q:=public.dealbot_search_terms(query);
 if q is null or length(q) not between 3 and 80 or q !~ '[a-z]' or cardinality(regexp_split_to_array(q,' '))>10 or country !~ '^([A-Z]{2})?$' then return jsonb_build_object('recorded',false);end if;
 h:=md5(current_date::text||visitor::text);
 perform pg_advisory_xact_lock(hashtextextended('search-demand-budget',2026));
 select id into receipt from private.search_receipts s where s.day=current_date and s.visitor_hash=h and s.query=q and s.country=record_search_demand.country;
 if receipt is not null then return jsonb_build_object('recorded',false,'ticket',receipt);end if;
 if (select count(*) from private.search_receipts where day=current_date)>=5000 or (select count(*) from private.search_receipts where day=current_date and visitor_hash=h)>=30 then return jsonb_build_object('recorded',false,'limited',true);end if;
 r:=public.search_dealbot(q,country);n:=(r->>'count')::integer;
 select coalesce(array_agg((x->>'id')::bigint),'{}') into ids from jsonb_array_elements(r->'offers') x;
 insert into private.search_receipts(visitor_hash,query,country,result_ids) values(h,q,country,ids) returning id into receipt;
 insert into private.search_demand(query,country,searches,zero_results,result_count) values(q,country,1,case when n=0 then 1 else 0 end,n)
 on conflict on constraint search_demand_pkey do update set searches=private.search_demand.searches+1,zero_results=private.search_demand.zero_results+excluded.zero_results,result_count=n,last_seen=now();
 return jsonb_build_object('recorded',true,'ticket',receipt,'coverage',n,'discovery','scheduled_feed');
end;$$;
revoke all on function public.record_search_demand(text,text,uuid) from public;
grant execute on function public.record_search_demand(text,text,uuid) to anon,authenticated;

create function public.attribute_search_click(ticket uuid,offer_id bigint) returns boolean
language plpgsql security definer set search_path='' as $$
declare r private.search_receipts;
begin
 select * into r from private.search_receipts where id=ticket and created_at>now()-interval '1 day' for update;
 if r.id is null or r.clicked or not offer_id=any(r.result_ids) then return false;end if;
 -- Attribution only after the existing tracking RPC has written an actual click.
 if not exists(select 1 from public.affiliate_clicks c where c.deal_id=offer_id and c.clicked_at>now()-interval '1 minute' and md5(r.day::text||c.session_id)=r.visitor_hash) then return false;end if;
 update private.search_receipts set clicked=true where id=ticket;
 update private.search_demand set clicked_searches=clicked_searches+1 where day=r.day and query=r.query and country=r.country;
 return true;
end;$$;
revoke all on function public.attribute_search_click(uuid,bigint) from public;
grant execute on function public.attribute_search_click(uuid,bigint) to anon,authenticated;

create function private.collector_demand() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 update private.discovery_sources set last_consumed_at=now() where id='admitad-aliexpress-hot-usd';
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into result from (
  select query,country,least(20,sum(searches+zero_results*2))::integer as weight from private.search_demand
  where day>=current_date-7 and result_count<3 group by query,country having sum(searches)>=3
  order by sum(searches+zero_results*2) desc,query limit 30
 ) r;
 return jsonb_build_object('demands',result);
end;$$;
revoke all on function private.collector_demand() from public,anon,authenticated;

create function public.admin_search_demand() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 return jsonb_build_object('queries',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (select * from private.search_demand order by day desc,searches desc limit 50) r),'sources',(select jsonb_agg(to_jsonb(s)) from private.discovery_sources s));
end;$$;
revoke all on function public.admin_search_demand() from public,anon;
grant execute on function public.admin_search_demand() to authenticated;

-- Extend the existing OIDC-scoped collector RPC without replacing its safeguards.
alter function public.admitad_snapshot(jsonb) rename to admitad_snapshot_core;
create function public.admitad_snapshot(request jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if request->>'op'='demand' then return private.collector_demand();end if;
 if request->>'op'='demand_report' then
  if jsonb_typeof(request->'queries')<>'array' or jsonb_array_length(request->'queries')>30 then raise exception 'Invalid report';end if;
  update private.search_demand d set last_collected=now(),feed_matches=greatest(0,least(1000000,(r->>'matches')::integer))
  from jsonb_array_elements(request->'queries') r where d.query=r->>'query' and d.country=r->>'country' and d.day>=current_date-7;
  return jsonb_build_object('recorded',true);
 end if;
 return public.admitad_snapshot_core(request);
end;$$;
revoke all on function public.admitad_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.admitad_snapshot(jsonb),private.collector_demand() to service_role;

create function private.prune_search_demand() returns void language plpgsql security invoker set search_path='' as $$
begin
 delete from private.search_receipts where created_at<now()-interval '1 day';
 delete from private.search_demand where day<current_date-30;
end;$$;
revoke all on function private.prune_search_demand() from public,anon,authenticated;
select cron.schedule('dealbot-demand-retention','31 * * * *','select private.prune_search_demand()');
