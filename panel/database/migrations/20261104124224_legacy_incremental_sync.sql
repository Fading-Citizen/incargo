create table incargo_admin.sync_state (
 kind text primary key check(kind in ('inspections','affiliations')),
 last_attempt timestamptz,last_success timestamptz,last_error text,
 snapshot text,source_records integer not null default 0,last_added integer not null default 0
);
create table incargo_admin.snapshot_members (
 kind text not null,snapshot text not null,hash text not null,
 primary key(kind,snapshot,hash),
 foreign key(kind,snapshot) references incargo_admin.source_snapshots(kind,hash),
 foreign key(kind,hash) references incargo_admin.documents(kind,hash)
);
alter table incargo_admin.sync_state enable row level security;
alter table incargo_admin.snapshot_members enable row level security;
revoke all on incargo_admin.sync_state,incargo_admin.snapshot_members from public,anon,authenticated;
create trigger membership_immutable before update or delete on incargo_admin.snapshot_members for each row execute function incargo_admin.immutable();
insert into incargo_admin.sync_state(kind,last_success,snapshot,source_records)
select k.kind,s.captured_at,s.hash,coalesce(jsonb_array_length(s.raw::jsonb),0)
from (values('inspections'),('affiliations')) k(kind)
left join lateral(select * from incargo_admin.source_snapshots where kind=k.kind order by captured_at desc limit 1) s on true;
insert into incargo_admin.snapshot_members(kind,snapshot,hash)
select s.kind,s.hash,d.hash from incargo_admin.source_snapshots s
join incargo_admin.documents d on d.kind=s.kind
where exists(select 1 from jsonb_array_elements(s.raw::jsonb) r where r.value=d.original_payload)
on conflict do nothing;

-- Stable JSON.stringify-compatible identities; reject ambiguous numbers instead
-- of quietly assigning new identities to existing source objects.
create function incargo_admin.compact_json(j json) returns text language plpgsql immutable set search_path='' as $$
declare result text;begin
 case json_typeof(j)
 when 'object' then
  if exists(select 1 from json_each(j) where key ~ '^[0-9]+$') then raise exception 'Ambiguous numeric key';end if;
  select '{'||coalesce(string_agg(to_json(key)::text||':'||incargo_admin.compact_json(value),',' order by ord),'')||'}' into result from json_each(j) with ordinality x(key,value,ord);
 when 'array' then select '['||coalesce(string_agg(incargo_admin.compact_json(value),',' order by ord),'')||']' into result from json_array_elements(j) with ordinality x(value,ord);
 when 'string' then result:=to_json(j#>>'{}')::text;
 when 'number' then
  if j::text !~ '^-?(0|[1-9][0-9]*)$' or abs((j::text)::numeric)>9007199254740991 then raise exception 'Ambiguous numeric value';end if;
  result:=j::text;
 else result:=j::text;
 end case;return result;
end$$;

-- Fixed URL, GET only. No user-controlled destinations or credentials.
create function incargo_admin.fetch_legacy(p_kind text) returns text
language plpgsql set search_path='' as $$
declare response incargo_http.http_response; target text;
begin
 if p_kind is null or p_kind not in ('inspections','affiliations') then raise exception 'Invalid kind';end if;
 target:='https://script.google.com/macros/s/AKfycbwTBTO-wMKFs9ogYH3qELSk8rx14WnWWy6mM6qIKu_dr0wsgWq-heR_Q1V9LvCKKoNp/exec?action='||case when p_kind='inspections' then 'list' else 'vinculaciones' end;
 perform incargo_http.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','3000');
 perform incargo_http.http_set_curlopt('CURLOPT_TIMEOUT_MS','10000');
 select * into response from incargo_http.http_get(target);
 perform incargo_http.http_reset_curlopt();
 if response.status<>200 or response.content is null then raise exception 'Source response failed';end if;
 if octet_length(response.content)>2500000 then raise exception 'Source too large' using errcode='22001';end if;
 return response.content;
exception when others or query_canceled then
 perform incargo_http.http_reset_curlopt();raise;
end$$;

-- Owner/cron entrypoint, never granted to app roles. actor is supplied only by
-- the authenticated wrapper; its role is rechecked after network and lock waits.
create function incargo_admin.sync_legacy(p_kind text,p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare st incargo_admin.sync_state; raw text; rows json; row_value json; original text; h text; snapshot_hash text; hashes text[]:=array[]::text[]; n integer:=0; added integer:=0; changed integer; outcome text;
begin
 if p_kind is null or p_kind not in ('inspections','affiliations') then raise exception 'Invalid kind';end if;
 if p_actor is not null and not exists(select 1 from public.incargo_memberships where user_id=p_actor and role='operations') then raise exception 'Access denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('legacy-sync:'||p_kind,0)) then return jsonb_build_object('busy',true);end if;
 select * into st from incargo_admin.sync_state where kind=p_kind;
 if st.last_attempt>clock_timestamp()-interval '60 seconds' then return jsonb_build_object('throttled',true);end if;
 update incargo_admin.sync_state set last_attempt=clock_timestamp() where kind=p_kind;
 begin
  raw:=incargo_admin.fetch_legacy(p_kind);
  if octet_length(raw)>2500000 then raise exception 'Source too large' using errcode='22001';end if;
  rows:=raw::json;
  if json_typeof(rows)<>'array' then raise exception 'Invalid source';end if;
  snapshot_hash:=encode(sha256(convert_to(raw,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('legacy-size:'||p_kind,0));
  if p_actor is not null and not exists(select 1 from public.incargo_memberships where user_id=p_actor and role='operations') then raise exception 'Access denied' using errcode='42501';end if;
  insert into incargo_admin.source_snapshots(kind,hash,raw) values(p_kind,snapshot_hash,raw) on conflict do nothing;
  for row_value in select value from json_array_elements(rows) loop
   if json_typeof(row_value)<>'object' then raise exception 'Invalid source row';end if;
   original:=incargo_admin.compact_json(row_value);h:=encode(sha256(convert_to(original,'UTF8')),'hex');
   if h=any(hashes) then raise exception 'Duplicate source row';end if;
   hashes:=array_append(hashes,h);n:=n+1;
   insert into incargo_admin.documents(kind,hash,original_raw,original_payload,source_snapshot)
   values(p_kind,h,original,row_value::jsonb,snapshot_hash) on conflict do nothing;
   get diagnostics changed=row_count;added:=added+changed;
   insert into incargo_admin.snapshot_members(kind,snapshot,hash) values(p_kind,snapshot_hash,h) on conflict do nothing;
  end loop;
  if (select coalesce(sum(octet_length(coalesce(r.payload,d.original_payload)::text)),0) from incargo_admin.documents d left join incargo_admin.revisions r on r.kind=d.kind and r.hash=d.hash and r.revision=d.current_revision where d.kind=p_kind)>2700000 then raise exception 'Collection limit' using errcode='22001';end if;
  update incargo_admin.sync_state set last_success=clock_timestamp(),last_error=null,snapshot=snapshot_hash,source_records=n,last_added=added where kind=p_kind;
 exception
  when insufficient_privilege then raise;
  when query_canceled then outcome:='SOURCE_TIMEOUT';
  when string_data_right_truncation then outcome:='SOURCE_LIMIT';
  when others then outcome:='SOURCE_UNAVAILABLE_OR_INVALID';
 end;
 -- The exception subtransaction rolled back ALL snapshot/doc writes; only the
 -- safe error code and attempt time survive. Never log source content/errors.
 if outcome is not null then update incargo_admin.sync_state set last_error=outcome,last_added=0 where kind=p_kind;end if;
 return jsonb_build_object('ok',outcome is null,'error',outcome,'added',case when outcome is null then added else 0 end);
end$$;

create function public.incargo_legacy_sync(p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 perform incargo_admin.require_operations();
 result:=incargo_admin.sync_legacy(p_kind,auth.uid());
 perform incargo_admin.require_operations();return result;
end$$;
create function public.incargo_legacy_board(p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$declare st incargo_admin.sync_state; records jsonb;begin
 perform incargo_admin.require_operations();
 if p_kind is null or p_kind not in ('inspections','affiliations') then raise exception 'Invalid kind';end if;
 select * into st from incargo_admin.sync_state where kind=p_kind;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.hash,'hash',d.hash,'data',coalesce(r.payload,d.original_payload),'revision',d.current_revision,
 'archived',not exists(select 1 from incargo_admin.snapshot_members m where m.kind=d.kind and m.snapshot=st.snapshot and m.hash=d.hash)) order by d.captured_at,d.hash),'[]'::jsonb)
 into records from incargo_admin.documents d left join incargo_admin.revisions r on r.kind=d.kind and r.hash=d.hash and r.revision=d.current_revision where d.kind=p_kind;
 return jsonb_build_object('kind',p_kind,'capturedAt',clock_timestamp(),'snapshot',coalesce(st.snapshot,'not-yet-synchronized'),'source','supabase-verified-legacy','readOnly',false,'records',records,
 'sync',jsonb_build_object('lastAttempt',st.last_attempt,'lastSuccess',st.last_success,'error',st.last_error,'sourceRecords',st.source_records,'added',st.last_added,'stale',st.last_success is null or st.last_success<clock_timestamp()-interval '10 minutes','intervalMinutes',5));
end$$;
revoke all on function incargo_admin.compact_json(json),incargo_admin.fetch_legacy(text),incargo_admin.sync_legacy(text,uuid) from public,anon,authenticated;
revoke all on function public.incargo_legacy_sync(text),public.incargo_legacy_board(text) from public,anon;
grant execute on function public.incargo_legacy_sync(text),public.incargo_legacy_board(text) to authenticated;
-- Serialize collection-size checks with imports and with other-document editors.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.incargo_legacy_correct(text,text,text,text,integer,uuid,jsonb,text)'::regprocedure);
 definition:=replace(definition,'perform pg_advisory_xact_lock(hashtextextended(p_kind||'':''||p_hash,0));','perform pg_advisory_xact_lock(hashtextextended(''legacy-size:''||p_kind,0)); perform pg_advisory_xact_lock(hashtextextended(p_kind||'':''||p_hash,0));');
 execute definition;
end$$;
notify pgrst,'reload schema';
