-- REVIEW ONLY. Do not run on Supabase until identity, assignment and visible fields are approved.
-- Apply only after verifying the current production schema/migrations and backing up state.
-- No existing delivery is linked by this proposal.
begin;

create table public.incargo_client_accounts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
create table public.incargo_client_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_id uuid not null references public.incargo_client_accounts(id),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
create index incargo_client_memberships_account_idx on public.incargo_client_memberships(account_id);
create table public.incargo_client_delivery_links (
  delivery_id uuid primary key references public.incargo_deliveries(id) on delete cascade,
  account_id uuid not null references public.incargo_client_accounts(id),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
create index incargo_client_delivery_links_account_idx on public.incargo_client_delivery_links(account_id,delivery_id);
create table incargo_private.client_link_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (action in ('link_user','unlink_user','assign_delivery','unassign_delivery')),
  account_id uuid not null,
  user_id uuid,
  delivery_id uuid,
  occurred_at timestamptz not null default now()
);

alter table public.incargo_client_accounts enable row level security;
alter table public.incargo_client_memberships enable row level security;
alter table public.incargo_client_delivery_links enable row level security;
alter table incargo_private.client_link_audit enable row level security;
-- No table policies or table grants for anon/authenticated. Access is through narrow RPCs.
revoke all on public.incargo_client_accounts, public.incargo_client_memberships, public.incargo_client_delivery_links from public, anon, authenticated;
revoke all on incargo_private.client_link_audit from public, anon, authenticated;

create function public.incargo_client_create_account(p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not incargo_private.is_operations() then raise exception 'not authorized'; end if;
  if length(trim(coalesce(p_display_name,''))) not between 1 and 120 then raise exception 'invalid account name'; end if;
  insert into public.incargo_client_accounts(display_name,created_by) values (trim(p_display_name),auth.uid()) returning id into v_id;
  return v_id;
end $$;
create function public.incargo_client_link_user(p_account uuid,p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not incargo_private.is_operations() then raise exception 'not authorized'; end if;
  -- p_user must be the exact Auth UUID independently verified by operations.
  insert into public.incargo_client_memberships(user_id,account_id,created_by) values (p_user,p_account,auth.uid());
  insert into incargo_private.client_link_audit(actor_user_id,action,account_id,user_id) values (auth.uid(),'link_user',p_account,p_user);
end $$;
create function public.incargo_client_unlink_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_account uuid;
begin
  if auth.uid() is null or not incargo_private.is_operations() then raise exception 'not authorized'; end if;
  delete from public.incargo_client_memberships where user_id=p_user returning account_id into v_account;
  if v_account is not null then insert into incargo_private.client_link_audit(actor_user_id,action,account_id,user_id) values (auth.uid(),'unlink_user',v_account,p_user); end if;
end $$;
create function public.incargo_client_assign_delivery(p_account uuid,p_delivery uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not incargo_private.is_operations() then raise exception 'not authorized'; end if;
  -- Primary key rejects an existing owner. Reassignment needs explicit unlink and audit.
  insert into public.incargo_client_delivery_links(delivery_id,account_id,created_by) values (p_delivery,p_account,auth.uid());
  insert into incargo_private.client_link_audit(actor_user_id,action,account_id,delivery_id) values (auth.uid(),'assign_delivery',p_account,p_delivery);
end $$;
create function public.incargo_client_unassign_delivery(p_delivery uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_account uuid;
begin
  if auth.uid() is null or not incargo_private.is_operations() then raise exception 'not authorized'; end if;
  delete from public.incargo_client_delivery_links where delivery_id=p_delivery returning account_id into v_account;
  if v_account is not null then insert into incargo_private.client_link_audit(actor_user_id,action,account_id,delivery_id) values (auth.uid(),'unassign_delivery',v_account,p_delivery); end if;
end $$;

create function public.incargo_client_admin_accounts()
returns table(account_id uuid,display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not incargo_private.is_operations() then raise exception 'not authorized'; end if;
  return query select a.id,a.display_name from public.incargo_client_accounts a order by a.display_name,a.id;
end $$;

create function public.incargo_client_identity()
returns table(account_id uuid,display_name text)
language sql stable security definer set search_path = '' as $$
  select a.id,a.display_name from public.incargo_client_memberships m
  join public.incargo_client_accounts a on a.id=m.account_id
  where m.user_id=(select auth.uid())
$$;

create function public.incargo_client_my_deliveries(p_before_created_at timestamptz default null,p_before_id uuid default null)
returns table(delivery_id uuid,reference text,status text,created_at timestamptz,last_event_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id,coalesce(nullif(d.remittance_reference,''),'Sin remesa'),d.status,d.created_at,
    (select max(e.occurred_at) from public.incargo_delivery_events e where e.delivery_id=d.id and e.event_type in ('created','in_transit','exception','delivered'))
  from public.incargo_client_memberships m
  join public.incargo_client_delivery_links l on l.account_id=m.account_id
  join public.incargo_deliveries d on d.id=l.delivery_id
  where m.user_id=(select auth.uid())
    and (p_before_created_at is null or (d.created_at,d.id)<(p_before_created_at,p_before_id))
  order by d.created_at desc,d.id desc
  limit 50
$$;
create function public.incargo_client_delivery_milestones(p_delivery uuid)
returns table(event_type text,occurred_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.event_type,e.occurred_at from public.incargo_delivery_events e
  join public.incargo_client_delivery_links l on l.delivery_id=e.delivery_id
  join public.incargo_client_memberships m on m.account_id=l.account_id
  where e.delivery_id=p_delivery and m.user_id=(select auth.uid())
    and e.event_type in ('created','in_transit','exception','delivered')
  order by e.occurred_at,e.id
$$;

revoke all on function public.incargo_client_create_account(text),public.incargo_client_link_user(uuid,uuid),public.incargo_client_unlink_user(uuid),public.incargo_client_assign_delivery(uuid,uuid),public.incargo_client_unassign_delivery(uuid),public.incargo_client_admin_accounts(),public.incargo_client_identity(),public.incargo_client_my_deliveries(timestamptz,uuid),public.incargo_client_delivery_milestones(uuid) from public,anon,authenticated;
grant execute on function public.incargo_client_create_account(text),public.incargo_client_link_user(uuid,uuid),public.incargo_client_unlink_user(uuid),public.incargo_client_assign_delivery(uuid,uuid),public.incargo_client_unassign_delivery(uuid),public.incargo_client_admin_accounts(),public.incargo_client_identity(),public.incargo_client_my_deliveries(timestamptz,uuid),public.incargo_client_delivery_milestones(uuid) to authenticated;

commit;
