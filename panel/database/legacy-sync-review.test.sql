-- Synthetic regression data only, rolled back before the other concurrency tests.
begin;
update incargo_http.fixture set raw='[{"ciudad":"first"},{"ciudad":"second"},{"ciudad":"third"}]',status=200,error=null where kind='inspections';
update incargo_admin.sync_state set last_attempt=null where kind='inspections';
select incargo_admin.sync_legacy('inspections');
do $$declare labels text[];begin
 select array_agg(x.value#>>'{data,ciudad}' order by x.ordinality) into labels
 from jsonb_array_elements(incargo_admin.board_payload('inspections')->'records') with ordinality x(value,ordinality)
 where x.value->>'archived'='false';
 if labels<>array['first','second','third'] then raise exception 'Source order lost: %',labels;end if;
end$$;
-- Tiny source payloads can still exceed the response budget due to per-row metadata.
update incargo_http.fixture set raw=(select json_agg(json_build_object('i',i))::text from generate_series(1,14000) i) where kind='inspections';
update incargo_admin.sync_state set last_attempt=null where kind='inspections';
do $$declare previous_count integer; result jsonb;begin
 select count(*) into previous_count from incargo_admin.documents where kind='inspections';
 result:=incargo_admin.sync_legacy('inspections');
 if result->>'error'<>'SOURCE_LIMIT' then raise exception 'Oversized board accepted: %',result;end if;
 if (select count(*) from incargo_admin.documents where kind='inspections')<>previous_count then raise exception 'Oversized import partially persisted';end if;
 if octet_length(incargo_admin.board_payload('inspections')::text)>=3000000 then raise exception 'Fallback board unreadable';end if;
end$$;
-- Build a readable board close to its full serialized budget; a small valid
-- correction must not make it unreadable. The failed write leaves no receipt.
update incargo_http.fixture set raw=(select json_agg(json_build_object('i',i))::text from generate_series(1,10000) i) where kind='inspections';
update incargo_admin.sync_state set last_attempt=null where kind='inspections';
select incargo_admin.sync_legacy('inspections');
do $$declare padding integer; new_row json;begin
 padding:=2900000-octet_length(incargo_admin.board_payload('inspections')::text)-1500;
 if padding<0 then raise exception 'Invalid boundary fixture';end if;
 new_row:=json_build_object('padding',repeat('x',padding),'ciudad','before');
 update incargo_http.fixture set raw=left(raw,length(raw)-1)||','||new_row::text||']' where kind='inspections';
end$$;
update incargo_admin.sync_state set last_attempt=null where kind='inspections';
select incargo_admin.sync_legacy('inspections');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$declare h text; revision_count integer;begin
 if (select last_error from incargo_admin.sync_state where kind='inspections') is not null then raise exception 'Boundary fixture failed';end if;
 select hash into strict h from incargo_admin.documents where kind='inspections' and original_payload ? 'padding';
 select count(*) into revision_count from incargo_admin.revisions;
 begin
  perform public.incargo_legacy_correct('inspections',h,null,null,0,'50000000-0000-0000-0000-000000000001',jsonb_build_object('ciudad',repeat('y',2000)),'budget regression');
  raise exception 'Oversized correction accepted';
 exception when string_data_right_truncation then null;end;
 if (select count(*) from incargo_admin.revisions)<>revision_count or (select current_revision from incargo_admin.documents where kind='inspections' and hash=h)<>0 then raise exception 'Rejected correction changed history';end if;
 if octet_length(incargo_admin.board_payload('inspections')::text)>2900000 then raise exception 'Correction broke response budget';end if;
 if has_function_privilege('authenticated','incargo_admin.board_payload(text)','EXECUTE') or has_function_privilege('anon','incargo_admin.check_board_size(text)','EXECUTE') then raise exception 'Private helpers exposed';end if;
end$$;
rollback;
