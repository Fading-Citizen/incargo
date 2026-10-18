-- APPLIED via dashboard 2026-10-18 to Incargo gmjsqboyuvierfwruspv. DO NOT REAPPLY.
-- Explicitly authorized by the user; final ACL verified after the follow-up below.
-- Dashboard application record; not registered in CLI migration history.
begin;

create function incargo_private.start_delivery(p_delivery uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  delivery public.incargo_deliveries%rowtype;
  prior public.incargo_delivery_events%rowtype;
begin
  if actor is null then
    raise exception using errcode='42501',message='operations required';
  end if;
  if p_delivery is null or p_request is null then
    raise exception using errcode='22023',message='invalid departure request';
  end if;
  -- Serialize this authorization decision with membership update/revocation.
  -- Operations currently has project-wide scope; there is no operator/company relation.
  perform 1 from public.incargo_memberships
    where user_id=actor and role='operations' for share;
  if not found then
    raise exception using errcode='42501',message='operations required';
  end if;
  select * into delivery from public.incargo_deliveries where id=p_delivery for update;
  if not found then
    raise exception using errcode='22023',message='delivery unavailable';
  end if;
  select * into prior from public.incargo_delivery_events where request_id=p_request;
  if found then
    if prior.delivery_id<>p_delivery or prior.actor_user_id is distinct from actor or prior.event_type<>'in_transit' then
      raise exception using errcode='22023',message='departure request conflict';
    end if;
    -- A replay acknowledges the original event, never restores an older state.
    return jsonb_build_object('status',delivery.status,'outcome','replayed');
  end if;
  if delivery.status='in_transit' then
    return jsonb_build_object('status',delivery.status,'outcome','already_in_transit');
  end if;
  if delivery.status<>'pending' then
    raise exception using errcode='22023',message='departure requires pending delivery';
  end if;
  -- The unique request_id constraint also rejects concurrent cross-delivery reuse.
  -- An error rolls back both writes in the RPC's transaction.
  insert into public.incargo_delivery_events(delivery_id,event_type,actor_user_id,request_id)
    values(p_delivery,'in_transit',actor,p_request);
  update public.incargo_deliveries set status='in_transit' where id=p_delivery;
  return jsonb_build_object('status','in_transit','outcome','started');
end $$;

create function public.incargo_start_delivery(p_delivery uuid,p_request uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select incargo_private.start_delivery(p_delivery,p_request)
$$;

revoke all on function incargo_private.start_delivery(uuid,uuid) from public,anon,authenticated;
revoke all on function public.incargo_start_delivery(uuid,uuid) from public,anon,authenticated;
-- Invoker wrapper needs EXECUTE on the private implementation. Both entry points
-- enforce the same operations membership in the implementation. No table/RLS grants.
grant execute on function incargo_private.start_delivery(uuid,uuid) to authenticated;
grant execute on function public.incargo_start_delivery(uuid,uuid) to authenticated;
commit;

-- Follow-up after observing the existing public-schema default grant.
begin;
revoke execute on function public.incargo_start_delivery(uuid,uuid) from service_role;
commit;
