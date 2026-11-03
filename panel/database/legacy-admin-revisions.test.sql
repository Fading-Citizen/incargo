-- Synthetic local-only fixtures. Grants below exist solely in this test database.
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into public.incargo_memberships(user_id,role) values('00000000-0000-0000-0000-000000000001','operations'),('00000000-0000-0000-0000-000000000002','operations'),('00000000-0000-0000-0000-000000000003','driver');
insert into incargo_admin.documents(id,kind,source_snapshot_sha256,source_key,original_payload,source_verified) values
('10000000-0000-0000-0000-000000000001','inspection',repeat('a',64),'row1','{"ciudad":"Bogotá","firma":"original-evidence","items":"original-checklist","licencia":"0012"}',true),
('10000000-0000-0000-0000-000000000002','inspection',repeat('a',64),'row2','{}',false);
insert into incargo_admin.document_access values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',true),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',true),('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',true);
do $$begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='incargo_admin' and c.relkind='r' and not c.relrowsecurity) then raise exception 'RLS missing';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='incargo_admin' and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))) then raise exception 'Unexpected function grant';end if;
 if has_schema_privilege('authenticated','incargo_admin','USAGE') or has_table_privilege('authenticated','incargo_admin.documents','SELECT') or has_function_privilege('anon','incargo_admin.read_document(uuid)','EXECUTE') then raise exception 'Unexpected exposed permissions';end if;
end$$;
grant usage on schema incargo_admin to authenticated;
grant execute on function incargo_admin.read_document(uuid),incargo_admin.correct_inspection(uuid,integer,uuid,jsonb,text) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$begin
 begin perform incargo_admin.read_document('10000000-0000-0000-0000-000000000001');raise exception 'Expected denial';exception when insufficient_privilege then null;end;
 begin perform incargo_admin.correct_inspection('10000000-0000-0000-0000-000000000001',0,'20000000-0000-0000-0000-000000000001','{}','test');raise exception 'Expected denial';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$begin
 begin perform incargo_admin.read_document('10000000-0000-0000-0000-000000000001');raise exception 'Expected driver denial';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$declare r jsonb;begin
 r:=incargo_admin.correct_inspection('10000000-0000-0000-0000-000000000001',0,'20000000-0000-0000-0000-000000000001','{"ciudad":"Cali","firma":"new-evidence"}','correction');
 if r->>'revision'<>'1' or r->>'replayed'<>'false' then raise exception 'Bad receipt';end if;
 r:=incargo_admin.correct_inspection('10000000-0000-0000-0000-000000000001',0,'20000000-0000-0000-0000-000000000001','{"ciudad":"Cali","firma":"new-evidence"}','correction');
 if r->>'revision'<>'1' or r->>'replayed'<>'true' then raise exception 'Bad retry';end if;
 begin perform incargo_admin.correct_inspection('10000000-0000-0000-0000-000000000001',0,'20000000-0000-0000-0000-000000000001','{"ciudad":"Other"}','correction');raise exception 'Expected request conflict';exception when unique_violation then null;end;
 begin perform incargo_admin.correct_inspection('10000000-0000-0000-0000-000000000001',0,'20000000-0000-0000-0000-000000000002','{}','correction');raise exception 'Expected revision conflict';exception when serialization_failure then null;end;
 begin perform incargo_admin.correct_inspection('10000000-0000-0000-0000-000000000001',1,'20000000-0000-0000-0000-000000000003','{"items":"replacement"}','correction');raise exception 'Expected protected field';exception when raise_exception then if sqlerrm<>'Field not editable' then raise;end if;end;
 begin perform incargo_admin.read_document('10000000-0000-0000-0000-000000000002');raise exception 'Expected reconciliation required';exception when raise_exception then if sqlerrm<>'Source reconciliation required' then raise;end if;end;
 r:=incargo_admin.read_document('10000000-0000-0000-0000-000000000001');
 if r#>>'{data,licencia}'<>'0012' or r#>>'{data,items}'<>'original-checklist' then raise exception 'Original data lost';end if;
 begin perform 1 from incargo_admin.documents;raise exception 'Expected table denial';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$begin
 if (select count(*) from incargo_admin.revisions)<>1 then raise exception 'Duplicate mutation';end if;
 if (select original_payload->>'firma' from incargo_admin.documents where source_key='row1')<>'original-evidence' then raise exception 'Evidence overwritten';end if;
 begin update incargo_admin.revisions set reason='changed';raise exception 'Expected immutable history';exception when raise_exception then if sqlerrm<>'Revision history is immutable' then raise;end if;end;
end$$;
delete from incargo_admin.document_access where user_id='00000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$begin
 begin perform incargo_admin.read_document('10000000-0000-0000-0000-000000000001');raise exception 'Expected revoked access';exception when insufficient_privilege then null;end;
end$$;
reset role;
