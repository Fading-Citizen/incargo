-- REVIEW ONLY. Requires the same explicitly approved finance scope as invoice queries.
begin;
create function incargo_enterprise.receipt_board() returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 perform incargo_enterprise.require_finance();
 select coalesce(jsonb_agg(row_to_json(r) order by r.received_date desc,r.id),'[]'::jsonb) into result from (
 select p.id,p.account_id,a.display_name as customer,p.currency,p.amount,p.external_reference,p.received_date,p.amount-coalesce(sum(x.amount) filter(where x.reversed_at is null),0) as available
 from incargo_enterprise.receipts p join public.incargo_client_accounts a on a.id=p.account_id left join incargo_enterprise.allocations x on x.receipt_id=p.id group by p.id,a.id
 )r;return result;
end$$;
revoke all on function incargo_enterprise.receipt_board() from public,anon,authenticated;
-- Activation in this file is for review only, not automatically applied.
grant execute on function incargo_enterprise.receipt_board() to authenticated;
create function public.incargo_receipt_board() returns jsonb language sql stable security invoker set search_path='' as $$select incargo_enterprise.receipt_board()$$;
revoke all on function public.incargo_receipt_board() from public,anon,authenticated;
grant execute on function public.incargo_receipt_board() to authenticated;
commit;
