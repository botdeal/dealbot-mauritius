-- Optional factual identity/delivery metadata. Existing offers stay unchanged.
-- Only existing admin/service write permissions on deals apply; no new grants.
alter table public.deals add column if not exists commerce jsonb;
alter table public.deals add constraint deals_commerce_object check (
 commerce is null or (
  jsonb_typeof(commerce)='object'
  and octet_length(commerce::text)<=8192
  and commerce - array['verified','variant_complete','variant','gtin','brand','mpn','markets','shipping']::text[] = '{}'::jsonb
  and (not commerce ? 'variant' or jsonb_typeof(commerce->'variant')='object')
  and (not commerce ? 'markets' or jsonb_typeof(commerce->'markets')='array')
  and (not commerce ? 'shipping' or jsonb_typeof(commerce->'shipping')='object')
  and (not commerce ? 'verified' or jsonb_typeof(commerce->'verified')='boolean')
  and (not commerce ? 'variant_complete' or jsonb_typeof(commerce->'variant_complete')='boolean')
 )
);
comment on column public.deals.commerce is 'Public factual product identity/market metadata. No secrets. verified and variant_complete require source-backed evidence; null means unknown. Never infer equivalence from names.';
