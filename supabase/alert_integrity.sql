-- Only the database decides whether an alert has been triggered.
revoke update on public.price_alerts from authenticated;
grant update(target_price,currency) on public.price_alerts to authenticated;
create or replace function public.record_deal_price() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or old.price is distinct from new.price
    or old.old_price is distinct from new.old_price
    or old.currency is distinct from new.currency
    or old.availability is distinct from new.availability then
    insert into public.price_history(deal_id,price,old_price,currency,availability)
    values(new.id,new.price,new.old_price,new.currency,new.availability);
  end if;
  return new;
end;
$$;
revoke all on function public.record_deal_price() from public,anon,authenticated;
notify pgrst,'reload schema';
