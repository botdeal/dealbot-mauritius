-- Retrieval conflict checks; never use inferred title attributes as merge evidence.
create function public.dealbot_query_variant_matches(title text,query text) returns boolean
language plpgsql immutable parallel safe set search_path='' as $$
declare a text:=public.dealbot_search_terms(title); b text:=public.dealbot_search_terms(query); pattern text; x text; y text;
begin
 foreach pattern in array array['\m\d+(gb|tb)\M','\m(iphone|ipad|galaxy|pixel)\s+[a-z]?\d+[a-z]?(\s+(pro|max|plus|mini|ultra))?(\s+(max|plus))?\M','\m(black|white|red|blue|green|pink|purple|silver|gold)\M'] loop
  x:=substring(a from pattern); y:=substring(b from pattern);
  -- substring with captures would return only the first group; wrap the full match.
  x:=(regexp_match(a,'('||pattern||')'))[1];y:=(regexp_match(b,'('||pattern||')'))[1];
  if x is not null and y is not null and x<>y then return false;end if;
 end loop;
 return true;
end;$$;
revoke all on function public.dealbot_query_variant_matches(text,text) from public;
grant execute on function public.dealbot_query_variant_matches(text,text) to anon,authenticated,service_role;
create or replace function public.search_dealbot(query text,country text default '') returns jsonb
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
   and public.dealbot_query_variant_matches(d.name,q)
   and to_tsvector('simple',coalesce(public.dealbot_search_terms(d.name),'') || ' ' || coalesce(d.commerce->>'gtin','') || ' ' || coalesce(d.commerce->>'mpn','')) @@ terms
  order by ts_rank(to_tsvector('simple',coalesce(public.dealbot_search_terms(d.name),'')),terms) desc,d.id limit 50
 ) r;
 return jsonb_build_object('offers',result,'count',jsonb_array_length(result),'count_capped',jsonb_array_length(result)=50);
end;$$;
