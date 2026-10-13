-- Prevent direct status changes outside the confirmation/novedad RPCs.
revoke update on public.incargo_deliveries from authenticated;
grant update (trip_id,customer_name,destination_text,invoice_reference,remittance_reference) on public.incargo_deliveries to authenticated;

create function public.incargo_list_tracking_links(p_delivery uuid) returns table(id uuid,expires_at timestamptz,revoked_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not incargo_private.is_operations() then raise exception 'not authorized'; end if;
  return query select l.id,l.expires_at,l.revoked_at from incargo_private.tracking_links l where l.delivery_id=p_delivery order by l.created_at desc;
end $$;
create function public.incargo_revoke_tracking_link_by_id(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not incargo_private.is_operations() then raise exception 'not authorized'; end if;
  update incargo_private.tracking_links set revoked_at=now() where id=p_id and revoked_at is null;
end $$;
revoke execute on function public.incargo_list_tracking_links(uuid),public.incargo_revoke_tracking_link_by_id(uuid) from public,anon,authenticated;
grant execute on function public.incargo_list_tracking_links(uuid),public.incargo_revoke_tracking_link_by_id(uuid) to authenticated;
