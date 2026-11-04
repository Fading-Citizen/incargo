"""Local disposable PostgreSQL only. No network credentials or business data."""
import concurrent.futures
import subprocess
import sys
import time
container = sys.argv[1]
def query(sql):
    return subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'],input=sql,text=True,capture_output=True)
def checked(sql):
    result=query(sql)
    if result.returncode: raise AssertionError(result.stderr)
    return result.stdout.strip()
h=checked("select hash from incargo_admin.documents where kind='inspections'")
def change(request,expected,city):
    # Values below are fixed synthetic fixture identifiers, not user input.
    return query(f"begin; set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true); select public.incargo_legacy_correct('inspections','{h}',null,null,{expected},'{request}','{{\"ciudad\":\"{city}\"}}','concurrent test'); select pg_sleep(0.15); commit;")
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(lambda args:change(*args),[('30000000-0000-0000-0000-000000000001',1,'A'),('30000000-0000-0000-0000-000000000002',1,'B')]))
assert sum(result.returncode==0 for result in results)==1, results
assert any('Revision conflict' in result.stderr for result in results),results
assert checked("select count(*) from incargo_admin.revisions where kind='inspections'")=='2'
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(lambda _:change('30000000-0000-0000-0000-000000000003',2,'C'),range(2)))
assert all(result.returncode==0 for result in results),results
assert checked("select count(*) from incargo_admin.revisions where kind='inspections'")=='3'
assert checked("select original_payload->>'firma' from incargo_admin.documents where kind='inspections'")=='original-evidence'
print('PASS: competing corrections reject stale revisions; simultaneous retry creates one immutable revision')

# A correction queued behind a row lock must recheck a revocation committed while waiting.
locker=subprocess.Popen(['docker','--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
locker.stdin.write("begin; select hash from incargo_admin.documents where kind='inspections' for update;\n")
locker.stdin.flush()
assert locker.stdout.readline().strip()==h
with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
    waiting=pool.submit(change,'30000000-0000-0000-0000-000000000004',3,'revoked')
    for attempt in range(100):
        blocked=checked("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%30000000-0000-0000-0000-000000000004%'")
        if blocked!='0': break
        time.sleep(0.02)
    else: raise AssertionError('Correction did not reach the document lock')
    # Revoke only after the writer passed its first authorization check and queued.
    locker.stdin.write("delete from public.incargo_memberships where user_id='00000000-0000-0000-0000-000000000001'; commit;\n")
    locker.stdin.close()
    assert locker.wait(timeout=15)==0
    denied=waiting.result(timeout=15)
assert denied.returncode != 0 and 'Access denied' in denied.stderr
assert checked("select count(*) from incargo_admin.revisions where kind='inspections'")=='3'
print('PASS: queued writer cannot retain revoked access')
