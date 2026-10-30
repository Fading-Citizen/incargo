-- REVIEW PROPOSAL ONLY; no application grants.
begin;
create function incargo_enterprise.order_board() returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 perform incargo_enterprise.require_operations();
 select coalesce(jsonb_agg(row_to_json(r) order by r.created_at desc,r.id),'[]'::jsonb) into result from (
  select o.id,o.account_id,a.display_name as customer,o.quote_id,o.created_at,o.cancelled_at,o.cancellation_reason,q.origin_text,q.destination_text,q.description,q.currency,q.total,
   case when o.cancelled_at is not null then 'cancelled' when count(d.id)=0 then 'unassigned' when bool_and(d.status='delivered') then 'delivered' when bool_or(d.status='exception') then 'exception' when bool_or(d.status='in_transit') then 'in_transit' else 'pending' end as execution_stage,
   coalesce(jsonb_agg(jsonb_build_object('id',d.id,'trip_id',d.trip_id,'status',d.status)) filter(where d.id is not null),'[]'::jsonb) as deliveries
  from incargo_enterprise.orders o join incargo_enterprise.quotes q on q.id=o.quote_id join public.incargo_client_accounts a on a.id=o.account_id
  left join incargo_enterprise.order_deliveries l on l.order_id=o.id left join public.incargo_deliveries d on d.id=l.delivery_id
  group by o.id,q.id,a.id
 )r;return result;
end$$;
create function incargo_enterprise.finance_board() returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 perform incargo_enterprise.require_finance();
 select coalesce(jsonb_agg(row_to_json(r) order by r.issue_date desc,r.id),'[]'::jsonb) into result from (
  select i.id,i.account_id,a.display_name as customer,i.external_number,i.issuer_reference,i.currency,i.issue_date,i.due_date,i.total,i.total-coalesce(sum(x.amount) filter(where x.reversed_at is null),0) as outstanding
  from incargo_enterprise.invoices i join public.incargo_client_accounts a on a.id=i.account_id left join incargo_enterprise.allocations x on x.invoice_id=i.id
  group by i.id,a.id
 )r;return result;
end$$;
create function incargo_enterprise.invoice_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 perform incargo_enterprise.require_finance();select jsonb_build_object('invoice',to_jsonb(i),'allocations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb) from incargo_enterprise.allocations x where x.invoice_id=i.id),'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.occurred_at),'[]'::jsonb) from incargo_enterprise.audit a where a.entity_id=i.id)) into result from incargo_enterprise.invoices i where i.id=p_id;
 if result is null then raise exception 'invoice not found';end if;return result;
end$$;
revoke all on all functions in schema incargo_enterprise from public,anon,authenticated;
commit;
