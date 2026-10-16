-- Run read-only in the SQL editor of the Incargo project gmjsqboyuvierfwruspv.
-- Confirm the project selector in the dashboard first; this query cannot authenticate project ownership.
select current_database() as database_name,
       to_regclass('public.incargo_memberships') is not null as has_memberships,
       to_regclass('public.incargo_deliveries') is not null as has_deliveries,
       to_regclass('public.incargo_delivery_events') is not null as has_events,
       to_regclass('public.incargo_client_accounts') is not null as proposal_already_applied;
select table_name,column_name,data_type from information_schema.columns
 where table_schema='public' and table_name in ('incargo_memberships','incargo_deliveries','incargo_delivery_events')
 and column_name in ('user_id','role','id','remittance_reference','status','created_at','delivery_id','event_type','occurred_at')
 order by table_name,ordinal_position;
select proname from pg_proc join pg_namespace on pg_namespace.oid=pg_proc.pronamespace
 where nspname='public' and proname like 'incargo_client_%' order by proname;
