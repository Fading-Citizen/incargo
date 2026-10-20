-- APPLIED 2026-10-20 through authenticated Dashboard transaction. Incargo gmjsqboyuvierfwruspv.
-- Explicit requests, not an enumeration of registered Auth users.
begin;
create table incargo_private.client_access_requests (
 user_id uuid primary key references auth.users(id),
 email text not null,
 company_claim text not null check(length(btrim(company_claim)) between 1 and 120),
 status text not null default 'pending' check(status in ('pending','approved')),
 requested_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 account_id uuid references public.incargo_client_accounts(id),
 reviewed_by uuid references auth.users(id),reviewed_at timestamptz,
 check((status='pending' and account_id is null and reviewed_by is null and reviewed_at is null) or (status='approved' and account_id is not null and reviewed_by is not null and reviewed_at is not null))
);
alter table incargo_private.client_access_requests enable row level security;
revoke all on incargo_private.client_access_requests from public,anon,authenticated,service_role;
create function incargo_private.request_client_access(p_company text) returns text
language plpgsql security definer set search_path='' as $$
declare v_email text; v_status text;
begin
 select email into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null;
 if auth.uid() is null or v_email is null then raise exception 'verified account required'; end if;
 if exists(select 1 from public.incargo_client_memberships where user_id=auth.uid()) then raise exception 'already linked'; end if;
 if length(btrim(coalesce(p_company,''))) not between 1 and 120 then raise exception 'invalid company'; end if;
 insert into incargo_private.client_access_requests(user_id,email,company_claim) values(auth.uid(),v_email,btrim(p_company))
 on conflict(user_id) do update set email=excluded.email,company_claim=excluded.company_claim,updated_at=now() where client_access_requests.status='pending'
 returning status into v_status;
 if v_status is null then raise exception 'request already reviewed'; end if;
 return v_status;
end $$;
create function incargo_private.my_client_access_request()
returns table(status text,company_claim text,requested_at timestamptz)
language sql stable security definer set search_path='' as $$
 select case when r.status='approved' and not exists(select 1 from public.incargo_client_memberships m where m.user_id=r.user_id and m.account_id=r.account_id) then 'review_required' else r.status end,r.company_claim,r.requested_at from incargo_private.client_access_requests r
 join auth.users u on u.id=r.user_id and u.email_confirmed_at is not null and u.deleted_at is null
 where r.user_id=auth.uid()
$$;
create function incargo_private.pending_client_access_requests()
returns table(user_id uuid,email text,company_claim text,requested_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not incargo_private.is_operations() then raise exception 'not authorized'; end if;
 return query select r.user_id,r.email,r.company_claim,r.requested_at,r.updated_at from incargo_private.client_access_requests r
 join auth.users u on u.id=r.user_id and u.email=r.email and u.email_confirmed_at is not null and u.deleted_at is null
 where r.status='pending' order by r.requested_at,r.user_id limit 100;
end $$;
create function incargo_private.approve_client_access_request(p_user uuid,p_account uuid,p_updated_at timestamptz) returns text
language plpgsql security definer set search_path='' as $$
declare v_request incargo_private.client_access_requests; v_existing uuid;
begin
 if auth.uid() is null or not incargo_private.is_operations() then raise exception 'not authorized'; end if;
 select * into v_request from incargo_private.client_access_requests where user_id=p_user for update;
 if not found then raise exception 'request not found'; end if;
 perform 1 from auth.users where id=p_user and email=v_request.email and email_confirmed_at is not null and deleted_at is null for share;
 if not found then raise exception 'verified account required'; end if;
 if not exists(select 1 from public.incargo_client_accounts where id=p_account) then raise exception 'account not found'; end if;
 select account_id into v_existing from public.incargo_client_memberships where user_id=p_user;
 if v_request.status='approved' then
  if v_request.account_id=p_account and v_existing=p_account then return 'approved'; end if;
  raise exception 'access request conflict';
 end if;
 if v_request.updated_at is distinct from p_updated_at then raise exception 'request changed'; end if;
 if v_existing is not null then raise exception 'access request conflict'; end if;
 insert into public.incargo_client_memberships(user_id,account_id,created_by) values(p_user,p_account,auth.uid());
 insert into incargo_private.client_link_audit(actor_user_id,action,account_id,user_id) values(auth.uid(),'link_user',p_account,p_user);
 update incargo_private.client_access_requests set status='approved',account_id=p_account,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where user_id=p_user;
 return 'approved';
end $$;
create function public.incargo_request_client_access(p_company text) returns text
language sql security invoker set search_path='' as $$ select * from incargo_private.request_client_access(p_company) $$;
revoke all on function public.incargo_request_client_access(text) from public,anon,authenticated,service_role;
grant execute on function public.incargo_request_client_access(text) to authenticated;
revoke all on function incargo_private.request_client_access(text) from public,anon,authenticated,service_role;
grant execute on function incargo_private.request_client_access(text) to authenticated;
create function public.incargo_my_client_access_request() returns table(status text,company_claim text,requested_at timestamptz)
language sql security invoker set search_path='' as $$ select * from incargo_private.my_client_access_request() $$;
revoke all on function public.incargo_my_client_access_request() from public,anon,authenticated,service_role;
grant execute on function public.incargo_my_client_access_request() to authenticated;
revoke all on function incargo_private.my_client_access_request() from public,anon,authenticated,service_role;
grant execute on function incargo_private.my_client_access_request() to authenticated;
create function public.incargo_pending_client_access_requests() returns table(user_id uuid,email text,company_claim text,requested_at timestamptz,updated_at timestamptz)
language sql security invoker set search_path='' as $$ select * from incargo_private.pending_client_access_requests() $$;
revoke all on function public.incargo_pending_client_access_requests() from public,anon,authenticated,service_role;
grant execute on function public.incargo_pending_client_access_requests() to authenticated;
revoke all on function incargo_private.pending_client_access_requests() from public,anon,authenticated,service_role;
grant execute on function incargo_private.pending_client_access_requests() to authenticated;
create function public.incargo_approve_client_access_request(p_user uuid,p_account uuid,p_updated_at timestamptz) returns text
language sql security invoker set search_path='' as $$ select * from incargo_private.approve_client_access_request(p_user,p_account,p_updated_at) $$;
revoke all on function public.incargo_approve_client_access_request(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.incargo_approve_client_access_request(uuid,uuid,timestamptz) to authenticated;
revoke all on function incargo_private.approve_client_access_request(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function incargo_private.approve_client_access_request(uuid,uuid,timestamptz) to authenticated;
commit;
