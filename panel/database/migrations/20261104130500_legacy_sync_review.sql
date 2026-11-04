-- Use one serialized payload for reads and write-budget checks. Existing
-- immutable snapshots already preserve source ordinality; no original is changed.
create function incargo_admin.board_payload(p_kind text) returns jsonb
language plpgsql set search_path='' as $$declare st incargo_admin.sync_state; records jsonb;begin
 if p_kind is null or p_kind not in ('inspections','affiliations') then raise exception 'Invalid kind';end if;
 select * into st from incargo_admin.sync_state where kind=p_kind;
 with source_order as materialized (
  select encode(sha256(convert_to(incargo_admin.compact_json(x.value),'UTF8')),'hex') as hash,x.ordinality
  from incargo_admin.source_snapshots s cross join lateral json_array_elements(s.raw::json) with ordinality x(value,ordinality)
  where s.kind=p_kind and s.hash=st.snapshot
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',d.hash,'hash',d.hash,'data',coalesce(r.payload,d.original_payload),'revision',d.current_revision,
 'archived',o.hash is null) order by o.ordinality nulls first,d.captured_at,d.hash),'[]'::jsonb)
 into records from incargo_admin.documents d left join source_order o on o.hash=d.hash left join incargo_admin.revisions r on r.kind=d.kind and r.hash=d.hash and r.revision=d.current_revision where d.kind=p_kind;
 return jsonb_build_object('kind',p_kind,'capturedAt',clock_timestamp(),'snapshot',coalesce(st.snapshot,'not-yet-synchronized'),'source','supabase-verified-legacy','readOnly',false,'records',records,
 'sync',jsonb_build_object('lastAttempt',st.last_attempt,'lastSuccess',st.last_success,'error',st.last_error,'sourceRecords',st.source_records,'added',st.last_added,'stale',st.last_success is null or st.last_success<clock_timestamp()-interval '10 minutes','intervalMinutes',5));
end$$;

revoke all on function incargo_admin.board_payload(text) from public,anon,authenticated;
create or replace function public.incargo_legacy_board(p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 perform incargo_admin.require_operations();
 return incargo_admin.board_payload(p_kind);
end$$;
create function incargo_admin.check_board_size(p_kind text) returns void
language plpgsql set search_path='' as $$begin
 -- Below the API 3 MB ceiling, including identifiers, wrappers and sync metadata.
 -- Margin covers later timestamp/error/status changes without another import.
 if octet_length(incargo_admin.board_payload(p_kind)::text)>2900000 then
  raise exception 'Serialized board exceeds safe response limit' using errcode='22001';
 end if;
end$$;
revoke all on function incargo_admin.check_board_size(text) from public,anon,authenticated;
do $$declare definition text; marker text;begin
 definition:=pg_get_functiondef('incargo_admin.sync_legacy(text,uuid)'::regprocedure);
 marker:='update incargo_admin.sync_state set last_success=clock_timestamp(),last_error=null,snapshot=snapshot_hash,source_records=n,last_added=added where kind=p_kind;';
 if position(marker in definition)=0 then raise exception 'Unexpected sync definition';end if;
 definition:=replace(definition,marker,marker||' perform incargo_admin.check_board_size(p_kind);');
 execute definition;
 definition:=pg_get_functiondef('public.incargo_legacy_correct(text,text,text,text,integer,uuid,jsonb,text)'::regprocedure);
 marker:='update incargo_admin.documents set current_revision=n where kind=p_kind and hash=p_hash;';
 if position(marker in definition)=0 then raise exception 'Unexpected correction definition';end if;
 definition:=replace(definition,marker,marker||' perform incargo_admin.check_board_size(p_kind);');
 execute definition;
end$$;
notify pgrst,'reload schema';
