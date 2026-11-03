"""Local disposable PostgreSQL only. No network credentials or business data."""
import concurrent.futures
import subprocess
import sys
container = sys.argv[1]
def query(sql):
    return subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'],input=sql,text=True,capture_output=True)
def checked(sql):
    result=query(sql)
    if result.returncode: raise AssertionError(result.stderr)
    return result.stdout.strip()
checked("insert into incargo_admin.document_access values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',true)")
def change(request,expected,city):
    # Values below are fixed synthetic fixture identifiers, not user input.
    return query(f"begin; set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true); select incargo_admin.correct_inspection('10000000-0000-0000-0000-000000000001',{expected},'{request}','{{\"ciudad\":\"{city}\"}}','concurrent test'); select pg_sleep(0.15); commit;")
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(lambda args:change(*args),[('30000000-0000-0000-0000-000000000001',1,'A'),('30000000-0000-0000-0000-000000000002',1,'B')]))
assert sum(result.returncode==0 for result in results)==1, results
assert any('Revision conflict' in result.stderr for result in results),results
assert checked('select count(*) from incargo_admin.revisions')=='2'
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(lambda _:change('30000000-0000-0000-0000-000000000003',2,'C'),range(2)))
assert all(result.returncode==0 for result in results),results
assert checked('select count(*) from incargo_admin.revisions')=='3'
assert checked("select original_payload->>'firma' from incargo_admin.documents where source_key='row1'")=='original-evidence'
print('PASS: competing corrections reject stale revisions; simultaneous retry creates one immutable revision')
