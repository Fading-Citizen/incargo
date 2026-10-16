-- Read-only verification after applying client-portal.proposal.sql in Incargo.
select c.relname as table_name,c.relrowsecurity as rls_enabled,
 has_table_privilege('anon',c.oid,'SELECT') as anon_select,
 has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('incargo_client_accounts','incargo_client_memberships','incargo_client_delivery_links')
 order by c.relname;
select proname,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and proname like 'incargo_client_%' order by proname;
select (select count(*) from public.incargo_client_accounts) as client_accounts,
 (select count(*) from public.incargo_client_memberships) as client_memberships,
 (select count(*) from public.incargo_client_delivery_links) as linked_deliveries;
