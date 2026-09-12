-- Read/write under the caller's RLS. Lock matches save_personal_state.
create or replace function private.personal_snapshot() returns jsonb
language sql security invoker set search_path='' as $$
  select jsonb_build_object(
    'favorites',coalesce((select jsonb_agg(deal_id order by deal_id) from public.favorites where user_id=auth.uid()),'[]'::jsonb),
    'compare',coalesce((select jsonb_agg(deal_id order by deal_id) from public.compare_items where user_id=auth.uid()),'[]'::jsonb),
    'alerts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'productId',deal_id,'targetPrice',target_price,'currency',currency,'status',status) order by deal_id)
      from public.price_alerts where user_id=auth.uid() and status::text<>'deleted'),'[]'::jsonb)
  );
$$;
revoke all on function private.personal_snapshot() from public,anon;
grant execute on function private.personal_snapshot() to authenticated;

create or replace function public.save_personal_state_checked(favorite_ids bigint[],comparison_ids bigint[],alerts jsonb,expected_state jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_state jsonb; field text; expected_values jsonb; current_values jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if expected_state is null or jsonb_typeof(expected_state)<>'object' then
    raise exception 'Expected account state required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  current_state := private.personal_snapshot();
  foreach field in array array['favorites','compare','alerts'] loop
    if jsonb_typeof(expected_state->field) is distinct from 'array' then
      raise exception 'Invalid expected account state' using errcode='22023';
    end if;
    if field='alerts' then
      -- Server-generated IDs/status may change when a price falls; compare user choices only.
      select coalesce(jsonb_agg(jsonb_build_object('productId',(a->>'productId')::bigint,'targetPrice',(a->>'targetPrice')::numeric,'currency',a->>'currency') order by (a->>'productId')::bigint),'[]'::jsonb)
        into expected_values from jsonb_array_elements(expected_state->field) a;
      select coalesce(jsonb_agg(jsonb_build_object('productId',(a->>'productId')::bigint,'targetPrice',(a->>'targetPrice')::numeric,'currency',a->>'currency') order by (a->>'productId')::bigint),'[]'::jsonb)
        into current_values from jsonb_array_elements(current_state->field) a;
    else
      select coalesce(jsonb_agg(value::bigint order by value::bigint),'[]'::jsonb) into expected_values from jsonb_array_elements_text(expected_state->field);
      select coalesce(jsonb_agg(value::bigint order by value::bigint),'[]'::jsonb) into current_values from jsonb_array_elements_text(current_state->field);
    end if;
    if expected_values is distinct from current_values then
      raise exception 'Account changed on another device; reload before saving' using errcode='40001';
    end if;
  end loop;
  perform public.save_personal_state(favorite_ids,comparison_ids,alerts);
  return private.personal_snapshot();
end;
$$;
revoke all on function public.save_personal_state_checked(bigint[],bigint[],jsonb,jsonb) from public,anon;
grant execute on function public.save_personal_state_checked(bigint[],bigint[],jsonb,jsonb) to authenticated;
