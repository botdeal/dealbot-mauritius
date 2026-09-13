-- Controlled 5000-offer load/recovery scenario. All data and test triggers rollback.
begin;
set local statement_timeout='40s';
select set_config('dealbot.load_source','fixture-load-'||substr(md5(gen_random_uuid()::text),1,16),true);
create temporary table load_results(step text,seconds numeric,result jsonb);
create function pg_temp.load_snapshot(rev int,n int,changed int default 0) returns jsonb language plpgsql as $$
declare m jsonb; receipt jsonb; digests jsonb:='[]'; rows jsonb; pages int:=(n+249)/250; j int; started timestamptz:=clock_timestamp(); out jsonb;
begin
 m:=public.sync_snapshot(jsonb_build_object('op','begin','source',current_setting('dealbot.load_source'),'key','load-'||rev,'revision',rev,'pages',pages,'offers',n));
 for j in 0..pages-1 loop
  select jsonb_agg(jsonb_build_object('external_id','offer-'||i,'name','Load fixture '||i,'description',repeat(md5(i::text),70),
   'price',case when i<=changed then 80 else 100 end,'old_price',200,'currency','MUR','availability','in_stock','original_url','https://example.com/'||i,
   'merchant',jsonb_build_object('external_id','merchant-'||(i%10),'name','Load merchant '||(i%10),'website_url','https://example.com'),
   'category',jsonb_build_object('external_id','cat-'||(i%5),'name_fr','Load category '||(i%5),'name_en','Load category '||(i%5))) order by i) into rows
   from generate_series(j*250+1,least(n,(j+1)*250)) i;
  receipt:=public.sync_snapshot(jsonb_build_object('op','chunk','id',m->>'id','page',j,'offers',rows));
  digests:=digests||jsonb_build_array(receipt->>'digest');
 end loop;
 m:=public.sync_snapshot(jsonb_build_object('op','seal','id',m->>'id','digests',digests));
 out:=public.sync_process((m->>'run_id')::bigint);
 insert into load_results values('revision-'||rev,extract(epoch from clock_timestamp()-started),out);
 return out;
end; $$;
create function pg_temp.load_failure() returns trigger language plpgsql as $$
begin
 if new.sync_source=current_setting('dealbot.load_source',true) and new.sync_external_id='offer-250'
  and current_setting('dealbot.load_fail',true)='yes' then raise exception 'Fixture serialization failure' using errcode='40001'; end if;
 return new;
end; $$;
create trigger load_failure before update on public.deals for each row execute function pg_temp.load_failure();
do $$
declare sid text:=current_setting('dealbot.load_source');r jsonb; rid bigint;
begin
 insert into private.sync_sources(id) values(sid);
 r:=pg_temp.load_snapshot(1,5000);
 if r->>'state'<>'succeeded' or (r#>>'{result,created}')::int<>5000 then raise exception 'Load import failed: %',r; end if;
 r:=pg_temp.load_snapshot(2,5000);
 if (r#>>'{result,unchanged}')::int<>5000 then raise exception 'No-op load failed'; end if;
 r:=pg_temp.load_snapshot(3,4500,500);
 if (r#>>'{result,updated}')::int<>500 or (r#>>'{result,expired}')::int<>500 then raise exception 'Load update/reconcile failed'; end if;
 perform set_config('dealbot.load_fail','yes',true);
 r:=pg_temp.load_snapshot(4,4500,1000);rid:=(r->>'id')::bigint;
 if r->>'state'<>'retry' then raise exception 'Transient load error not retried: %',r; end if;
 if (select count(*) from public.deals where sync_source=sid and price=80)<>500 then raise exception 'Partial writes after failure'; end if;
 perform set_config('dealbot.load_fail','no',true);
 update private.sync_runs set next_attempt_at=now() where id=rid;
 r:=public.sync_process(rid);
 if r->>'state'<>'succeeded' or (r->>'attempts')::int<>2 then raise exception 'Load recovery failed'; end if;
 if (select count(*) from public.deals where sync_source=sid)<>5000 then raise exception 'Duplicate/missing load deals'; end if;
 if (select count(*) from public.price_history h join public.deals d on d.id=h.deal_id where d.sync_source=sid)<>6000 then raise exception 'Wrong load history'; end if;
 if (select count(*) from public.merchants where sync_source=sid)<>10 or (select count(*) from public.categories where sync_source=sid)<>5 then raise exception 'Entity deduplication failed'; end if;
 insert into load_results values('verified',0,jsonb_build_object('offers',5000,'merchants',10,'categories',5,'history',6000,'expired',500,
 'payload_bytes',(select sum(octet_length(payload::text)) from private.sync_runs where source_id=sid),
 'stored_run_bytes',(select sum(pg_column_size(payload)) from private.sync_runs where source_id=sid)));
end; $$;
select jsonb_agg(to_jsonb(load_results)) as load_report from load_results;
rollback;
