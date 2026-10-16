-- Synthetic isolation test for client-portal.proposal.sql; disposable Postgres only.
insert into auth.users(id) values
('00000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000005'),
('00000000-0000-4000-8000-000000000006'),
('00000000-0000-4000-8000-000000000007'),
('00000000-0000-4000-8000-000000000008');
insert into public.incargo_memberships(user_id,role) values ('00000000-0000-4000-8000-000000000001','operations');
insert into public.incargo_trips(id,route_label,scheduled_date,vehicle_plate) values ('00000000-0000-4000-8000-000000000101','Ruta A','2026-10-15','DEM001'),('00000000-0000-4000-8000-000000000102','Ruta B','2026-10-15','DEM002');
insert into public.incargo_deliveries(id,trip_id,customer_name) values ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101','Cliente A'),('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000102','Cliente B');
insert into public.incargo_delivery_events(delivery_id,event_type,note,occurred_at) values ('00000000-0000-4000-8000-000000000201','exception','Nota interna reservada','2026-10-15T12:00:00Z');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.incargo_client_create_account('Cuenta ficticia A') as account_a \gset
select public.incargo_client_create_account('Cuenta ficticia B') as account_b \gset
select public.incargo_client_create_account('Cuenta vacía') as account_c \gset
select public.incargo_client_link_user(:'account_a','00000000-0000-4000-8000-000000000005');
select public.incargo_client_link_user(:'account_b','00000000-0000-4000-8000-000000000006');
select public.incargo_client_link_user(:'account_c','00000000-0000-4000-8000-000000000007');
select public.incargo_client_assign_delivery(:'account_a','00000000-0000-4000-8000-000000000201');
select public.incargo_client_assign_delivery(:'account_b','00000000-0000-4000-8000-000000000202');
-- Existing delivery cannot be silently assigned to another account.
do $$begin
 begin perform public.incargo_client_assign_delivery('00000000-0000-4000-8000-000000000999','00000000-0000-4000-8000-000000000201');raise exception 'double owner permitted';
 exception when others then if sqlerrm='double owner permitted' then raise; end if; end;
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
do $$begin
 if (select count(*) from public.incargo_client_my_deliveries())<>1 then raise exception 'A count'; end if;
 if (select delivery_id from public.incargo_client_my_deliveries())<>'00000000-0000-4000-8000-000000000201' then raise exception 'A scope'; end if;
 if (select last_event_at from public.incargo_client_my_deliveries())<>'2026-10-15T12:00:00Z'::timestamptz then raise exception 'A last event'; end if;
 if (select event_type from public.incargo_client_delivery_milestones('00000000-0000-4000-8000-000000000201'))<>'exception' then raise exception 'A milestone'; end if;
 if position('note' in pg_get_function_result('public.incargo_client_delivery_milestones(uuid)'::regprocedure))>0 then raise exception 'internal note exposed'; end if;
 if (select count(*) from public.incargo_client_delivery_milestones('00000000-0000-4000-8000-000000000202'))<>0 then raise exception 'A foreign detail'; end if;
 if has_table_privilege('authenticated','public.incargo_client_delivery_links','select') then raise exception 'direct link read'; end if;
 begin perform public.incargo_client_assign_delivery('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000202');raise exception 'client assigned';
 exception when others then if sqlerrm='client assigned' then raise; end if; end;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
do $$begin
 if (select count(*) from public.incargo_client_my_deliveries())<>1 then raise exception 'B count'; end if;
 if (select delivery_id from public.incargo_client_my_deliveries())<>'00000000-0000-4000-8000-000000000202' then raise exception 'B scope'; end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000007',true);
do $$begin if (select count(*) from public.incargo_client_my_deliveries())<>0 then raise exception 'empty linked account'; end if; end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000008',true);
do $$begin if (select count(*) from public.incargo_client_my_deliveries())<>0 then raise exception 'unlinked user'; end if; end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
do $$begin if (select count(*) from public.incargo_client_my_deliveries())<>0 then raise exception 'expired session'; end if; end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.incargo_client_unlink_user('00000000-0000-4000-8000-000000000005');
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
do $$begin if (select count(*) from public.incargo_client_my_deliveries())<>0 then raise exception 'revoked user'; end if; end $$;
rollback;
