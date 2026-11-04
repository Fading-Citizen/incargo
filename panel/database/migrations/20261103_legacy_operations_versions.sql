-- All current/future operations members may edit. No direct table privileges.
create schema if not exists incargo_admin;
revoke all on schema incargo_admin from public,anon,authenticated;
create table incargo_admin.documents (
 kind text not null check(kind in ('inspections','affiliations')),
 hash text not null check(hash ~ '^[a-f0-9]{64}$'),
 original_raw text not null,
 original_payload jsonb not null check(jsonb_typeof(original_payload)='object'),
 source_snapshot text not null check(source_snapshot ~ '^[a-f0-9]{64}$'),
 captured_at timestamptz not null default now(),
 current_revision integer not null default 0,
 primary key(kind,hash),
 check(original_raw::jsonb=original_payload),
 check(encode(sha256(convert_to(original_raw,'UTF8')),'hex')=hash)
);
create table incargo_admin.revisions (
 kind text not null, hash text not null,
 revision integer not null check(revision>0), expected_revision integer not null,
 actor_id uuid not null references auth.users(id), request_id uuid not null,
 reason text not null, patch jsonb not null, payload jsonb not null,
 created_at timestamptz not null default now(),
 primary key(kind,hash,revision), unique(actor_id,request_id),
 foreign key(kind,hash) references incargo_admin.documents(kind,hash)
);
alter table incargo_admin.documents enable row level security;
alter table incargo_admin.revisions enable row level security;
revoke all on all tables in schema incargo_admin from public,anon,authenticated;
create function incargo_admin.immutable() returns trigger language plpgsql set search_path='' as $$begin
 if TG_TABLE_NAME='documents' and TG_OP='UPDATE' and
 (to_jsonb(new)-'current_revision')=(to_jsonb(old)-'current_revision') then return new; end if;
 raise exception 'Originals and history are immutable';
end$$;
create trigger original_immutable before update or delete on incargo_admin.documents for each row execute function incargo_admin.immutable();
create trigger revision_immutable before update or delete on incargo_admin.revisions for each row execute function incargo_admin.immutable();
create table incargo_admin.source_snapshots (
 kind text not null check(kind in ('inspections','affiliations')),
 hash text not null,
 raw text not null,
 captured_at timestamptz not null default now(),
 primary key(kind,hash),
 check(jsonb_typeof(raw::jsonb)='array'),
 check(encode(sha256(convert_to(raw,'UTF8')),'hex')=hash)
);
alter table incargo_admin.source_snapshots enable row level security;
revoke all on incargo_admin.source_snapshots from public,anon,authenticated;
create trigger snapshot_immutable before update or delete on incargo_admin.source_snapshots for each row execute function incargo_admin.immutable();
create function incargo_admin.require_operations() returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not exists(select 1 from public.incargo_memberships where user_id=auth.uid() and role='operations') then
 raise exception 'Access denied' using errcode='42501'; end if;
end$$;
create function public.incargo_legacy_versions(p_kind text, p_hash text default null) returns jsonb
language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 perform incargo_admin.require_operations();
 if p_kind not in ('inspections','affiliations') then raise exception 'Invalid kind';end if;
 select coalesce(jsonb_agg(jsonb_build_object('hash',d.hash,'revision',d.current_revision,
 'original',case when p_hash is null then null else d.original_payload end,'data',coalesce(r.payload,d.original_payload),'capturedAt',d.captured_at,
 'sourceSnapshot',d.source_snapshot,'history',case when p_hash is null then '[]'::jsonb else
 (select coalesce(jsonb_agg(jsonb_build_object('revision',h.revision,'reason',h.reason,'createdAt',h.created_at,'actorId',h.actor_id,'data',h.payload) order by h.revision),'[]'::jsonb) from incargo_admin.revisions h where h.kind=d.kind and h.hash=d.hash) end) order by d.captured_at),'[]'::jsonb)
 into result from incargo_admin.documents d left join incargo_admin.revisions r on r.kind=d.kind and r.hash=d.hash and r.revision=d.current_revision
 where d.kind=p_kind and (p_hash is null or d.hash=p_hash);
 return result;
end$$;
create function public.incargo_legacy_correct(p_kind text,p_hash text,p_original text,p_snapshot text,p_expected integer,p_request uuid,p_patch jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d incargo_admin.documents; prev incargo_admin.revisions; actor uuid:=auth.uid(); base jsonb; n integer; keys text[]; val text; img text; images text[]; bytes bytea;
begin
 perform incargo_admin.require_operations();
 if p_kind not in ('inspections','affiliations') or p_hash is null or p_request is null or p_expected is null or p_expected<0 or p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb or coalesce(length(btrim(p_reason)),0) not between 1 and 2000 or octet_length(p_patch::text)>3000000 then raise exception 'Invalid correction';end if;
 keys:=case when p_kind='inspections' then array['fecha','ciudad','empresa','conductor','licencia','placa','claseVehiculo','tipoCarroceria','placasemirremolque','modelo','gps','tarjetaProp','fechaSoat','fechaTecno','tipoTransporte','fotos','firma'] else array['correoRegistro','tipoVinculacion','tipoVinculacionOtro','nombreCompleto','tipoIdentificacion','numeroIdentificacion','correoElectronico'] end;
 if exists(select 1 from jsonb_each(p_patch) f where f.key<>all(keys) or jsonb_typeof(f.value)<>'string' or (f.key not in ('fotos','firma') and length(f.value#>>'{}')>2000)) then raise exception 'Field not editable';end if;
 -- Evidence is preserved exactly. New evidence must be bounded raster data, never URLs/SVG.
 foreach val in array array[p_patch->>'fotos',p_patch->>'firma'] loop
 if val is not null then
 images:=string_to_array(val,'|');
 if cardinality(images) not between 1 and 8 then raise exception 'Invalid evidence';end if;
 foreach img in array images loop
 if length(img)>2000050 or img !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Invalid evidence';end if;
 bytes:=decode(split_part(img,',',2),'base64');
 if not ((img like 'data:image/png;%' and substring(bytes from 1 for 8)=decode('89504e470d0a1a0a','hex')) or (img like 'data:image/jpeg;%' and substring(bytes from 1 for 3)=decode('ffd8ff','hex')) or (img like 'data:image/webp;%' and substring(bytes from 1 for 4)=convert_to('RIFF','UTF8') and substring(bytes from 9 for 4)=convert_to('WEBP','UTF8'))) then raise exception 'Invalid evidence';end if;
 end loop;end if;end loop;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_kind||':'||p_hash,0));
 perform incargo_admin.require_operations();
 select * into prev from incargo_admin.revisions where actor_id=actor and request_id=p_request;
 if found then
 if prev.kind<>p_kind or prev.hash<>p_hash or prev.expected_revision<>p_expected or prev.patch<>p_patch or prev.reason<>btrim(p_reason) then raise exception 'Request conflict' using errcode='23505';end if;
 return jsonb_build_object('hash',p_hash,'revision',prev.revision,'request',p_request,'replayed',true);end if;
 select * into d from incargo_admin.documents where kind=p_kind and hash=p_hash for update;
 -- Only a trusted administrative import may establish an original. Authenticated
 -- users cannot fabricate provenance by supplying arbitrary JSON to the RPC.
 if not found then raise exception 'Original not archived; synchronization required' using errcode='22023';end if;
 perform incargo_admin.require_operations();
 if d.current_revision<>p_expected then raise exception 'Revision conflict' using errcode='40001';end if;
 select payload into base from incargo_admin.revisions where kind=p_kind and hash=p_hash and revision=d.current_revision;
 base:=coalesce(base,d.original_payload);n:=d.current_revision+1;
 insert into incargo_admin.revisions(kind,hash,revision,expected_revision,actor_id,request_id,reason,patch,payload) values(p_kind,p_hash,n,p_expected,actor,p_request,btrim(p_reason),p_patch,base||p_patch);
 update incargo_admin.documents set current_revision=n where kind=p_kind and hash=p_hash;
 return jsonb_build_object('hash',p_hash,'revision',n,'request',p_request,'replayed',false);
end$$;
revoke all on all functions in schema incargo_admin from public,anon,authenticated;
revoke all on function public.incargo_legacy_versions(text,text),public.incargo_legacy_correct(text,text,text,text,integer,uuid,jsonb,text) from public,anon;
grant execute on function public.incargo_legacy_versions(text,text),public.incargo_legacy_correct(text,text,text,text,integer,uuid,jsonb,text) to authenticated;
notify pgrst,'reload schema';
