-- PROPOSAL ONLY. Local validation only; no production grants, import or activation.
-- Requires approved source manifests, retention and per-document access before use.
create schema incargo_admin;
revoke all on schema incargo_admin from public, anon, authenticated;
create table incargo_admin.documents (
 id uuid primary key,
 kind text not null check(kind in ('inspection','affiliation')),
 source_snapshot_sha256 text not null check(source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
 source_key text not null,
 original_payload jsonb not null check(jsonb_typeof(original_payload)='object'),
 source_verified boolean not null default false,
 current_revision integer not null default 0 check(current_revision>=0),
 unique(source_snapshot_sha256,source_key)
);
create table incargo_admin.document_access (
 document_id uuid not null references incargo_admin.documents(id),
 user_id uuid not null references auth.users(id),
 can_edit boolean not null default false,
 primary key(document_id,user_id)
);
create index document_access_user on incargo_admin.document_access(user_id,document_id);
create table incargo_admin.revisions (
 document_id uuid not null references incargo_admin.documents(id),
 revision integer not null check(revision>0),
 expected_revision integer not null check(expected_revision>=0),
 actor_id uuid not null references auth.users(id),
 request_id uuid not null,
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 patch jsonb not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 primary key(document_id,revision),
 unique(actor_id,request_id)
);
alter table incargo_admin.documents enable row level security;
alter table incargo_admin.document_access enable row level security;
alter table incargo_admin.revisions enable row level security;
revoke all on all tables in schema incargo_admin from public,anon,authenticated;

create function incargo_admin.prevent_revision_change() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'Revision history is immutable'; end$$;
create trigger revision_immutable before update or delete on incargo_admin.revisions
for each row execute function incargo_admin.prevent_revision_change();
create function incargo_admin.protect_original() returns trigger
language plpgsql set search_path='' as $$begin
 if (new.id,new.kind,new.source_snapshot_sha256,new.source_key,new.original_payload) is distinct from
    (old.id,old.kind,old.source_snapshot_sha256,old.source_key,old.original_payload) then
  raise exception 'Source document is immutable';
 end if;
 return new;
end$$;
create trigger original_immutable before update on incargo_admin.documents
for each row execute function incargo_admin.protect_original();

-- Definer is necessary only for access to private ACL/history. Explicit checks are
-- performed in each entrypoint. No function is exposed/granted by this proposal.
create function incargo_admin.read_document(p_document uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d incargo_admin.documents; result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.incargo_memberships where user_id=auth.uid() and role='operations')
 or not exists(select 1 from incargo_admin.document_access where document_id=p_document and user_id=auth.uid()) then
  raise exception 'Access denied' using errcode='42501';
 end if;
 select * into d from incargo_admin.documents where id=p_document;
 if not found or not d.source_verified then raise exception 'Source reconciliation required'; end if;
 select payload into result from incargo_admin.revisions where document_id=p_document and revision=d.current_revision;
 return jsonb_build_object('id',d.id,'revision',d.current_revision,'data',coalesce(result,d.original_payload),'sourceSnapshot',d.source_snapshot_sha256);
end$$;

create function incargo_admin.correct_inspection(p_document uuid,p_expected integer,p_request uuid,p_patch jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d incargo_admin.documents; previous incargo_admin.revisions; actor uuid:=auth.uid(); base jsonb; revision_no integer;
begin
 if actor is null or not exists(select 1 from public.incargo_memberships where user_id=actor and role='operations')
 or not exists(select 1 from incargo_admin.document_access where document_id=p_document and user_id=actor and can_edit) then
  raise exception 'Access denied' using errcode='42501';
 end if;
 if p_request is null or p_expected is null or p_expected<0 or p_patch is null or jsonb_typeof(p_patch)<>'object'
 or coalesce(length(btrim(p_reason)),0) not between 1 and 2000 or octet_length(p_patch::text)>3000000 then
  raise exception 'Invalid correction';
 end if;
 if exists(select 1 from jsonb_each(p_patch) field where field.key <> all(array['fecha','ciudad','empresa','conductor','licencia','placa','claseVehiculo','tipoCarroceria','placasemirremolque','modelo','gps','tarjetaProp','fechaSoat','fechaTecno','tipoTransporte','fotos','firma']) or jsonb_typeof(field.value)<>'string') then
  raise exception 'Field not editable';
 end if;
 -- Serialize same-actor request IDs even when callers target different documents.
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,0));
 select * into d from incargo_admin.documents where id=p_document for update;
 if not found or not d.source_verified or d.kind<>'inspection' then raise exception 'Verified inspection required'; end if;
 select * into previous from incargo_admin.revisions where actor_id=actor and request_id=p_request;
 if found then
  if previous.document_id<>p_document or previous.expected_revision<>p_expected or previous.patch<>p_patch or previous.reason<>btrim(p_reason) then
   raise exception 'Request already used with different data' using errcode='23505';
  end if;
  return jsonb_build_object('id',p_document,'revision',previous.revision,'request',p_request,'replayed',true);
 end if;
 if d.current_revision<>p_expected then raise exception 'Revision conflict; reload before retry' using errcode='40001'; end if;
 select payload into base from incargo_admin.revisions where document_id=p_document and revision=d.current_revision;
 base:=coalesce(base,d.original_payload);revision_no:=d.current_revision+1;
 insert into incargo_admin.revisions(document_id,revision,expected_revision,actor_id,request_id,reason,patch,payload)
 values(p_document,revision_no,p_expected,actor,p_request,btrim(p_reason),p_patch,base||p_patch);
 update incargo_admin.documents set current_revision=revision_no where id=p_document;
 return jsonb_build_object('id',p_document,'revision',revision_no,'request',p_request,'replayed',false);
end$$;
revoke all on all functions in schema incargo_admin from public,anon,authenticated;
