"""Disposable database only: simultaneous import and revocation during lock wait."""
import concurrent.futures,subprocess,sys,time
container=sys.argv[1]
def query(sql):
 return subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'],input=sql,text=True,capture_output=True)
def checked(sql):
 r=query(sql)
 if r.returncode:raise AssertionError(r.stderr)
 return r.stdout.strip()
def sync():
 return query("begin;set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);select public.incargo_legacy_sync('inspections');commit;")
checked("update incargo_admin.sync_state set last_attempt=null where kind='inspections';update incargo_http.fixture set raw='[{\"ciudad\":\"Concurrent new\"}]' where kind='inspections';")
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 results=list(pool.map(lambda _:sync(),range(2)))
assert all(r.returncode==0 for r in results),results
assert checked("select count(*) from incargo_admin.documents where original_payload->>'ciudad'='Concurrent new'")=='1'
assert any('"ok": true' in r.stdout for r in results)
print('PASS: concurrent sync inserts one immutable original')
checked("update incargo_admin.sync_state set last_attempt=null where kind='inspections';update incargo_http.fixture set raw='[{\"ciudad\":\"Denied queued\"}]' where kind='inspections';")
locker=subprocess.Popen(['docker','--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
locker.stdin.write("begin;select pg_advisory_xact_lock(hashtextextended('legacy-size:inspections',0));select 'locked';\n");locker.stdin.flush()
while locker.stdout.readline().strip()!='locked':pass
with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
 pending=pool.submit(sync)
 for _ in range(100):
  if checked("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%public.incargo_legacy_sync%'")!='0':break
  time.sleep(.02)
 else:raise AssertionError('Sync did not wait for size lock')
 locker.stdin.write("delete from public.incargo_memberships where user_id='00000000-0000-0000-0000-000000000002';commit;\n");locker.stdin.close();assert locker.wait(timeout=15)==0
 denied=pending.result(timeout=15)
assert denied.returncode!=0 and 'Access denied' in denied.stderr
assert checked("select count(*) from incargo_admin.documents where original_payload->>'ciudad'='Denied queued'")=='0'
print('PASS: revoked queued sync cannot persist source data')
