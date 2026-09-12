-- Keep automatic scores honest when an administrator corrects imported data.
-- The pure scoring function exposes no tables or privileged data.
grant execute on function private.sync_score(jsonb,boolean) to authenticated;
create or replace function private.protect_automatic_score() returns trigger
language plpgsql security invoker set search_path='' as $$
declare score jsonb;
begin
  if auth.uid() is not null and old.score_method='automatic-v1' then
    score:=private.sync_score(jsonb_build_object('price',new.price,'old_price',new.old_price,'availability',new.availability,
      'description',nullif(btrim(new.description),''),'image_url',nullif(btrim(new.image_url),'')),
      coalesce((select is_verified from public.merchants where id=new.merchant_id),false));
    new.dealbot_score:=(score->>'total')::integer;
    new.score_method:='automatic-v1';new.score_details:=score;
    -- Recompare source-owned fields on the next import; preserve pause/archive.
    new.sync_hash:=null;
  end if;
  return new;
end; $$;
drop trigger protect_automatic_score on public.deals;
create trigger protect_automatic_score before update on public.deals for each row execute function private.protect_automatic_score();
