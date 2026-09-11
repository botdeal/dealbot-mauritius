-- Additive integration for the existing DealBot database. No catalog seeds.
-- Applied through Supabase migration history as dealbot_production_integration.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- Keep role lookup outside the exposed API; retain the existing wrapper for compatibility.
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;
create or replace function public.is_admin() returns boolean
language sql stable security invoker set search_path = '' as $$ select private.is_admin(); $$;

-- TRUNCATE is not protected by RLS. Remove unnecessary default privileges.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url, preferred_language, preferred_currency) on public.profiles to authenticated;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists deals_public_read on public.deals;
create policy deals_public_read on public.deals for select to anon, authenticated using (
  private.is_admin() or (status = 'active' and (starts_at is null or starts_at <= now())
  and (expires_at is null or expires_at > now()))
);

-- Atomic personal-state persistence under caller RLS, never a supplied user ID.
create or replace function public.save_personal_state(favorite_ids bigint[], comparison_ids bigint[], alerts jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if favorite_ids is null or comparison_ids is null or alerts is null or jsonb_typeof(alerts) <> 'array'
    or cardinality(favorite_ids) > 500 or cardinality(comparison_ids) > 4 or jsonb_array_length(alerts) > 100 then
    raise exception 'Invalid collection size' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  delete from public.favorites where user_id = uid and not (deal_id = any(favorite_ids));
  insert into public.favorites (user_id, deal_id) select uid, unnest(favorite_ids) on conflict do nothing;
  delete from public.compare_items where user_id = uid and not (deal_id = any(comparison_ids));
  insert into public.compare_items (user_id, deal_id) select uid, unnest(comparison_ids) on conflict do nothing;
  delete from public.price_alerts where user_id = uid and deal_id not in
    (select (a->>'productId')::bigint from jsonb_array_elements(alerts) a);
  insert into public.price_alerts (user_id, deal_id, target_price, currency)
    select uid, (a->>'productId')::bigint, (a->>'targetPrice')::numeric, d.currency
    from jsonb_array_elements(alerts) a join public.deals d on d.id = (a->>'productId')::bigint
  on conflict (user_id, deal_id) do update set target_price = excluded.target_price, currency = excluded.currency
    where price_alerts.target_price is distinct from excluded.target_price;
end;
$$;
revoke all on function public.save_personal_state(bigint[],bigint[],jsonb) from public, anon;
grant execute on function public.save_personal_state(bigint[],bigint[],jsonb) to authenticated;

create or replace function private.evaluate_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d public.deals;
begin
  select * into d from public.deals where id = new.deal_id;
  if d.id is null or d.status <> 'active' or (d.starts_at is not null and d.starts_at > now())
    or (d.expires_at is not null and d.expires_at <= now()) or new.currency <> d.currency then
    raise exception 'Offer unavailable or currency mismatch' using errcode = '22023';
  end if;
  new.status := case when d.price <= new.target_price and d.availability in ('in_stock','limited')
    then 'triggered'::public.alert_status else 'active'::public.alert_status end;
  new.triggered_at := case when new.status = 'triggered' then now() else null end;
  return new;
end;
$$;
revoke all on function private.evaluate_alert() from public, anon, authenticated;
create trigger evaluate_price_alert before insert or update of target_price, deal_id, currency
on public.price_alerts for each row execute function private.evaluate_alert();

create or replace function private.trigger_price_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' and new.availability in ('in_stock','limited')
    and (new.starts_at is null or new.starts_at <= now()) and (new.expires_at is null or new.expires_at > now()) then
    update public.price_alerts set status = 'triggered', triggered_at = now()
    where deal_id = new.id and status = 'active' and currency = new.currency and target_price >= new.price;
  end if;
  return new;
end;
$$;
revoke all on function private.trigger_price_alerts() from public, anon, authenticated;
create trigger trigger_price_alerts after update of price, availability, status on public.deals
for each row execute function private.trigger_price_alerts();

-- Admin writes are audited automatically, including writes made in the dashboard.
create or replace function private.audit_catalog() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_audit_logs(admin_id, action, entity_type, entity_id, details)
  values(auth.uid(), lower(tg_op), tg_table_name, new.id::text,
    jsonb_build_object('status', to_jsonb(new)->>'status'));
  return new;
end;
$$;
revoke all on function private.audit_catalog() from public, anon, authenticated;
create trigger audit_deal after insert or update on public.deals for each row execute function private.audit_catalog();
create trigger audit_merchant after insert or update on public.merchants for each row execute function private.audit_catalog();

-- Validated tracking with no supplied user identifier or arbitrary destination.
drop policy if exists affiliate_click_public_insert on public.affiliate_clicks;
create policy affiliate_click_public_insert on public.affiliate_clicks for insert to anon, authenticated with check (
  user_id is not distinct from (select auth.uid()) and length(session_id) between 16 and 80
  and source in ('home','explore','deal','compare','favorites','intelligence')
  and referrer is null and clicked_at between now() - interval '1 minute' and now() + interval '1 minute'
  and exists (select 1 from public.deals d where d.id = deal_id and d.merchant_id = affiliate_clicks.merchant_id
    and d.status = 'active' and (d.starts_at is null or d.starts_at <= now())
    and (d.expires_at is null or d.expires_at > now()))
);
create index affiliate_click_session_time_idx on public.affiliate_clicks(session_id, clicked_at desc);
create or replace function private.limit_clicks() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(new.user_id::text,new.session_id), 1));
  if (select count(*) from public.affiliate_clicks where session_id = new.session_id and clicked_at > now() - interval '1 minute') >= 30 then
    raise exception 'Too many clicks' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.limit_clicks() from public, anon, authenticated;
create trigger limit_clicks before insert on public.affiliate_clicks for each row execute function private.limit_clicks();

create or replace function public.track_deal_click(offer_id bigint, browser_session text, page_source text)
returns text language plpgsql security invoker set search_path = '' as $$
declare d public.deals; destination text;
begin
  select * into d from public.deals where id = offer_id and status = 'active'
    and (starts_at is null or starts_at <= now()) and (expires_at is null or expires_at > now());
  destination := coalesce(nullif(d.affiliate_url,''), d.original_url);
  if destination is null or destination !~ '^https://[^/@[:space:]]+([/?#]|$)' then
    raise exception 'Merchant link unavailable' using errcode = '22023';
  end if;
  insert into public.affiliate_clicks(deal_id,merchant_id,user_id,session_id,source)
  values(d.id,d.merchant_id,auth.uid(),browser_session,page_source);
  return destination;
end;
$$;
revoke all on function public.track_deal_click(bigint,text,text) from public;
grant execute on function public.track_deal_click(bigint,text,text) to anon, authenticated;
notify pgrst, 'reload schema';

create or replace function public.admin_save_deal(payload jsonb) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare merchant bigint; category bigint; offer bigint; url text := payload->>'url'; offer_status public.deal_status;
begin
  if not private.is_admin() then raise exception 'Admin required' using errcode = '42501'; end if;
  offer_status := coalesce(payload->>'status','draft')::public.deal_status;
  if length(trim(payload->>'name')) not between 1 and 250 or length(trim(payload->>'store')) not between 1 and 150
    or payload->>'name' is null or payload->>'store' is null
    or (coalesce(url,'') <> '' and url !~ '^https://[^/@[:space:]]+([/?#]|$)')
    or (offer_status = 'active' and coalesce(url,'') = '')
    or coalesce(payload->>'currency','MUR') not in ('MUR','EUR','USD','GBP') then
    raise exception 'Invalid offer fields or missing HTTPS merchant link' using errcode = '22023';
  end if;
  select id into category from public.categories where slug = payload->>'category' and is_active;
  if category is null then raise exception 'Unknown category' using errcode = '22023'; end if;
  insert into public.merchants(name,slug)
    values(trim(payload->>'store'), 'merchant-' || md5(lower(trim(payload->>'store'))))
    on conflict(slug) do update set name = excluded.name returning id into merchant;
  if coalesce(payload->>'id','') = '' then
    insert into public.deals(name,slug,merchant_id,category_id,price,old_price,currency,availability,description,
      original_url,dealbot_score,status,image_url,expires_at)
    values(payload->>'name','deal-'||gen_random_uuid()::text,merchant,category,(payload->>'price')::numeric,
      nullif(payload->>'oldPrice','')::numeric,coalesce(payload->>'currency','MUR'),(payload->>'availability')::public.stock_status,
      payload->>'description',url,(payload->>'score')::int,offer_status,nullif(payload->>'imageUrl',''),nullif(payload->>'expiresAt','')::timestamptz)
    returning id into offer;
  else
    update public.deals set name=payload->>'name',merchant_id=merchant,category_id=category,price=(payload->>'price')::numeric,
      old_price=nullif(payload->>'oldPrice','')::numeric,currency=coalesce(payload->>'currency','MUR'),
      availability=(payload->>'availability')::public.stock_status,description=payload->>'description',
      original_url=url,dealbot_score=(payload->>'score')::int,status=offer_status,image_url=nullif(payload->>'imageUrl',''),
      expires_at=nullif(payload->>'expiresAt','')::timestamptz
    where id=(payload->>'id')::bigint returning id into offer;
    if offer is null then raise exception 'Offer not found' using errcode='22023'; end if;
  end if;
  return offer;
end;
$$;
revoke all on function public.admin_save_deal(jsonb) from public, anon;
grant execute on function public.admin_save_deal(jsonb) to authenticated;
