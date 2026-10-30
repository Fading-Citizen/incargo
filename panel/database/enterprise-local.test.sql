\set ON_ERROR_STOP on
-- ONLY for the disposable local database. All actors and companies below are test fixtures.
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
insert into public.incargo_memberships(user_id,role) values('11111111-1111-4111-8111-111111111111','operations'),('22222222-2222-4222-8222-222222222222','driver');
insert into public.incargo_client_accounts(id,display_name,created_by) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','LOCAL TEST A','11111111-1111-4111-8111-111111111111'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','LOCAL TEST B','11111111-1111-4111-8111-111111111111');
insert into public.incargo_trips(id,route_label,scheduled_date,vehicle_plate) values('99999999-9999-4999-8999-999999999999','LOCAL ROUTE','2026-10-30','LOCAL');
insert into public.incargo_deliveries(id,trip_id,customer_name) values('44444444-4444-4444-8444-444444444444','99999999-9999-4999-8999-999999999999','LOCAL A'),('55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999999','LOCAL B');
insert into public.incargo_client_delivery_links(delivery_id,account_id,created_by) values('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),('55555555-5555-4555-8555-555555555555','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111');
do $$begin if has_schema_privilege('authenticated','incargo_enterprise','USAGE') then raise exception 'closed proposal unexpectedly reachable';end if;end$$;
-- Temporary test-only execution grants; not a production activation script.
grant usage on schema incargo_enterprise to authenticated;
grant execute on function incargo_enterprise.create_quote(uuid,jsonb),incargo_enterprise.accept_quote(uuid,uuid,text),incargo_enterprise.link_delivery(uuid,uuid,uuid),incargo_enterprise.register_invoice(uuid,jsonb),incargo_enterprise.record_receipt(uuid,jsonb),incargo_enterprise.apply_receipt(uuid,uuid,uuid,numeric),incargo_enterprise.reverse_allocation(uuid,uuid,text),incargo_enterprise.order_board(),incargo_enterprise.finance_board(),incargo_enterprise.invoice_detail(uuid) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$begin begin perform incargo_enterprise.order_board();raise exception 'driver accessed business';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $$begin begin perform incargo_enterprise.order_board();raise exception 'client accessed business';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$begin begin perform incargo_enterprise.finance_board();raise exception 'operations inferred finance privileges';exception when insufficient_privilege then null;end;begin perform 1 from incargo_enterprise.quotes;raise exception 'direct table read allowed';exception when insufficient_privilege then null;end;end$$;
reset role;
insert into incargo_enterprise.finance_operators(user_id) values('11111111-1111-4111-8111-111111111111');
set role authenticated;
do $$declare q uuid;o uuid;i uuid;r uuid;allocation uuid;req uuid:=gen_random_uuid();payload jsonb;money jsonb;board jsonb;failed boolean;begin
 payload:='{"account_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","currency":"COP","origin":"Test origin","destination":"Test destination","description":"Test service","lines":[{"description":"User-entered test service","quantity":2,"unit_price":50,"tax_amount":0}]}'::jsonb;
 q:=incargo_enterprise.create_quote(req,payload);if incargo_enterprise.create_quote(req,payload)<>q then raise exception 'quote replay changed ID';end if;
 failed:=false;begin perform incargo_enterprise.create_quote(req,payload||'{"description":"changed"}');exception when others then failed:=true;end;if not failed then raise exception 'replay payload accepted';end if;
 o:=incargo_enterprise.accept_quote(gen_random_uuid(),q,'LOCAL acceptance reference');board:=incargo_enterprise.order_board();if board->0->>'execution_stage'<>'unassigned' or board->0->'deliveries'<>'[]'::jsonb then raise exception 'order required/invented trip';end if;
 perform incargo_enterprise.link_delivery(gen_random_uuid(),o,'44444444-4444-4444-8444-444444444444');board:=incargo_enterprise.order_board();if board->0->>'execution_stage'<>'pending' then raise exception 'execution not derived from linked delivery';end if;
 failed:=false;begin perform incargo_enterprise.link_delivery(gen_random_uuid(),o,'55555555-5555-4555-8555-555555555555');exception when others then failed:=true;end;if not failed then raise exception 'cross account delivery link allowed';end if;
 money:=jsonb_build_object('account_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','issuer_reference','TEST ISSUER','external_number','TEST INV 1','currency','COP','issue_date','2026-10-30','due_date','2026-11-30','source_reference','LOCAL test document','lines',payload->'lines','document_total',100,'order_ids',jsonb_build_array(o));
 req:=gen_random_uuid();i:=incargo_enterprise.register_invoice(req,money);if incargo_enterprise.register_invoice(req,money)<>i then raise exception 'invoice replay changed ID';end if;
 failed:=false;begin perform incargo_enterprise.register_invoice(gen_random_uuid(),money||'{"document_total":101,"external_number":"TEST BAD"}');exception when others then failed:=true;end;if not failed then raise exception 'wrong invoice total accepted';end if;
 r:=incargo_enterprise.record_receipt(gen_random_uuid(),'{"account_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","currency":"COP","amount":70,"external_reference":"TEST RECEIPT 1","received_date":"2026-10-30","source_reference":"LOCAL test receipt"}');
 req:=gen_random_uuid();allocation:=incargo_enterprise.apply_receipt(req,r,i,60);if incargo_enterprise.apply_receipt(req,r,i,60)<>allocation then raise exception 'allocation replay changed ID';end if;
 board:=incargo_enterprise.finance_board();if (board->0->>'outstanding')::numeric<>40 then raise exception 'outstanding mismatch';end if;
 failed:=false;begin perform incargo_enterprise.apply_receipt(gen_random_uuid(),r,i,11);exception when others then failed:=true;end;if not failed then raise exception 'receipt over-allocation allowed';end if;
 perform incargo_enterprise.reverse_allocation(gen_random_uuid(),allocation,'LOCAL correction');board:=incargo_enterprise.finance_board();if (board->0->>'outstanding')::numeric<>100 then raise exception 'reversal did not restore balance';end if;
 r:=incargo_enterprise.record_receipt(gen_random_uuid(),'{"account_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","currency":"USD","amount":70,"external_reference":"TEST RECEIPT USD","received_date":"2026-10-30","source_reference":"LOCAL test receipt"}');
 failed:=false;begin perform incargo_enterprise.apply_receipt(gen_random_uuid(),r,i,10);exception when others then failed:=true;end;if not failed then raise exception 'cross currency allocation allowed';end if;
 r:=incargo_enterprise.record_receipt(gen_random_uuid(),'{"account_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","currency":"COP","amount":70,"external_reference":"TEST RECEIPT OTHER","received_date":"2026-10-30","source_reference":"LOCAL test receipt"}');
 failed:=false;begin perform incargo_enterprise.apply_receipt(gen_random_uuid(),r,i,10);exception when others then failed:=true;end;if not failed then raise exception 'cross account allocation allowed';end if;
 raise notice 'PASS: quote/order persistence without trip, idempotency/conflicts, finance permission, invoice total verification, receipt balances, over-allocation rejection, audited reversal, currency/account isolation';
end$$;
reset role;
do $$begin if (select count(*) from incargo_enterprise.audit)<7 then raise exception 'audit missing';end if;if not exists(select 1 from incargo_enterprise.allocations where reversed_at is not null and reversed_by is not null) then raise exception 'reversal destroyed history';end if;end$$;
