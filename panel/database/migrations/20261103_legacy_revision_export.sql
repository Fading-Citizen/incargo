-- Export immutable versions individually to avoid cumulative payload limits.
create or replace function public.incargo_legacy_versions(p_kind text, p_hash text default null) returns jsonb
language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 perform incargo_admin.require_operations();
 if p_kind not in ('inspections','affiliations') then raise exception 'Invalid kind';end if;
 select coalesce(jsonb_agg(jsonb_build_object('hash',d.hash,'revision',d.current_revision,
 'original',case when p_hash is null then null else d.original_payload end,'data',case when p_hash is null then coalesce(r.payload,d.original_payload) else null end,'capturedAt',d.captured_at,
 'sourceSnapshot',d.source_snapshot,'history',case when p_hash is null then '[]'::jsonb else
 (select coalesce(jsonb_agg(jsonb_build_object('revision',h.revision,'reason',h.reason,'createdAt',h.created_at,'actorId',h.actor_id) order by h.revision),'[]'::jsonb) from incargo_admin.revisions h where h.kind=d.kind and h.hash=d.hash) end) order by d.captured_at),'[]'::jsonb)
 into result from incargo_admin.documents d left join incargo_admin.revisions r on r.kind=d.kind and r.hash=d.hash and r.revision=d.current_revision
 where d.kind=p_kind and (p_hash is null or d.hash=p_hash);
 return result;
end$$;
create or replace function public.incargo_legacy_correct(p_kind text,p_hash text,p_original text,p_snapshot text,p_expected integer,p_request uuid,p_patch jsonb,p_reason text) returns jsonb
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
 if octet_length((base||p_patch)::text)>2500000 or
 (select coalesce(sum(octet_length(coalesce(r.payload,x.original_payload)::text)),0) from incargo_admin.documents x left join incargo_admin.revisions r on r.kind=x.kind and r.hash=x.hash and r.revision=x.current_revision where x.kind=p_kind and x.hash<>p_hash)+octet_length((base||p_patch)::text)>2700000 then
 raise exception 'Evidence exceeds safe response limit; use smaller files' using errcode='22001';end if;
 insert into incargo_admin.revisions(kind,hash,revision,expected_revision,actor_id,request_id,reason,patch,payload) values(p_kind,p_hash,n,p_expected,actor,p_request,btrim(p_reason),p_patch,base||p_patch);
 update incargo_admin.documents set current_revision=n where kind=p_kind and hash=p_hash;
 return jsonb_build_object('hash',p_hash,'revision',n,'request',p_request,'replayed',false);
end$$;

create function public.incargo_legacy_revision(p_kind text,p_hash text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 perform incargo_admin.require_operations();
 if p_revision=0 then select original_payload into result from incargo_admin.documents where kind=p_kind and hash=p_hash;
 else select payload into result from incargo_admin.revisions where kind=p_kind and hash=p_hash and revision=p_revision;end if;
 if result is null then raise exception 'Version not found' using errcode='22023';end if;
 return jsonb_build_object('hash',p_hash,'revision',p_revision,'data',result);
end$$;
revoke all on function public.incargo_legacy_revision(text,text,integer) from public,anon;
grant execute on function public.incargo_legacy_revision(text,text,integer) to authenticated;
notify pgrst,'reload schema';
