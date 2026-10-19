-- APPLIED 2026-10-19 via Supabase Dashboard. DO NOT REAPPLY. Incargo gmjsqboyuvierfwruspv.
-- Optional per-delivery data, no backfill, defaults, RLS or table grants.
begin;
alter table public.incargo_deliveries
 add column origin_text text constraint incargo_origin_length check (origin_text is null or (length(btrim(origin_text)) between 1 and 200)),
 add column cargo_description text constraint incargo_cargo_length check (cargo_description is null or (length(btrim(cargo_description)) between 1 and 500)),
 add column package_count integer constraint incargo_package_positive check (package_count > 0),
 add column gross_weight_kg numeric constraint incargo_weight_valid check (gross_weight_kg > 0 and gross_weight_kg <= 999999999.999 and scale(gross_weight_kg) <= 3);
comment on column public.incargo_deliveries.origin_text is 'Client-visible origin entered by operations; optional, not inferred from route';
comment on column public.incargo_deliveries.cargo_description is 'Client-visible cargo description entered by operations; no private notes';
comment on column public.incargo_deliveries.gross_weight_kg is 'Optional gross weight in kilograms, at most three decimals';
create function incargo_private.client_delivery_cargo(p_delivery uuid)
returns table(delivery_id uuid,origin_text text,cargo_description text,package_count integer,gross_weight_kg numeric)
language sql stable security definer set search_path = '' as $$
 select d.id,d.origin_text,d.cargo_description,d.package_count,d.gross_weight_kg
 from public.incargo_client_memberships m
 join public.incargo_client_delivery_links l on l.account_id=m.account_id
 join public.incargo_deliveries d on d.id=l.delivery_id
 where m.user_id=(select auth.uid()) and d.id=p_delivery
$$;
create function public.incargo_client_delivery_cargo(p_delivery uuid)
returns table(delivery_id uuid,origin_text text,cargo_description text,package_count integer,gross_weight_kg numeric)
language sql stable security invoker set search_path = '' as $$
 select * from incargo_private.client_delivery_cargo(p_delivery)
$$;
revoke all on function incargo_private.client_delivery_cargo(uuid) from public,anon,authenticated,service_role;
revoke all on function public.incargo_client_delivery_cargo(uuid) from public,anon,authenticated,service_role;
grant execute on function incargo_private.client_delivery_cargo(uuid) to authenticated;
grant execute on function public.incargo_client_delivery_cargo(uuid) to authenticated;
commit;
