#!/usr/bin/env python3
"""Generate bounded, idempotent SQL from complete provider JSON files.
No network or database writes. Output contains personal data: keep outside Git.
Usage: prepare-legacy-import.py INSPECTIONS_JSON AFFILIATIONS_JSON PRIVATE_OUTPUT_DIR
Apply migrations first, then numbered files in order using an authorized admin connection.
Never run generated SQL under an end-user session.
"""
import hashlib
import json
import os
import pathlib
import sys
os.umask(0o077)
def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()
def literal(value):
    return "'" + value.replace("'", "''") + "'"
def validate(value):
    # JSON.stringify is the application identity encoding. Reject ambiguous numeric
    # representations instead of silently assigning different Python/JS identities.
    if isinstance(value,float) or (isinstance(value,int) and not isinstance(value,bool) and abs(value)>9007199254740991):
        raise ValueError('Ambiguous JSON numeric representation; reconcile before importing')
    if isinstance(value,dict):
        if any(k.isdigit() for k in value): raise ValueError('Numeric object keys need canonical reconciliation')
        for item in value.values(): validate(item)
    elif isinstance(value,list):
        for item in value: validate(item)
def prepare(paths,destination):
    out=pathlib.Path(destination);out.mkdir(mode=0o700,parents=True,exist_ok=False)
    statements=[]; audit=[]
    for kind,path in zip(('inspections','affiliations'),paths,strict=True):
        raw=pathlib.Path(path).read_bytes().decode('utf-8');rows=json.loads(raw)
        if not isinstance(rows,list) or not all(isinstance(r,dict) for r in rows):raise ValueError('Expected complete object array')
        validate(rows);snapshot=digest(raw);hashes=[]
        for part,start in enumerate(range(0,len(raw),60000)):
            chunk=raw[start:start+60000]
            statements.append('insert into incargo_admin.source_snapshot_parts(kind,snapshot,part,content) values('+','.join([literal(kind),literal(snapshot),str(part),literal(chunk)])+') on conflict do nothing;')
        statements.append('insert into incargo_admin.source_snapshots(kind,hash,raw) select kind,snapshot,string_agg(content,\'\' order by part) from incargo_admin.source_snapshot_parts where kind='+literal(kind)+' and snapshot='+literal(snapshot)+' group by kind,snapshot on conflict do nothing;')
        for row in rows:
            original=json.dumps(row,ensure_ascii=False,separators=(',',':'));h=digest(original);hashes.append(h)
            statements.append('insert into incargo_admin.documents(kind,hash,original_raw,original_payload,source_snapshot) select kind,hash,raw,raw::jsonb,snapshot from (values('+','.join(map(literal,[kind,h,original,snapshot]))+')) f(kind,hash,raw,snapshot) on conflict do nothing;')
        if len(set(hashes))!=len(hashes):raise ValueError('Identical source records require reconciliation')
        combined=digest(''.join(sorted(hashes)))
        statements.append("do $$begin if (select count(*) from incargo_admin.documents where kind="+literal(kind)+" and hash=any(array["+",".join(map(literal,hashes))+"]::text[])"+")<>"+str(len(rows))+" or (select encode(sha256(convert_to(coalesce(string_agg(hash,'' order by hash),''),'UTF8')),'hex') from incargo_admin.documents where kind="+literal(kind)+" and hash=any(array["+",".join(map(literal,hashes))+"]::text[])"+")<>"+literal(combined)+" then raise exception 'Source manifest mismatch';end if;end$$;")
        audit.append(dict(kind=kind,records=len(rows),bytes=len(raw.encode()),snapshot=snapshot,rows_sha256=combined,truncated=sum('[TRUNC]' in json.dumps(r) for r in rows)))
    batch='';number=0
    for statement in statements:
        if len(statement.encode())>280000:raise ValueError('Individual record exceeds import transport limit; reconcile without truncation')
        if len((batch+statement).encode())>280000:
            (out/f'{number:03}.sql').write_text('begin;\n'+batch+'commit;\n');number+=1;batch=''
        batch+=statement+'\n'
    if batch:(out/f'{number:03}.sql').write_text('begin;\n'+batch+'commit;\n')
    (out/'manifest.json').write_text(json.dumps(audit,indent=2)+'\n')
    return audit
if __name__=='__main__':
    if len(sys.argv)!=4:raise SystemExit(__doc__)
    print(json.dumps(prepare(sys.argv[1:3],sys.argv[3]),indent=2))
