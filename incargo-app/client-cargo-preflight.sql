-- READ ONLY. Run only in Incargo gmjsqboyuvierfwruspv before approval/application.
select table_schema,table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema in ('public','incargo_private')
and (column_name in ('origin_text','cargo_description','package_count','gross_weight_kg')
 or (table_name='incargo_deliveries' and column_name in ('id','trip_id','destination_text')))
order by table_schema,table_name,column_name;
select to_regprocedure('public.incargo_client_delivery_cargo(uuid)'),to_regprocedure('incargo_private.client_delivery_cargo(uuid)');
select grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='incargo_deliveries';
select policyname,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='incargo_deliveries';
