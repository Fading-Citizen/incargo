-- REVIEW ONLY. Not applied. Incargo gmjsqboyuvierfwruspv only.
-- New authenticated read surface; requires explicit activation approval.
-- Existing RPC signatures, table grants, RLS and Auth remain unchanged.
begin;
create function incargo_private.client_delivery_logistics(p_delivery uuid)
returns table(delivery_id uuid,destination_text text,route_label text,scheduled_date date)
language sql stable security definer set search_path = '' as $$
  select d.id,nullif(btrim(d.destination_text),''),nullif(btrim(t.route_label),''),t.scheduled_date
  from public.incargo_client_memberships m
  join public.incargo_client_delivery_links l on l.account_id=m.account_id
  join public.incargo_deliveries d on d.id=l.delivery_id
  join public.incargo_trips t on t.id=d.trip_id
  where m.user_id=(select auth.uid()) and d.id=p_delivery
$$;
create function public.incargo_client_delivery_logistics(p_delivery uuid)
returns table(delivery_id uuid,destination_text text,route_label text,scheduled_date date)
language sql stable security invoker set search_path = '' as $$
  select * from incargo_private.client_delivery_logistics(p_delivery)
$$;
-- Explicitly remove inherited default EXECUTE, including service_role.
revoke all on function incargo_private.client_delivery_logistics(uuid) from public,anon,authenticated,service_role;
revoke all on function public.incargo_client_delivery_logistics(uuid) from public,anon,authenticated,service_role;
-- Both entries enforce identical account/delivery ownership in the helper.
grant execute on function incargo_private.client_delivery_logistics(uuid) to authenticated;
grant execute on function public.incargo_client_delivery_logistics(uuid) to authenticated;
commit;
