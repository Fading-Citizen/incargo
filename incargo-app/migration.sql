-- Incargo operational data. Apply only to project gmjsqboyuvierfwruspv.
-- Existing inspection and affiliation Sheets remain untouched.
create schema if not exists incargo_private;
revoke all on schema incargo_private from public, anon, authenticated;

create table public.incargo_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('operations','driver')),
  created_at timestamptz not null default now()
);
create table public.incargo_trips (
  id uuid primary key default gen_random_uuid(),
  route_label text not null check (length(trim(route_label)) between 1 and 100),
  scheduled_date date not null,
  vehicle_plate text not null check (length(trim(vehicle_plate)) between 1 and 20),
  driver_user_id uuid references public.incargo_memberships(user_id),
  created_at timestamptz not null default now()
);
create index incargo_trips_driver_idx on public.incargo_trips(driver_user_id);
create table public.incargo_deliveries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.incargo_trips(id),
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  destination_text text,
  invoice_reference text,
  remittance_reference text,
  status text not null default 'pending' check (status in ('pending','in_transit','exception','delivered')),
  created_at timestamptz not null default now()
);
create index incargo_deliveries_trip_idx on public.incargo_deliveries(trip_id);
create table public.incargo_delivery_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.incargo_deliveries(id),
  event_type text not null check (event_type in ('created','in_transit','exception','delivered')),
  note text,
  actor_user_id uuid references auth.users(id),
  request_id uuid unique,
  occurred_at timestamptz not null default now()
);
create index incargo_events_delivery_idx on public.incargo_delivery_events(delivery_id,occurred_at);
create table public.incargo_delivery_proofs (
  delivery_id uuid primary key references public.incargo_deliveries(id),
  object_path text not null unique,
  receiver_name text not null check (length(trim(receiver_name)) between 1 and 120),
  observation text,
  captured_by uuid not null references auth.users(id),
  captured_at timestamptz not null default now()
);
create table incargo_private.tracking_links (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.incargo_deliveries(id),
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index incargo_links_delivery_idx on incargo_private.tracking_links(delivery_id);

create function incargo_private.is_operations() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.incargo_memberships where user_id = (select auth.uid()) and role='operations')
$$;
create function incargo_private.is_assigned(p_trip uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.incargo_trips where id=p_trip and driver_user_id=(select auth.uid()))
$$;
revoke all on function incargo_private.is_operations() from public;
revoke all on function incargo_private.is_assigned(uuid) from public;
grant usage on schema incargo_private to authenticated;
grant execute on function incargo_private.is_operations() to authenticated;
grant execute on function incargo_private.is_assigned(uuid) to authenticated;

alter table public.incargo_memberships enable row level security;
alter table public.incargo_trips enable row level security;
alter table public.incargo_deliveries enable row level security;
alter table public.incargo_delivery_events enable row level security;
alter table public.incargo_delivery_proofs enable row level security;
alter table incargo_private.tracking_links enable row level security;

create policy memberships_read on public.incargo_memberships for select to authenticated using (user_id=(select auth.uid()) or (select incargo_private.is_operations()));
create policy trips_read on public.incargo_trips for select to authenticated using ((select incargo_private.is_operations()) or driver_user_id=(select auth.uid()));
create policy trips_insert on public.incargo_trips for insert to authenticated with check ((select incargo_private.is_operations()) and (driver_user_id is null or exists(select 1 from public.incargo_memberships m where m.user_id=driver_user_id and m.role='driver')));
create policy trips_update on public.incargo_trips for update to authenticated using ((select incargo_private.is_operations())) with check ((select incargo_private.is_operations()) and (driver_user_id is null or exists(select 1 from public.incargo_memberships m where m.user_id=driver_user_id and m.role='driver')));
create policy deliveries_read on public.incargo_deliveries for select to authenticated using ((select incargo_private.is_operations()) or incargo_private.is_assigned(trip_id));
create policy deliveries_insert on public.incargo_deliveries for insert to authenticated with check ((select incargo_private.is_operations()));
create policy deliveries_update on public.incargo_deliveries for update to authenticated using ((select incargo_private.is_operations())) with check ((select incargo_private.is_operations()));
create policy events_read on public.incargo_delivery_events for select to authenticated using ((select incargo_private.is_operations()) or exists(select 1 from public.incargo_deliveries d where d.id=delivery_id and incargo_private.is_assigned(d.trip_id)));
create policy proofs_read on public.incargo_delivery_proofs for select to authenticated using ((select incargo_private.is_operations()) or exists(select 1 from public.incargo_deliveries d where d.id=delivery_id and incargo_private.is_assigned(d.trip_id)));

grant select on public.incargo_memberships to authenticated;
grant select,insert,update on public.incargo_trips to authenticated;
grant select,insert,update on public.incargo_deliveries to authenticated;
grant select on public.incargo_delivery_events to authenticated;
grant select on public.incargo_delivery_proofs to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('incargo-proofs','incargo-proofs',false,10485760,array['image/png','image/jpeg','image/webp']);
create policy incargo_proof_upload on storage.objects for insert to authenticated
with check (bucket_id='incargo-proofs' and split_part(name,'/',1) ~ '^[0-9a-f-]{36}$'
  and exists(select 1 from public.incargo_deliveries d where d.id::text=split_part(name,'/',1) and incargo_private.is_assigned(d.trip_id)));
create policy incargo_proof_read on storage.objects for select to authenticated
using (bucket_id='incargo-proofs' and (incargo_private.is_operations() or exists(select 1 from public.incargo_deliveries d where d.id::text=split_part(name,'/',1) and incargo_private.is_assigned(d.trip_id))));

create function public.incargo_record_issue(p_delivery uuid,p_request uuid,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.incargo_deliveries%rowtype;
begin
  if auth.uid() is null or p_request is null or length(trim(coalesce(p_note,''))) not between 1 and 500 then raise exception 'invalid request'; end if;
  select * into d from public.incargo_deliveries where id=p_delivery for update;
  if not found or not incargo_private.is_assigned(d.trip_id) then raise exception 'not authorized'; end if;
  if exists(select 1 from public.incargo_delivery_events where request_id=p_request and delivery_id=p_delivery and actor_user_id=auth.uid() and event_type='exception') then return; end if;
  if d.status='delivered' then raise exception 'already delivered'; end if;
  insert into public.incargo_delivery_events(delivery_id,event_type,note,actor_user_id,request_id) values (p_delivery,'exception',trim(p_note),auth.uid(),p_request);
  update public.incargo_deliveries set status='exception' where id=p_delivery;
end $$;

create function public.incargo_confirm_delivery(p_delivery uuid,p_request uuid,p_object_path text,p_receiver text,p_observation text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.incargo_deliveries%rowtype;
begin
  if auth.uid() is null or p_request is null or length(trim(coalesce(p_receiver,''))) not between 1 and 120
    or length(coalesce(p_observation,''))>500 then raise exception 'invalid request'; end if;
  select * into d from public.incargo_deliveries where id=p_delivery for update;
  if not found or not incargo_private.is_assigned(d.trip_id) then raise exception 'not authorized'; end if;
  if exists(select 1 from public.incargo_delivery_events where request_id=p_request and delivery_id=p_delivery and actor_user_id=auth.uid() and event_type='delivered') then return; end if;
  if d.status='delivered' then raise exception 'already delivered'; end if;
  if p_object_path not like p_delivery::text || '/%' or not exists(select 1 from storage.objects where bucket_id='incargo-proofs' and name=p_object_path and owner_id=auth.uid()::text) then raise exception 'proof missing'; end if;
  insert into public.incargo_delivery_proofs(delivery_id,object_path,receiver_name,observation,captured_by) values (p_delivery,p_object_path,trim(p_receiver),nullif(trim(coalesce(p_observation,'')),''),auth.uid());
  insert into public.incargo_delivery_events(delivery_id,event_type,actor_user_id,request_id) values (p_delivery,'delivered',auth.uid(),p_request);
  update public.incargo_deliveries set status='delivered' where id=p_delivery;
end $$;

create function public.incargo_create_tracking_link(p_delivery uuid,p_hours int default 72) returns text
language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  if not incargo_private.is_operations() or p_hours not between 1 and 720 or not exists(select 1 from public.incargo_deliveries where id=p_delivery) then raise exception 'not authorized'; end if;
  token := encode(extensions.gen_random_bytes(32),'hex');
  insert into incargo_private.tracking_links(delivery_id,token_hash,expires_at) values (p_delivery,extensions.digest(token,'sha256'),now()+(p_hours||' hours')::interval);
  return token;
end $$;
create function public.incargo_revoke_tracking_link(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not incargo_private.is_operations() then raise exception 'not authorized'; end if;
  update incargo_private.tracking_links set revoked_at=now() where token_hash=extensions.digest(p_token,'sha256');
end $$;
create function public.incargo_read_tracking(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select jsonb_build_object('delivery_id',d.id,'customer_name',d.customer_name,'invoice_reference',d.invoice_reference,'status',d.status,
    'events',(select coalesce(jsonb_agg(jsonb_build_object('type',e.event_type,'at',e.occurred_at) order by e.occurred_at),'[]'::jsonb) from public.incargo_delivery_events e where e.delivery_id=d.id),
    'proof_path',(select p.object_path from public.incargo_delivery_proofs p where p.delivery_id=d.id)) into result
  from incargo_private.tracking_links l join public.incargo_deliveries d on d.id=l.delivery_id
  where l.token_hash=extensions.digest(p_token,'sha256') and l.revoked_at is null and l.expires_at>now();
  return result;
end $$;
revoke all on function public.incargo_record_issue(uuid,uuid,text), public.incargo_confirm_delivery(uuid,uuid,text,text,text), public.incargo_create_tracking_link(uuid,int), public.incargo_revoke_tracking_link(text), public.incargo_read_tracking(text) from public;
grant execute on function public.incargo_record_issue(uuid,uuid,text), public.incargo_confirm_delivery(uuid,uuid,text,text,text), public.incargo_create_tracking_link(uuid,int), public.incargo_revoke_tracking_link(text) to authenticated;
grant execute on function public.incargo_read_tracking(text) to service_role;
