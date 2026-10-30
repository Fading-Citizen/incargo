-- Isolated constraint tests, no real supplier/vehicle/document data.
\set ON_ERROR_STOP on
begin;
do $$declare s uuid;v uuid;e uuid;q uuid;o uuid;failed boolean;t text;begin
 insert into incargo_enterprise.suppliers(display_name,source_reference,created_by) values('LOCAL SUPPLIER','LOCAL evidence','11111111-1111-4111-8111-111111111111') returning id into s;
 insert into incargo_enterprise.cost_records(supplier_id,trip_id,description,currency,documented_amount,incurred_date,source_reference,external_reference,created_by) values(s,'99999999-9999-4999-8999-999999999999','LOCAL explicit amount','COP',123.45,'2026-10-30','LOCAL support','LOCAL cost 1','11111111-1111-4111-8111-111111111111');
 failed:=false;begin insert into incargo_enterprise.cost_records(supplier_id,description,currency,documented_amount,incurred_date,source_reference,external_reference,created_by) values(s,'LOCAL no attribution','COP',123.45,'2026-10-30','LOCAL support','LOCAL cost 2','11111111-1111-4111-8111-111111111111');exception when check_violation then failed:=true;end;if not failed then raise exception 'unattributed cost allowed';end if;
 failed:=false;begin insert into incargo_enterprise.cost_records(supplier_id,trip_id,description,currency,documented_amount,incurred_date,source_reference,external_reference,created_by) values(s,'99999999-9999-4999-8999-999999999999','LOCAL invalid precision','COP',1.001,'2026-10-30','LOCAL support','LOCAL cost 3','11111111-1111-4111-8111-111111111111');exception when check_violation then failed:=true;end;if not failed then raise exception 'cost silently rounded';end if;
 insert into incargo_enterprise.vehicles(registration_reference,plate_display,source_reference,verified_by) values('LOCAL registration','LOCAL','LOCAL verified source','11111111-1111-4111-8111-111111111111') returning id into v;
 insert into incargo_enterprise.source_evidence(source_system,source_record_key,source_revision,content_sha256,source_reference,captured_at,recorded_by) values('checklist','LOCAL stable source key','LOCAL revision',repeat('a',64),'LOCAL export manifest',now(),'11111111-1111-4111-8111-111111111111') returning id into e;
 insert into incargo_enterprise.vehicle_documents(vehicle_id,source_evidence_id,document_label,created_by) values(v,e,'LOCAL reported document','11111111-1111-4111-8111-111111111111');
 foreach t in array array['suppliers','cost_records','vehicles','source_evidence','vehicle_documents'] loop
  if has_table_privilege('authenticated','incargo_enterprise.'||t,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon','incargo_enterprise.'||t,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'resource table reachable: %',t;end if;
  if not (select relrowsecurity from pg_class where oid=('incargo_enterprise.'||t)::regclass) then raise exception 'RLS absent';end if;
 end loop;
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 q:=incargo_enterprise.create_quote(gen_random_uuid(),'{"account_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","currency":"COP","origin":"LOCAL origin","destination":"LOCAL destination","description":"LOCAL cost guard","lines":[{"description":"LOCAL amount","quantity":1,"unit_price":100,"tax_amount":0}]}');
 o:=incargo_enterprise.accept_quote(gen_random_uuid(),q,'LOCAL accepted source');
 insert into incargo_enterprise.cost_records(supplier_id,order_id,description,currency,documented_amount,incurred_date,source_reference,external_reference,created_by) values(s,o,'LOCAL incurred cost','COP',10,'2026-10-30','LOCAL support','LOCAL cost guard','11111111-1111-4111-8111-111111111111');
 failed:=false;begin perform incargo_enterprise.cancel_unassigned_order(gen_random_uuid(),o,'LOCAL attempted cancellation with cost');exception when others then failed:=true;end;if not failed then raise exception 'order with cost cancelled';end if;
 raise notice 'PASS: closed resource models, precise documented costs, attribution and source provenance constraints';
end$$;
rollback;
