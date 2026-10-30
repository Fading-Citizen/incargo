-- REVIEW PROPOSAL ONLY. Not applied to production.
-- New commercial/financial contracts require explicit permission activation and process decisions.
begin;
create schema incargo_enterprise;
revoke all on schema incargo_enterprise from public,anon,authenticated;
create table incargo_enterprise.finance_operators(user_id uuid primary key references auth.users(id),approved_at timestamptz not null default now());
create table incargo_enterprise.requests(id uuid primary key,actor uuid not null references auth.users(id),action text not null,payload jsonb not null,result uuid not null,created_at timestamptz not null default now());
create table incargo_enterprise.quotes(id uuid primary key default gen_random_uuid(),account_id uuid not null references public.incargo_client_accounts(id),currency text not null check(currency~'^[A-Z]{3}$'),origin_text text not null check(length(btrim(origin_text)) between 1 and 200),destination_text text not null check(length(btrim(destination_text)) between 1 and 200),description text not null check(length(btrim(description)) between 1 and 1000),lines jsonb not null check(jsonb_typeof(lines)='array'),total numeric(14,2) not null check(total>0),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),accepted_at timestamptz,acceptance_reference text,check((accepted_at is null)=(acceptance_reference is null)));
create index quotes_account on incargo_enterprise.quotes(account_id);
create table incargo_enterprise.orders(id uuid primary key default gen_random_uuid(),quote_id uuid not null unique references incargo_enterprise.quotes(id),account_id uuid not null references public.incargo_client_accounts(id),created_at timestamptz not null default now(),created_by uuid not null references auth.users(id));
create index orders_account on incargo_enterprise.orders(account_id);
-- Cardinality deliberately supports split execution; activation waits for business confirmation.
create table incargo_enterprise.order_deliveries(order_id uuid not null references incargo_enterprise.orders(id),delivery_id uuid not null unique references public.incargo_deliveries(id),created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),primary key(order_id,delivery_id));
create table incargo_enterprise.invoices(id uuid primary key default gen_random_uuid(),account_id uuid not null references public.incargo_client_accounts(id),issuer_reference text not null check(length(btrim(issuer_reference)) between 1 and 120),external_number text not null check(length(btrim(external_number)) between 1 and 120),currency text not null check(currency~'^[A-Z]{3}$'),issue_date date not null,due_date date not null,lines jsonb not null check(jsonb_typeof(lines)='array'),total numeric(14,2) not null check(total>0),source_reference text not null check(length(btrim(source_reference)) between 1 and 500),created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),unique(issuer_reference,external_number),check(due_date>=issue_date));
create index invoices_account_date on incargo_enterprise.invoices(account_id,issue_date desc,id);
create table incargo_enterprise.invoice_orders(invoice_id uuid not null references incargo_enterprise.invoices(id),order_id uuid not null references incargo_enterprise.orders(id),primary key(invoice_id,order_id));
create index invoice_orders_order on incargo_enterprise.invoice_orders(order_id);
create table incargo_enterprise.receipts(id uuid primary key default gen_random_uuid(),account_id uuid not null references public.incargo_client_accounts(id),currency text not null check(currency~'^[A-Z]{3}$'),amount numeric(14,2) not null check(amount>0),external_reference text not null check(length(btrim(external_reference)) between 1 and 120),received_date date not null,source_reference text not null check(length(btrim(source_reference)) between 1 and 500),created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),unique(account_id,external_reference));
create index receipts_account on incargo_enterprise.receipts(account_id);
create table incargo_enterprise.allocations(id uuid primary key default gen_random_uuid(),receipt_id uuid not null references incargo_enterprise.receipts(id),invoice_id uuid not null references incargo_enterprise.invoices(id),amount numeric(14,2) not null check(amount>0),created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),reversed_at timestamptz,reversal_reason text,reversed_by uuid references auth.users(id),check((reversed_at is null and reversal_reason is null and reversed_by is null) or (reversed_at is not null and length(btrim(reversal_reason)) between 4 and 500 and reversed_by is not null)));
create index allocations_receipt on incargo_enterprise.allocations(receipt_id) where reversed_at is null;
create index allocations_invoice on incargo_enterprise.allocations(invoice_id) where reversed_at is null;
create table incargo_enterprise.audit(id uuid primary key default gen_random_uuid(),entity_id uuid not null,event text not null,actor uuid not null references auth.users(id),request_id uuid not null,payload jsonb not null,occurred_at timestamptz not null default now());
create index audit_entity on incargo_enterprise.audit(entity_id,occurred_at);
-- No direct table grants or policies: all tables are closed, including to authenticated callers.
do $$declare r record;begin for r in select tablename from pg_tables where schemaname='incargo_enterprise' loop execute format('alter table incargo_enterprise.%I enable row level security',r.tablename);end loop;end$$;
revoke all on all tables in schema incargo_enterprise from public,anon,authenticated;
create function incargo_enterprise.require_operations() returns void language plpgsql security definer set search_path='' as $$begin if auth.uid() is null or not incargo_private.is_operations() then raise exception 'operations access required' using errcode='42501';end if;end$$;
create function incargo_enterprise.require_finance() returns void language plpgsql security definer set search_path='' as $$begin perform incargo_enterprise.require_operations();if not exists(select 1 from incargo_enterprise.finance_operators where user_id=auth.uid()) then raise exception 'finance access required' using errcode='42501';end if;end$$;
create function incargo_enterprise.lines_total(p_lines jsonb) returns numeric language plpgsql immutable set search_path='' as $$declare l jsonb;n numeric:=0;q numeric;price numeric;tax numeric;begin
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'invalid lines';end if;
 for l in select value from jsonb_array_elements(p_lines) loop
  if length(btrim(coalesce(l->>'description',''))) not between 1 and 500 or jsonb_typeof(l->'quantity')<>'number' or jsonb_typeof(l->'unit_price')<>'number' or jsonb_typeof(l->'tax_amount')<>'number' then raise exception 'invalid line';end if;
  q:=(l->>'quantity')::numeric;price:=(l->>'unit_price')::numeric;tax:=(l->>'tax_amount')::numeric;
  if q<=0 or q>1000000 or price<0 or tax<0 or scale(q)>3 or scale(price)>2 or scale(tax)>2 then raise exception 'invalid amounts';end if;
  n:=n+round(q*price,2)+tax;
 end loop;if n<=0 or n>=1000000000000 then raise exception 'invalid total';end if;return n;
end$$;
create function incargo_enterprise.replay(p_action text,p_request uuid,p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare r incargo_enterprise.requests;begin
 if p_request is null then raise exception 'request ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));select * into r from incargo_enterprise.requests where id=p_request;
 if found then if r.actor<>auth.uid() or r.action<>p_action or r.payload<>p_payload then raise exception 'idempotency conflict';end if;return r.result;end if;return null;
end$$;
create function incargo_enterprise.remember(p_action text,p_request uuid,p_payload jsonb,p_result uuid) returns void language plpgsql security definer set search_path='' as $$begin
 insert into incargo_enterprise.requests values(p_request,auth.uid(),p_action,p_payload,p_result,now());
 insert into incargo_enterprise.audit(entity_id,event,actor,request_id,payload) values(p_result,p_action,auth.uid(),p_request,p_payload);
end$$;
create function incargo_enterprise.create_quote(p_request uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;total numeric;begin
 perform incargo_enterprise.require_operations();result:=incargo_enterprise.replay('quote.create',p_request,p_data);if result is not null then return result;end if;
 total:=incargo_enterprise.lines_total(p_data->'lines');
 insert into incargo_enterprise.quotes(account_id,currency,origin_text,destination_text,description,lines,total,created_by) values((p_data->>'account_id')::uuid,p_data->>'currency',p_data->>'origin',p_data->>'destination',p_data->>'description',p_data->'lines',total,auth.uid()) returning id into result;
 perform incargo_enterprise.remember('quote.create',p_request,p_data,result);return result;
end$$;
create function incargo_enterprise.accept_quote(p_request uuid,p_quote uuid,p_reference text) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;q incargo_enterprise.quotes;payload jsonb:=jsonb_build_object('quote',p_quote,'reference',p_reference);begin
 perform incargo_enterprise.require_operations();result:=incargo_enterprise.replay('quote.accept',p_request,payload);if result is not null then return result;end if;
 if length(btrim(coalesce(p_reference,''))) not between 4 and 500 then raise exception 'acceptance evidence required';end if;
 select * into strict q from incargo_enterprise.quotes where id=p_quote for update;
 if q.accepted_at is not null then raise exception 'quote already accepted';end if;
 update incargo_enterprise.quotes set accepted_at=now(),acceptance_reference=p_reference where id=p_quote;
 insert into incargo_enterprise.orders(quote_id,account_id,created_by) values(p_quote,q.account_id,auth.uid()) returning id into result;
 perform incargo_enterprise.remember('quote.accept',p_request,payload,result);return result;
end$$;
create function incargo_enterprise.link_delivery(p_request uuid,p_order uuid,p_delivery uuid) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;payload jsonb:=jsonb_build_object('order',p_order,'delivery',p_delivery);account uuid;begin
 perform incargo_enterprise.require_operations();result:=incargo_enterprise.replay('order.link_delivery',p_request,payload);if result is not null then return result;end if;
 select account_id into strict account from incargo_enterprise.orders where id=p_order for update;
 if not exists(select 1 from public.incargo_client_delivery_links where delivery_id=p_delivery and account_id=account) then raise exception 'delivery account must match order';end if;
 insert into incargo_enterprise.order_deliveries values(p_order,p_delivery,now(),auth.uid());
 perform incargo_enterprise.remember('order.link_delivery',p_request,payload,p_order);return p_order;
end$$;
create function incargo_enterprise.register_invoice(p_request uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;total numeric;order_id uuid;account uuid:=(p_data->>'account_id')::uuid;begin
 perform incargo_enterprise.require_finance();result:=incargo_enterprise.replay('invoice.register',p_request,p_data);if result is not null then return result;end if;
 total:=incargo_enterprise.lines_total(p_data->'lines');if total<>(p_data->>'document_total')::numeric or p_data->>'document_total' is null then raise exception 'document total mismatch';end if;
 insert into incargo_enterprise.invoices(account_id,issuer_reference,external_number,currency,issue_date,due_date,lines,total,source_reference,created_by) values(account,p_data->>'issuer_reference',p_data->>'external_number',p_data->>'currency',(p_data->>'issue_date')::date,(p_data->>'due_date')::date,p_data->'lines',total,p_data->>'source_reference',auth.uid()) returning id into result;
 for order_id in select value::uuid from jsonb_array_elements_text(coalesce(p_data->'order_ids','[]'::jsonb)) loop
  if not exists(select 1 from incargo_enterprise.orders where id=order_id and account_id=account) then raise exception 'order account mismatch';end if;
  insert into incargo_enterprise.invoice_orders values(result,order_id);
 end loop;
 perform incargo_enterprise.remember('invoice.register',p_request,p_data,result);return result;
end$$;
create function incargo_enterprise.record_receipt(p_request uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;amount numeric:=(p_data->>'amount')::numeric;begin
 perform incargo_enterprise.require_finance();result:=incargo_enterprise.replay('receipt.record',p_request,p_data);if result is not null then return result;end if;
 if amount::text in ('NaN','Infinity','-Infinity') or scale(amount)>2 then raise exception 'invalid amount precision';end if;
 insert into incargo_enterprise.receipts(account_id,currency,amount,external_reference,received_date,source_reference,created_by) values((p_data->>'account_id')::uuid,p_data->>'currency',amount,p_data->>'external_reference',(p_data->>'received_date')::date,p_data->>'source_reference',auth.uid()) returning id into result;
 perform incargo_enterprise.remember('receipt.record',p_request,p_data,result);return result;
end$$;
create function incargo_enterprise.apply_receipt(p_request uuid,p_receipt uuid,p_invoice uuid,p_amount numeric) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;r incargo_enterprise.receipts;i incargo_enterprise.invoices;payload jsonb:=jsonb_build_object('receipt',p_receipt,'invoice',p_invoice,'amount',p_amount);used numeric;paid numeric;begin
 perform incargo_enterprise.require_finance();result:=incargo_enterprise.replay('receipt.apply',p_request,payload);if result is not null then return result;end if;
 if p_amount is null or p_amount<=0 or scale(p_amount)>2 then raise exception 'invalid amount';end if;
 select * into strict r from incargo_enterprise.receipts where id=p_receipt for update;
 select * into strict i from incargo_enterprise.invoices where id=p_invoice for update;
 if r.account_id<>i.account_id or r.currency<>i.currency then raise exception 'receipt account/currency mismatch';end if;
 select coalesce(sum(amount),0) into used from incargo_enterprise.allocations where receipt_id=p_receipt and reversed_at is null;
 select coalesce(sum(amount),0) into paid from incargo_enterprise.allocations where invoice_id=p_invoice and reversed_at is null;
 if p_amount>r.amount-used or p_amount>i.total-paid then raise exception 'allocation exceeds available balance';end if;
 insert into incargo_enterprise.allocations(receipt_id,invoice_id,amount,created_by) values(p_receipt,p_invoice,p_amount,auth.uid()) returning id into result;
 perform incargo_enterprise.remember('receipt.apply',p_request,payload,result);return result;
end$$;
create function incargo_enterprise.reverse_allocation(p_request uuid,p_allocation uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;payload jsonb:=jsonb_build_object('allocation',p_allocation,'reason',p_reason);r uuid;i uuid;begin
 perform incargo_enterprise.require_finance();result:=incargo_enterprise.replay('receipt.reverse',p_request,payload);if result is not null then return result;end if;
 if length(btrim(coalesce(p_reason,''))) not between 4 and 500 then raise exception 'reversal reason required';end if;
 select receipt_id,invoice_id into strict r,i from incargo_enterprise.allocations where id=p_allocation;
 perform 1 from incargo_enterprise.receipts where id=r for update;perform 1 from incargo_enterprise.invoices where id=i for update;
 update incargo_enterprise.allocations set reversed_at=now(),reversal_reason=p_reason,reversed_by=auth.uid() where id=p_allocation and reversed_at is null;
 if not found then raise exception 'allocation already reversed';end if;
 perform incargo_enterprise.remember('receipt.reverse',p_request,payload,p_allocation);return p_allocation;
end$$;
-- No functions are reachable by application roles until a separate reviewed activation.
revoke all on all functions in schema incargo_enterprise from public,anon,authenticated;
commit;
