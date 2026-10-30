-- Local disposable fixtures ONLY. Exercise actual public wrappers as authenticated.
\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$declare q uuid;r uuid;o uuid;n uuid;request uuid:=gen_random_uuid();payload jsonb;failed boolean;board jsonb;begin
 payload:='{"account_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","currency":"COP","origin":"LOCAL origin","destination":"LOCAL destination","description":"LOCAL revision initial","lines":[{"description":"Explicit value","quantity":1,"unit_price":120,"tax_amount":0}]}';
 q:=public.incargo_create_quote(gen_random_uuid(),payload);
 r:=public.incargo_revise_quote(request,q,'Customer changed destination',payload||'{"destination":"LOCAL revised destination"}');
 if public.incargo_revise_quote(request,q,'Customer changed destination',payload||'{"destination":"LOCAL revised destination"}')<>r then raise exception 'revision replay changed ID';end if;
 failed:=false;begin perform public.incargo_revise_quote(gen_random_uuid(),q,'Stale second revision',payload);exception when others then failed:=true;end;if not failed then raise exception 'revision fork allowed';end if;
 failed:=false;begin perform public.incargo_accept_quote(gen_random_uuid(),q,'OLD version acceptance');exception when others then failed:=true;end;if not failed then raise exception 'superseded acceptance allowed';end if;
 failed:=false;begin perform public.incargo_revise_quote(gen_random_uuid(),r,'Change to other account',payload||'{"account_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}');exception when others then failed:=true;end;if not failed then raise exception 'account changed in revision';end if;
 o:=public.incargo_accept_quote(gen_random_uuid(),r,'LOCAL verified acceptance');
 failed:=false;begin perform public.incargo_revise_quote(gen_random_uuid(),r,'Revision after acceptance',payload);exception when others then failed:=true;end;if not failed then raise exception 'accepted quote revised';end if;
 request:=gen_random_uuid();perform public.incargo_cancel_unassigned_order(request,o,'LOCAL customer withdrew request');
 if public.incargo_cancel_unassigned_order(request,o,'LOCAL customer withdrew request')<>o then raise exception 'cancel replay changed ID';end if;
 select value into board from jsonb_array_elements(public.incargo_order_board()) where value->>'id'=o::text;
 if board->>'execution_stage'<>'cancelled' then raise exception 'cancelled order still active';end if;
 failed:=false;begin perform public.incargo_link_order_delivery(gen_random_uuid(),o,'44444444-4444-4444-8444-444444444444');exception when others then failed:=true;end;if not failed then raise exception 'cancelled order linked';end if;
 request:=gen_random_uuid();n:=public.incargo_add_administrative_note(request,'order',o,'LOCAL no fees or balance change','LOCAL customer correspondence');
 if public.incargo_add_administrative_note(request,'order',o,'LOCAL no fees or balance change','LOCAL customer correspondence')<>n then raise exception 'note replay changed ID';end if;
 if jsonb_array_length(public.incargo_administrative_notes('order',o))<>1 then raise exception 'note missing or duplicated';end if;
 failed:=false;begin perform public.incargo_add_administrative_note(gen_random_uuid(),'order',gen_random_uuid(),'Missing entity test','LOCAL reference');exception when others then failed:=true;end;if not failed then raise exception 'orphan note allowed';end if;
 raise notice 'PASS: immutable revisions, stale acceptance/revision rejection, immutable accepted version, cancellation replay and delivery guard, append-only note persistence';
end$$;
reset role;
do $$declare o uuid;i uuid;balance_before jsonb;failed boolean;begin
 select order_id,invoice_id into strict o,i from incargo_enterprise.invoice_orders limit 1;
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 failed:=false;begin perform incargo_enterprise.cancel_unassigned_order(gen_random_uuid(),o,'LOCAL attempt with execution');exception when others then failed:=true;end;if not failed then raise exception 'executing/invoiced order cancelled';end if;
 balance_before:=incargo_enterprise.finance_board();
 perform incargo_enterprise.add_administrative_note(gen_random_uuid(),'invoice',i,'LOCAL administrative observation only','LOCAL verified source');
 if incargo_enterprise.finance_board()<>balance_before then raise exception 'annotation changed balances';end if;
 -- No new membership grants; temporarily remove the LOCAL finance allowlist entry in this transaction.
 delete from incargo_enterprise.finance_operators where user_id=auth.uid();
 failed:=false;begin perform incargo_enterprise.administrative_notes_for('invoice',i);exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'non finance read invoice notes';end if;
 failed:=false;begin perform incargo_enterprise.add_administrative_note(gen_random_uuid(),'invoice',i,'LOCAL forbidden attempt','LOCAL source');exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'non finance wrote invoice note';end if;
 insert into incargo_enterprise.finance_operators(user_id) values(auth.uid());
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$begin
 begin perform public.incargo_cancel_unassigned_order(gen_random_uuid(),gen_random_uuid(),'Forbidden driver');raise exception 'driver cancel allowed';exception when insufficient_privilege then null;end;
 begin perform public.incargo_revise_quote(gen_random_uuid(),gen_random_uuid(),'Forbidden driver','{}');raise exception 'driver revise allowed';exception when insufficient_privilege then null;end;
 begin perform public.incargo_administrative_notes('order',gen_random_uuid());raise exception 'driver notes allowed';exception when insufficient_privilege then null;end;
 begin perform 1 from incargo_enterprise.administrative_notes;raise exception 'direct notes access allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
