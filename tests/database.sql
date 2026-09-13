-- All test records are rolled back; no email or persistent account is created.
begin;
do $$
declare u uuid := gen_random_uuid(); v uuid := gen_random_uuid(); a uuid := gen_random_uuid(); m bigint; d bigint; hidden bigint;
begin
  insert into auth.users(id, raw_user_meta_data) values(u,'{"role":"admin"}'),(v,'{}'),(a,'{}');
  if (select role from public.profiles where id=u) = 'admin' then raise exception 'Signup metadata granted admin'; end if;
  update public.profiles set role='admin' where id=a;
  insert into public.merchants(name,slug) values('Transaction test','test-'||gen_random_uuid()) returning id into m;
  insert into public.deals(name,slug,price,merchant_id,status,availability,original_url)
    values('Transaction test','test-'||gen_random_uuid(),100,m,'active','in_stock','https://example.com/product') returning id into d;
  insert into public.deals(name,slug,price,merchant_id,status,expires_at)
    values('Expired test','test-'||gen_random_uuid(),100,m,'active',now()-interval '1 day') returning id into hidden;
  perform set_config('dealbot.test',jsonb_build_object('user',u,'other',v,'admin',a,'deal',d,'hidden',hidden,'merchant',m)::text,true);
end $$;
set local role anon;
do $$
declare t jsonb := current_setting('dealbot.test')::jsonb; destination text;
begin
  if exists(select 1 from public.deals where id=(t->>'hidden')::bigint) then raise exception 'Expired deal leaked'; end if;
  if public.is_admin() then raise exception 'Guest became admin'; end if;
  if has_table_privilege('anon','public.deals','TRUNCATE') then raise exception 'Guest can truncate'; end if;
  begin
    perform public.save_personal_state('{}','{}','[]');
    raise exception 'Guest can save';
  exception when insufficient_privilege then null; end;
  destination := public.track_deal_click((t->>'deal')::bigint,'transaction-test-session','deal');
  if destination <> 'https://example.com/product' then raise exception 'Tracking destination incorrect'; end if;
  begin
    perform public.track_deal_click((t->>'hidden')::bigint,'transaction-test-session','deal');
    raise exception 'Expired offer allowed a redirect';
  exception when invalid_parameter_value then null; end;
  for counter in 2..30 loop
    perform public.track_deal_click((t->>'deal')::bigint,'transaction-test-session','deal');
  end loop;
  begin
    perform public.track_deal_click((t->>'deal')::bigint,'transaction-test-session','deal');
    raise exception 'Click rate limit ignored';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dealbot.test')::jsonb->>'user','role','authenticated')::text,true);
set local role authenticated;
do $$
declare t jsonb := current_setting('dealbot.test')::jsonb; d bigint := (t->>'deal')::bigint;
begin
  if public.is_admin() then raise exception 'Regular user became admin'; end if;
  perform public.save_personal_state(array[d],array[d],jsonb_build_array(jsonb_build_object('productId',d,'targetPrice',80)));
  if (select count(*) from public.favorites) <> 1 then raise exception 'Favorite save failed'; end if;
  if (select status from public.price_alerts where deal_id=d) <> 'active' then raise exception 'Alert initially triggered'; end if;
  begin
    update public.profiles set role='admin' where id=auth.uid();
    raise exception 'Role escalation allowed';
  exception when insufficient_privilege then null; end;
  update public.profiles set full_name='Profile test' where id=auth.uid();
  if (select full_name from public.profiles where id=auth.uid()) <> 'Profile test' then raise exception 'Profile update failed'; end if;
  begin
    insert into public.favorites(user_id,deal_id) values((t->>'other')::uuid,d);
    raise exception 'Cross-user insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.price_alerts set status='triggered' where user_id=auth.uid();
    raise exception 'Forged alert status allowed';
  exception when insufficient_privilege then null; end;
  for counter in 1..5 loop
    insert into public.contact_messages(user_id,name,email,message) values(auth.uid(),'Test','test@example.com','Transaction-only test message');
  end loop;
  begin
    insert into public.contact_messages(user_id,name,email,message) values(auth.uid(),'Test','test@example.com','Transaction-only test message');
    raise exception 'Contact rate limit ignored';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.admin_save_deal('{}');
    raise exception 'Non-admin edit allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_personal_state(array[d],array[d,d,d,d,d],'[]');
    raise exception 'Comparison limit ignored';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dealbot.test')::jsonb->>'other','role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.contact_messages) or exists(select 1 from public.favorites) or exists(select 1 from public.price_alerts) then raise exception 'Personal data leaked'; end if;
end $$;
reset role;
update public.deals set price=70 where id=(current_setting('dealbot.test')::jsonb->>'deal')::bigint;
do $$ begin
  if (select status from public.price_alerts where deal_id=(current_setting('dealbot.test')::jsonb->>'deal')::bigint) <> 'triggered' then raise exception 'Price trigger failed'; end if;
  if (select count(*) from public.price_history where deal_id=(current_setting('dealbot.test')::jsonb->>'deal')::bigint) <> 2 then raise exception 'History missing'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dealbot.test')::jsonb->>'admin','role','authenticated')::text,true);
set local role authenticated;
do $$
declare saved_id bigint; c text; p jsonb; t jsonb := current_setting('dealbot.test')::jsonb;
  d bigint := (t->>'deal')::bigint; invalid_link text;
begin
  select slug into c from public.categories where is_active limit 1;
  saved_id := public.admin_save_deal(jsonb_build_object('name','Admin test','store','Transaction merchant','category',c,'price',50,'oldPrice',70,'score',60,'availability','in_stock','currency','MUR','url','https://example.com/product','status','active'));
  if not exists(select 1 from public.deals where deals.id=saved_id) then raise exception 'Admin save missing'; end if;
  if not exists(select 1 from public.admin_audit_logs where entity_id=saved_id::text and entity_type='deals') then raise exception 'Audit missing'; end if;
  update public.deals set status='archived' where deals.id=saved_id;
  if not exists(select 1 from public.price_history where deal_id=saved_id) then raise exception 'Archive removed history'; end if;
  p := jsonb_build_object('id',d,'name','Edited offer','store','Transaction test','category',c,'price',70,'oldPrice',100,
    'score',60,'availability','in_stock','currency','MUR','url','https://example.com/updated','status','active');
  perform public.admin_save_deal(p||jsonb_build_object('affiliateUrl','https://example.com/affiliate'));
  if (select merchant_id from public.deals where id=d) <> (t->>'merchant')::bigint then raise exception 'Existing merchant identity replaced'; end if;
  if public.track_deal_click(d,'admin-regression-session','deal') <> 'https://example.com/affiliate' then raise exception 'Edited affiliate destination ignored'; end if;
  foreach invalid_link in array array['javascript:alert(1)','https://user:pass@example.com/product','https://example.com:bad/product','https://example.com/a b','https://example.com'||chr(92)||'@evil.com'] loop
    begin
      perform public.admin_save_deal(p||jsonb_build_object('affiliateUrl',invalid_link));
      raise exception 'Invalid affiliate URL accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform public.admin_save_deal(p||jsonb_build_object('startsAt',now()+interval '2 days','expiresAt',now()+interval '1 day'));
    raise exception 'Reversed publication window accepted';
  exception when invalid_parameter_value then null; end;
  perform public.admin_save_deal(p||jsonb_build_object('startsAt',now()+interval '1 day','featured',true));
  perform public.admin_save_deal(p); -- old clients must preserve new optional fields
  if not (select is_featured and starts_at>now() and affiliate_url='https://example.com/affiliate' from public.deals where id=d) then raise exception 'Legacy edit cleared optional fields'; end if;
  begin
    perform public.track_deal_click(d,'admin-regression-session','deal');
    raise exception 'Scheduled offer tracked before publication';
  exception when invalid_parameter_value then null; end;
  perform public.admin_save_deal(p||jsonb_build_object('affiliateUrl','','startsAt',null,'featured',false));
  if public.track_deal_click(d,'admin-regression-session','deal') <> 'https://example.com/updated' then raise exception 'Cleared affiliate still overrides merchant link'; end if;
end $$;
reset role;
update public.deals set currency='EUR' where id=(current_setting('dealbot.test')::jsonb->>'deal')::bigint;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dealbot.test')::jsonb->>'user','role','authenticated')::text,true);
set local role authenticated;
do $$
declare d bigint := (current_setting('dealbot.test')::jsonb->>'deal')::bigint;
begin
  perform public.save_personal_state(array[d],array[d],jsonb_build_array(jsonb_build_object('productId',d,'targetPrice',80,'currency','MUR')));
  if (select currency from public.price_alerts where deal_id=d) <> 'MUR' then raise exception 'Unrelated save changed alert currency'; end if;
  perform public.save_personal_state(array[d],array[d],jsonb_build_array(jsonb_build_object('productId',d,'targetPrice',80)));
  if (select currency from public.price_alerts where deal_id=d) <> 'EUR' then raise exception 'Same-threshold alert currency not updated'; end if;
  if (select status from public.price_alerts where deal_id=d) <> 'triggered' then raise exception 'Currency update did not re-evaluate alert'; end if;
end $$;
do $$
declare before_state jsonb := private.personal_snapshot(); saved jsonb;
  d bigint := (current_setting('dealbot.test')::jsonb->>'deal')::bigint;
begin
  saved := public.save_personal_state_checked('{}',array[d],before_state->'alerts',before_state);
  if saved->'favorites' <> '[]'::jsonb then raise exception 'Saved snapshot did not reflect transaction'; end if;
  begin
    perform public.save_personal_state_checked(array[d],array[d],before_state->'alerts',before_state);
    raise exception 'Stale device overwrote newer favorites';
  exception when serialization_failure then null; end;
  if exists(select 1 from public.favorites where deal_id=d) then raise exception 'Conflict was not atomic'; end if;
  saved := jsonb_set(saved,'{alerts,0,status}','"active"'::jsonb);
  perform public.save_personal_state_checked('{}',array[d],saved->'alerts',saved);
end $$;
rollback;
select 'PASS: guest, ownership, signup metadata, role protection, profile update, admin, atomic state, comparison limit, tracking and click quota, expired redirects, price alerts, history, archive, audit; fixtures rolled back' as result;
