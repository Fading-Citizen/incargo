-- Synthetic records in disposable PostgreSQL only.
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004');
insert into public.incargo_memberships(user_id,role) values('00000000-0000-0000-0000-000000000001','operations'),('00000000-0000-0000-0000-000000000002','operations'),('00000000-0000-0000-0000-000000000003','driver');
insert into incargo_admin.documents(kind,hash,original_raw,original_payload,source_snapshot)
select kind,encode(sha256(convert_to(raw,'UTF8')),'hex'),raw,raw::jsonb,repeat('a',64) from (values
 ('inspections','{"ciudad":"Bogotá","firma":"original-evidence","items":"original-checklist","licencia":"0012"}'),
 ('affiliations','{"nombreCompleto":"Original","aceptaContrato":"SI","versionContrato":"v1","firmaB64":"[TRUNC]"}')) f(kind,raw);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$declare raw text:='{"ciudad":"Bogotá","firma":"original-evidence","items":"original-checklist","licencia":"0012"}'; h text; r jsonb;begin
 h:=encode(sha256(convert_to(raw,'UTF8')),'hex');
 r:=public.incargo_legacy_correct('inspections',h,raw,repeat('a',64),0,'20000000-0000-0000-0000-000000000001','{"ciudad":"Cali"}','correction');
 if r->>'revision'<>'1' or r->>'replayed'<>'false' then raise exception 'Bad receipt';end if;
 r:=public.incargo_legacy_correct('inspections',h,null,null,0,'20000000-0000-0000-0000-000000000001','{"ciudad":"Cali"}','correction');
 if r->>'revision'<>'1' or r->>'replayed'<>'true' then raise exception 'Bad retry';end if;
 begin perform public.incargo_legacy_correct('inspections',h,null,null,0,'20000000-0000-0000-0000-000000000001','{"ciudad":"Other"}','correction');raise exception 'Expected request conflict';exception when unique_violation then null;end;
 begin perform public.incargo_legacy_correct('inspections',h,null,null,0,'20000000-0000-0000-0000-000000000002','{"ciudad":"Other"}','correction');raise exception 'Expected revision conflict';exception when serialization_failure then null;end;
 begin perform public.incargo_legacy_correct('inspections',h,null,null,1,'20000000-0000-0000-0000-000000000003','{"items":"replacement"}','correction');raise exception 'Expected protected field';exception when raise_exception then if sqlerrm<>'Field not editable' then raise;end if;end;
 begin perform public.incargo_legacy_correct('inspections',h,null,null,1,'20000000-0000-0000-0000-000000000003','{"firma":"data:image/svg+xml;base64,abc"}','correction');raise exception 'Expected evidence rejection';exception when raise_exception then if sqlerrm<>'Invalid evidence' then raise;end if;end;
 r:=public.incargo_legacy_versions('inspections',h);
 if public.incargo_legacy_revision('inspections',h,1)#>>'{data,licencia}'<>'0012' or public.incargo_legacy_revision('inspections',h,1)#>>'{data,items}'<>'original-checklist' or r#>>'{0,original,firma}'<>'original-evidence' then raise exception 'Original lost';end if;
 begin perform 1 from incargo_admin.documents;raise exception 'Expected table denial';exception when insufficient_privilege then null;end;
 begin perform public.incargo_legacy_correct('inspections',repeat('b',64),raw,repeat('a',64),0,'20000000-0000-0000-0000-000000000004','{"ciudad":"Other"}','correction');raise exception 'Expected unarchived source rejection';exception when invalid_parameter_value then null;end;
end$$;
-- Another/future operations user automatically has read AND edit rights.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$declare raw text:='{"nombreCompleto":"Original","aceptaContrato":"SI","versionContrato":"v1","firmaB64":"[TRUNC]"}'; h text; r jsonb;begin
 if jsonb_array_length(public.incargo_legacy_versions('inspections'))<>1 then raise exception 'Other operator denied';end if;
 h:=encode(sha256(convert_to(raw,'UTF8')),'hex');
 perform public.incargo_legacy_correct('affiliations',h,raw,repeat('a',64),0,'20000000-0000-0000-0000-000000000005','{"nombreCompleto":"Corregido"}','spelling');
 r:=public.incargo_legacy_versions('affiliations',h);
 if public.incargo_legacy_revision('affiliations',h,1)#>>'{data,aceptaContrato}'<>'SI' or public.incargo_legacy_revision('affiliations',h,1)#>>'{data,firmaB64}'<>'[TRUNC]' or r#>>'{0,original,nombreCompleto}'<>'Original' then raise exception 'Consent altered';end if;
 begin perform public.incargo_legacy_correct('affiliations',h,null,null,1,'20000000-0000-0000-0000-000000000006','{"aceptaContrato":"SI"}','test');raise exception 'Expected protected consent';exception when raise_exception then if sqlerrm<>'Field not editable' then raise;end if;end;
end$$;
-- Driver and authenticated client with no operations membership are denied.
do $$declare who text;begin
 foreach who in array array['00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'] loop
 perform set_config('request.jwt.claim.sub',who,false);
 begin perform public.incargo_legacy_versions('inspections');raise exception 'Expected role denial';exception when insufficient_privilege then null;end;
 begin perform public.incargo_legacy_correct('inspections',repeat('a',64),'{}',repeat('a',64),0,'20000000-0000-0000-0000-000000000009','{"ciudad":"x"}','test');raise exception 'Expected write denial';exception when insufficient_privilege then null;end;
 end loop;
end$$;
reset role;
do $$begin
 if has_function_privilege('anon','public.incargo_legacy_versions(text,text)','EXECUTE') or has_table_privilege('authenticated','incargo_admin.documents','SELECT') or has_schema_privilege('authenticated','incargo_admin','USAGE') then raise exception 'Excess grants';end if;
 begin update incargo_admin.documents set original_raw='{}';raise exception 'Expected immutable source';exception when raise_exception then if sqlerrm<>'Originals and history are immutable' then raise;end if;end;
 begin delete from incargo_admin.revisions;raise exception 'Expected immutable history';exception when raise_exception then if sqlerrm<>'Originals and history are immutable' then raise;end if;end;
end$$;

-- A member added after deployment inherits access, then loses it on revocation.
insert into public.incargo_memberships(user_id,role) values('00000000-0000-0000-0000-000000000004','operations');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $$declare h text;begin
 h:=public.incargo_legacy_versions('affiliations')->0->>'hash';
 perform public.incargo_legacy_correct('affiliations',h,null,null,1,'20000000-0000-0000-0000-000000000010','{"nombreCompleto":"New operator edit"}','authorized correction');
end$$;
reset role;
delete from public.incargo_memberships where user_id='00000000-0000-0000-0000-000000000004';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $$begin
 begin perform public.incargo_legacy_versions('affiliations');raise exception 'Expected revoked role';exception when insufficient_privilege then null;end;
end$$;
reset role;
