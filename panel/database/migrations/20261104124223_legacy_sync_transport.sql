-- No credentials. HTTP is private, callable only by the fixed-source worker.
create schema incargo_http;
revoke all on schema incargo_http from public,anon,authenticated;
create extension if not exists http with schema incargo_http;
do $$begin
 if not exists(select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='http' and n.nspname='incargo_http') then raise exception 'HTTP extension must be isolated in incargo_http';end if;
end$$;
revoke all on all functions in schema incargo_http from public,anon,authenticated;
create extension if not exists pg_cron with schema pg_catalog;
