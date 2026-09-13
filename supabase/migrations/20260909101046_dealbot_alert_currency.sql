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
      and (a->>'currency' is null or a->>'currency' = d.currency)
  on conflict (user_id, deal_id) do update set target_price = excluded.target_price, currency = excluded.currency
    where price_alerts.target_price is distinct from excluded.target_price
      or price_alerts.currency is distinct from excluded.currency;
end;
$$;
revoke all on function public.save_personal_state(bigint[],bigint[],jsonb) from public, anon;
grant execute on function public.save_personal_state(bigint[],bigint[],jsonb) to authenticated;
