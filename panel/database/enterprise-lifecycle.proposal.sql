-- REVIEW ONLY. Apply exclusively to the disposable database until process/permissions approval.
begin;
alter table incargo_enterprise.quotes
 add column supersedes_id uuid unique references incargo_enterprise.quotes(id),
 add column revision_reason text check(length(btrim(revision_reason)) between 4 and 500),
 add constraint quote_revision_reason check((supersedes_id is null)=(revision_reason is null));
alter table incargo_enterprise.orders
 add column cancelled_at timestamptz,
 add column cancellation_reason text,
 add column cancelled_by uuid references auth.users(id),
 add constraint order_cancellation_evidence check(
  (cancelled_at is null and cancellation_reason is null and cancelled_by is null) or
  (cancelled_at is not null and cancellation_reason is not null and length(btrim(cancellation_reason)) between 4 and 500 and cancelled_by is not null));

-- An annotation is NOT a credit/debit note. It never changes a document or balance.
create table incargo_enterprise.administrative_notes(
 id uuid primary key default gen_random_uuid(),
 entity_type text not null check(entity_type in ('quote','order','invoice','receipt')),
 entity_id uuid not null,
 body text not null check(length(btrim(body)) between 4 and 2000),
 source_reference text not null check(length(btrim(source_reference)) between 4 and 500),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index administrative_notes_entity on incargo_enterprise.administrative_notes(entity_type,entity_id,created_at,id);
alter table incargo_enterprise.administrative_notes enable row level security;
revoke all on incargo_enterprise.administrative_notes from public,anon,authenticated;

create function incargo_enterprise.revise_quote(p_request uuid,p_quote uuid,p_reason text,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;previous incargo_enterprise.quotes;amount numeric;
 payload jsonb:=jsonb_build_object('quote',p_quote,'reason',p_reason,'data',p_data);
begin
 perform incargo_enterprise.require_operations();
 result:=incargo_enterprise.replay('quote.revise',p_request,payload);
 if result is not null then return result;end if;
 if length(btrim(coalesce(p_reason,''))) not between 4 and 500 then raise exception 'revision reason required';end if;
 select * into strict previous from incargo_enterprise.quotes where id=p_quote for update;
 if previous.accepted_at is not null then raise exception 'accepted quote is immutable';end if;
 if exists(select 1 from incargo_enterprise.quotes where supersedes_id=p_quote) then raise exception 'quote revision conflict';end if;
 if (p_data->>'account_id')::uuid is distinct from previous.account_id then raise exception 'revision cannot change account';end if;
 amount:=incargo_enterprise.lines_total(p_data->'lines');
 insert into incargo_enterprise.quotes(account_id,currency,origin_text,destination_text,description,lines,total,created_by,supersedes_id,revision_reason)
 values(previous.account_id,p_data->>'currency',p_data->>'origin',p_data->>'destination',p_data->>'description',p_data->'lines',amount,auth.uid(),p_quote,p_reason)
 returning id into result;
 perform incargo_enterprise.remember('quote.revise',p_request,payload,result);return result;
end$$;

create function incargo_enterprise.cancel_unassigned_order(p_request uuid,p_order uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;item incargo_enterprise.orders;
 payload jsonb:=jsonb_build_object('order',p_order,'reason',p_reason);
begin
 perform incargo_enterprise.require_operations();
 result:=incargo_enterprise.replay('order.cancel',p_request,payload);
 if result is not null then return result;end if;
 if length(btrim(coalesce(p_reason,''))) not between 4 and 500 then raise exception 'cancellation reason required';end if;
 select * into strict item from incargo_enterprise.orders where id=p_order for update;
 if item.cancelled_at is not null then raise exception 'order already cancelled';end if;
 -- No cancellation of execution, fees, refunds or fiscal documents is inferred.
 if exists(select 1 from incargo_enterprise.order_deliveries where order_id=p_order)
 or exists(select 1 from incargo_enterprise.invoice_orders where order_id=p_order)
 or exists(select 1 from incargo_enterprise.cost_records where order_id=p_order) then
  raise exception 'order has execution, invoice or cost; reviewed resolution required';
 end if;
 update incargo_enterprise.orders set cancelled_at=now(),cancellation_reason=p_reason,cancelled_by=auth.uid() where id=p_order;
 perform incargo_enterprise.remember('order.cancel',p_request,payload,p_order);return p_order;
end$$;

create function incargo_enterprise.require_note_entity(p_type text,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_type in ('invoice','receipt') then perform incargo_enterprise.require_finance();
 else perform incargo_enterprise.require_operations();end if;
 if p_type='quote' and exists(select 1 from incargo_enterprise.quotes where id=p_id) then return;
 elsif p_type='order' and exists(select 1 from incargo_enterprise.orders where id=p_id) then return;
 elsif p_type='invoice' and exists(select 1 from incargo_enterprise.invoices where id=p_id) then return;
 elsif p_type='receipt' and exists(select 1 from incargo_enterprise.receipts where id=p_id) then return;
 end if;
 raise exception 'note entity not found';
end$$;
create function incargo_enterprise.add_administrative_note(p_request uuid,p_type text,p_id uuid,p_body text,p_source text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;payload jsonb:=jsonb_build_object('type',p_type,'id',p_id,'body',p_body,'source',p_source);
begin
 perform incargo_enterprise.require_note_entity(p_type,p_id);
 result:=incargo_enterprise.replay('note.add',p_request,payload);if result is not null then return result;end if;
 insert into incargo_enterprise.administrative_notes(entity_type,entity_id,body,source_reference,created_by)
 values(p_type,p_id,p_body,p_source,auth.uid()) returning id into result;
 perform incargo_enterprise.remember('note.add',p_request,payload,result);return result;
end$$;
create function incargo_enterprise.administrative_notes_for(p_type text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform incargo_enterprise.require_note_entity(p_type,p_id);
 select coalesce(jsonb_agg(to_jsonb(n) order by created_at,id),'[]'::jsonb) into result
 from incargo_enterprise.administrative_notes n where entity_type=p_type and entity_id=p_id;
 return result;
end$$;
revoke all on function incargo_enterprise.revise_quote(uuid,uuid,text,jsonb),incargo_enterprise.cancel_unassigned_order(uuid,uuid,text),incargo_enterprise.require_note_entity(text,uuid),incargo_enterprise.add_administrative_note(uuid,text,uuid,text,text),incargo_enterprise.administrative_notes_for(text,uuid) from public,anon,authenticated;
commit;
