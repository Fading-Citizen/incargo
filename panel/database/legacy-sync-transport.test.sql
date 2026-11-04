-- Local fixture transport only. Production installs the real HTTP extension.
create schema incargo_http;
create type incargo_http.http_response as(status integer,content_type text,headers jsonb,content text);
create table incargo_http.fixture(kind text primary key,raw text,status integer default 200,error text);
insert into incargo_http.fixture values('inspections','[]',200,null),('affiliations','[]',200,null);
create function incargo_http.http_set_curlopt(text,text) returns boolean language sql as $$select true$$;
create function incargo_http.http_reset_curlopt() returns boolean language sql as $$select true$$;
create function incargo_http.http_get(url text) returns incargo_http.http_response language plpgsql as $$declare f incargo_http.fixture;begin
 if url not like 'https://script.google.com/macros/s/%/exec?action=%' then raise exception 'Unexpected destination';end if;
 select * into f from incargo_http.fixture where kind=case when url like '%action=list' then 'inspections' else 'affiliations' end;
 if f.error='timeout' then raise exception 'Synthetic timeout' using errcode='57014';end if;
 return (f.status,'application/json','{}'::jsonb,f.raw)::incargo_http.http_response;
end$$;
revoke all on schema incargo_http from public,anon,authenticated;
revoke all on all functions in schema incargo_http from public,anon,authenticated;
