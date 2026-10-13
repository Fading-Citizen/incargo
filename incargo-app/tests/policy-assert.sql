insert into auth.users(id) values
('00000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000002'),
('00000000-0000-4000-8000-000000000003'),
('00000000-0000-4000-8000-000000000004');
insert into public.incargo_memberships(user_id,role) values
('00000000-0000-4000-8000-000000000001','operations'),
('00000000-0000-4000-8000-000000000002','driver'),
('00000000-0000-4000-8000-000000000003','driver');
insert into public.incargo_trips(id,route_label,scheduled_date,vehicle_plate,driver_user_id) values
('00000000-0000-4000-8000-000000000101','Ruta A','2026-10-15','DEM001','00000000-0000-4000-8000-000000000002'),
('00000000-0000-4000-8000-000000000102','Ruta B','2026-10-15','DEM002','00000000-0000-4000-8000-000000000003');
insert into public.incargo_deliveries(id,trip_id,customer_name) values
('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101','Cliente A'),
('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000102','Cliente B');

do $$begin
  if has_table_privilege('anon','public.incargo_trips','select') then raise exception 'anon table grant'; end if;
  if has_function_privilege('anon','public.incargo_read_tracking(text)','execute') then raise exception 'anon RPC grant'; end if;
  if has_column_privilege('authenticated','public.incargo_deliveries','status','update') then raise exception 'direct status update'; end if;
  if (select public from storage.buckets where id='incargo-proofs') then raise exception 'public proof bucket'; end if;
end$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$begin
 if (select count(*) from public.incargo_trips)<>2 then raise exception 'operations trips'; end if;
 if (select count(*) from public.incargo_deliveries)<>2 then raise exception 'operations deliveries'; end if;
end$$;
update public.incargo_trips set driver_user_id='00000000-0000-4000-8000-000000000002' where id='00000000-0000-4000-8000-000000000102';
do $$begin
 if (select driver_user_id from public.incargo_trips where id='00000000-0000-4000-8000-000000000102')<>'00000000-0000-4000-8000-000000000002' then raise exception 'assignment update'; end if;
end$$;
insert into public.incargo_deliveries(trip_id,customer_name) values ('00000000-0000-4000-8000-000000000101','Cliente creado en prueba');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$begin
 if (select count(*) from public.incargo_trips)<>1 then raise exception 'driver trips'; end if;
 if (select count(*) from public.incargo_deliveries)<>1 then raise exception 'driver deliveries'; end if;
 if (select count(*) from public.incargo_memberships)<>1 then raise exception 'driver memberships'; end if;
 begin
  insert into public.incargo_trips(route_label,scheduled_date,vehicle_plate) values ('No permitido','2026-10-15','DEM999');
  raise exception 'driver trip insert permitted';
 exception when others then if sqlerrm='driver trip insert permitted' then raise; end if; end;
 begin
  update public.incargo_trips set driver_user_id=null where id='00000000-0000-4000-8000-000000000101';
  if found then raise exception 'driver assignment update permitted'; end if;
 end;
 begin
  perform public.incargo_record_issue('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000301','wrong trip');
  raise exception 'unassigned issue permitted';
 exception when others then
  if sqlerrm='unassigned issue permitted' then raise; end if;
 end;
end$$;
select public.incargo_record_issue('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000302','Synthetic delay');
select public.incargo_record_issue('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000302','Synthetic delay');
do $$begin
 if (select count(*) from public.incargo_delivery_events where request_id='00000000-0000-4000-8000-000000000302')<>1 then raise exception 'issue idempotency'; end if;
end$$;
insert into storage.objects(bucket_id,name,owner_id) values ('incargo-proofs','00000000-0000-4000-8000-000000000201/test.png','00000000-0000-4000-8000-000000000002');
do $$begin
 begin
  insert into storage.objects(bucket_id,name,owner_id) values ('incargo-proofs','00000000-0000-4000-8000-000000000202/wrong.png','00000000-0000-4000-8000-000000000002');
  raise exception 'unassigned storage upload permitted';
 exception when others then
  if sqlerrm='unassigned storage upload permitted' then raise; end if;
 end;
end$$;
select public.incargo_confirm_delivery('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000201/test.png','Receptor sintético',null);
select public.incargo_confirm_delivery('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000201/test.png','Receptor sintético',null);
do $$begin
 if (select count(*) from public.incargo_delivery_events where request_id='00000000-0000-4000-8000-000000000303')<>1 then raise exception 'confirm idempotency'; end if;
 begin
  perform public.incargo_record_issue('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000304','late issue');
  raise exception 'late issue permitted';
 exception when others then if sqlerrm='late issue permitted' then raise; end if; end;
 begin
  perform public.incargo_confirm_delivery('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000305','00000000-0000-4000-8000-000000000201/test.png','Receptor sintético',null);
  raise exception 'second confirmation permitted';
 exception when others then if sqlerrm='second confirmation permitted' then raise; end if; end;
end$$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
do $$begin
 if (select count(*) from public.incargo_trips)<>0 then raise exception 'outsider trips'; end if;
 if (select count(*) from public.incargo_deliveries)<>0 then raise exception 'outsider deliveries'; end if;
 begin
  perform public.incargo_create_tracking_link('00000000-0000-4000-8000-000000000201',1);
  raise exception 'outsider link permitted';
 exception when others then
  if sqlerrm='outsider link permitted' then raise; end if;
 end;
end$$;
rollback;

-- Tokens persist only in this disposable local Postgres container.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.incargo_create_tracking_link('00000000-0000-4000-8000-000000000201',1) as token_one \gset
select public.incargo_create_tracking_link('00000000-0000-4000-8000-000000000202',1) as token_two \gset
commit;

begin;
set local role service_role;
select 1 / case when public.incargo_read_tracking(:'token_one')->>'customer_name'='Cliente A' then 1 else 0 end;
select 1 / case when public.incargo_read_tracking(:'token_two')->>'customer_name'='Cliente B' then 1 else 0 end;
select 1 / case when public.incargo_read_tracking('invalid') is null then 1 else 0 end;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.incargo_revoke_tracking_link(:'token_one');
commit;
update incargo_private.tracking_links set expires_at=now()-interval '1 minute' where token_hash=extensions.digest(:'token_two','sha256');

begin;
set local role service_role;
select 1 / case when public.incargo_read_tracking(:'token_one') is null then 1 else 0 end;
select 1 / case when public.incargo_read_tracking(:'token_two') is null then 1 else 0 end;
rollback;
