-- Invoked inside a rolled-back local transaction after resetting all proposal grants.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$declare q uuid;o uuid;begin
 if public.incargo_business_capabilities()->>'finance'<>'false' then raise exception 'commercial activation enabled finance';end if;
 if has_function_privilege('authenticated','incargo_enterprise.register_invoice(uuid,jsonb)','EXECUTE') or has_function_privilege('authenticated','incargo_enterprise.record_receipt(uuid,jsonb)','EXECUTE') then raise exception 'commercial activation granted finance';end if;
 q:=public.incargo_create_quote(gen_random_uuid(),'{"account_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","currency":"COP","origin":"LOCAL origin","destination":"LOCAL destination","description":"LOCAL commercial-only activation","lines":[{"description":"LOCAL quoted value","quantity":1,"unit_price":10,"tax_amount":0}]}');
 o:=public.incargo_accept_quote(gen_random_uuid(),q,'LOCAL verified acceptance');
 perform public.incargo_cancel_unassigned_order(gen_random_uuid(),o,'LOCAL requested cancellation');
 begin perform public.incargo_administrative_notes('invoice',gen_random_uuid());raise exception 'financial notes bypassed hold';exception when insufficient_privilege then null;end;
 raise notice 'PASS: commercial-only grant scope supports quote/order/cancel without financial grants or activation';
end$$;
