-- Import activity already has durable per-run events. Avoid an unbounded second
-- audit stream for every automatic row update, including unchanged offers.
create or replace function private.audit_catalog() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null and to_jsonb(new)->>'sync_source' is not null then return new; end if;
 insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,details)
 values(auth.uid(),lower(tg_op),tg_table_name,new.id::text,jsonb_build_object('status',to_jsonb(new)->>'status'));
 return new;
end; $$;
