-- Preserve existing merchants and expose explicit, independently editable links.
-- Optional fields remain backward-compatible with the 618e7fc client.
create or replace function public.admin_save_deal(payload jsonb) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  merchant bigint; category bigint; offer bigint; existing public.deals;
  url text := nullif(trim(payload->>'url'),''); affiliate text; image text := nullif(trim(payload->>'imageUrl'),'');
  offer_status public.deal_status; starts timestamptz; expires timestamptz; featured boolean; link text;
  https_pattern constant text := '^https://([a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[0-9a-fA-F:]+\])(:[0-9]{1,5})?([/?#][^[:space:]]*)?$';
begin
  if not private.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  if coalesce(payload->>'id','') <> '' then
    select * into existing from public.deals where id=(payload->>'id')::bigint for update;
    if not found then raise exception 'Offer not found' using errcode='22023'; end if;
  end if;
  affiliate := case when payload ? 'affiliateUrl' then nullif(trim(payload->>'affiliateUrl'),'') else existing.affiliate_url end;
  starts := case when payload ? 'startsAt' then nullif(payload->>'startsAt','')::timestamptz else existing.starts_at end;
  expires := nullif(payload->>'expiresAt','')::timestamptz;
  featured := case when payload ? 'featured' then coalesce((payload->>'featured')::boolean,false) else coalesce(existing.is_featured,false) end;
  offer_status := coalesce(payload->>'status','draft')::public.deal_status;
  if payload->>'name' is null or payload->>'store' is null
    or length(trim(payload->>'name')) not between 1 and 250 or length(trim(payload->>'store')) not between 1 and 150
    or (offer_status='active' and coalesce(affiliate,url) is null)
    or coalesce(payload->>'currency','MUR') not in ('MUR','EUR','USD','GBP')
    or (starts is not null and expires is not null and starts >= expires) then
    raise exception 'Invalid offer fields, publication dates or missing HTTPS merchant link' using errcode='22023';
  end if;
  foreach link in array array[url,affiliate,image] loop
    if link is not null and (link !~ https_pattern or position(chr(92) in link)>0) then
      raise exception 'Use a valid HTTPS URL without credentials or whitespace' using errcode='22023';
    end if;
  end loop;
  select id into category from public.categories where slug=payload->>'category' and is_active;
  if category is null then raise exception 'Unknown category' using errcode='22023'; end if;
  -- Editing a merchant's existing offer must not replace its identity/verification.
  if existing.merchant_id is not null then
    select id into merchant from public.merchants where id=existing.merchant_id
      and lower(trim(name))=lower(trim(payload->>'store'));
  end if;
  if merchant is null then
    insert into public.merchants(name,slug)
      values(trim(payload->>'store'),'merchant-'||md5(lower(trim(payload->>'store'))))
      on conflict(slug) do update set name=excluded.name returning id into merchant;
  end if;
  if existing.id is null then
    insert into public.deals(name,slug,merchant_id,category_id,price,old_price,currency,availability,description,
      original_url,affiliate_url,dealbot_score,status,image_url,starts_at,expires_at,is_featured)
    values(trim(payload->>'name'),'deal-'||gen_random_uuid()::text,merchant,category,(payload->>'price')::numeric,
      nullif(payload->>'oldPrice','')::numeric,coalesce(payload->>'currency','MUR'),(payload->>'availability')::public.stock_status,
      payload->>'description',url,affiliate,(payload->>'score')::int,offer_status,image,starts,expires,featured)
    returning id into offer;
  else
    update public.deals set name=trim(payload->>'name'),merchant_id=merchant,category_id=category,
      price=(payload->>'price')::numeric,old_price=nullif(payload->>'oldPrice','')::numeric,currency=coalesce(payload->>'currency','MUR'),
      availability=(payload->>'availability')::public.stock_status,description=payload->>'description',
      original_url=url,affiliate_url=affiliate,dealbot_score=(payload->>'score')::int,status=offer_status,image_url=image,
      starts_at=starts,expires_at=expires,is_featured=featured
    where id=existing.id returning id into offer;
  end if;
  return offer;
end;
$$;
revoke all on function public.admin_save_deal(jsonb) from public,anon;
grant execute on function public.admin_save_deal(jsonb) to authenticated;
