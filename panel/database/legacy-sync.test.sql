-- Isolated synthetic fixtures only; production never receives these records.
update incargo_http.fixture set raw='[{"_rowNumber":1,"ciudad":"Original","firma":"[TRUNC]"}]' where kind='inspections';
select incargo_admin.sync_legacy('inspections');
do $$declare h text; r jsonb;begin
 h:=encode(sha256(convert_to('{"_rowNumber":1,"ciudad":"Original","firma":"[TRUNC]"}','UTF8')),'hex');
 if not exists(select 1 from incargo_admin.documents where kind='inspections' and hash=h and original_payload->>'firma'='[TRUNC]') then raise exception 'Source not preserved';end if;
 if (select last_added from incargo_admin.sync_state where kind='inspections')<>1 then raise exception 'Bad added count';end if;
 if incargo_admin.compact_json('{ "number": 1, "text": "O''Hare", "array": [true,null,"á"] }')<>'{"number":1,"text":"O''Hare","array":[true,null,"á"]}' then raise exception 'Canonical identity mismatch';end if;
end$$;
update incargo_admin.sync_state set last_attempt=null where kind='inspections';
select incargo_admin.sync_legacy('inspections');
do $$begin if (select last_added from incargo_admin.sync_state where kind='inspections')<>0 then raise exception 'Replay inserted duplicate';end if;end$$;
-- New source row becomes editable after atomic preservation; consent stays literal.
update incargo_http.fixture set raw='[{"nombreCompleto":"New request","aceptaContrato":"SI","firmaB64":"[TRUNC]"}]' where kind='affiliations';
select incargo_admin.sync_legacy('affiliations');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$declare h text; r jsonb;begin
 h:=encode(sha256(convert_to('{"nombreCompleto":"New request","aceptaContrato":"SI","firmaB64":"[TRUNC]"}','UTF8')),'hex');
 perform public.incargo_legacy_correct('affiliations',h,null,null,0,'40000000-0000-0000-0000-000000000001','{"nombreCompleto":"Corrected"}','spelling');
 r:=public.incargo_legacy_board('affiliations');
 if r#>>'{sync,error}' is not null or not exists(select 1 from jsonb_array_elements(r->'records') x where x->>'hash'=h and x#>>'{data,nombreCompleto}'='Corrected') then raise exception 'New request not readable/editable';end if;
 begin perform incargo_admin.sync_legacy('inspections');raise exception 'Private worker exposed';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$begin
 begin perform public.incargo_legacy_sync('inspections');raise exception 'Driver sync allowed';exception when insufficient_privilege then null;end;
 begin perform public.incargo_legacy_board('inspections');raise exception 'Driver read allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
-- A malformed later row must roll back an otherwise valid first row and snapshot.
update incargo_http.fixture set raw='[{"ciudad":"Must roll back"},null]' where kind='inspections';
update incargo_admin.sync_state set last_attempt=null where kind='inspections';
select incargo_admin.sync_legacy('inspections');
do $$begin
 if exists(select 1 from incargo_admin.documents where original_payload->>'ciudad'='Must roll back') then raise exception 'Partial import leaked';end if;
 if exists(select 1 from incargo_admin.source_snapshots where raw like '%Must roll back%') then raise exception 'Failed snapshot persisted';end if;
 if (select last_error from incargo_admin.sync_state where kind='inspections') is null then raise exception 'Failure not recorded';end if;
end$$;
-- Oversize, timeout and upstream errors preserve the last successful state.
do $$declare before_success timestamptz; scenario text; result jsonb;begin
 select last_success into before_success from incargo_admin.sync_state where kind='inspections';
 foreach scenario in array array['size','timeout','http','invalid','duplicate'] loop
 update incargo_admin.sync_state set last_attempt=null where kind='inspections';
 update incargo_http.fixture set status=case when scenario='http' then 503 else 200 end,error=case when scenario='timeout' then 'timeout' else null end,
 raw=case when scenario='size' then repeat('x',2500001) when scenario='invalid' then '{broken' when scenario='duplicate' then '[{},{}]' else '[]' end where kind='inspections';
 result:=incargo_admin.sync_legacy('inspections');
 if result->>'ok'<>'false' or (select last_success from incargo_admin.sync_state where kind='inspections')<>before_success then raise exception 'Failure claimed fresh data';end if;
 end loop;
end$$;
-- Recovery and a legitimate empty response do not delete originals/history.
update incargo_http.fixture set raw='[]',status=200,error=null where kind='inspections';
update incargo_admin.sync_state set last_attempt=null where kind='inspections';
select incargo_admin.sync_legacy('inspections');
do $$begin
 if (select last_error from incargo_admin.sync_state where kind='inspections') is not null or (select source_records from incargo_admin.sync_state where kind='inspections')<>0 then raise exception 'Recovery failed';end if;
 if not exists(select 1 from incargo_admin.documents where original_payload->>'ciudad'='Original') then raise exception 'Empty response deleted history';end if;
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$declare r jsonb;begin
 r:=public.incargo_legacy_board('inspections');
 if jsonb_array_length(r->'records')=0 then raise exception 'Archived fallback empty';end if;
end$$;
reset role;
