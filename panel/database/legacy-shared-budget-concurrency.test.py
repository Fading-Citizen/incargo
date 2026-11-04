"""Different documents must serialize their shared budget. Disposable DB only."""
import concurrent.futures, subprocess, sys, time
container = sys.argv[1]
cmd = ['docker', '--host=unix:///var/run/docker.sock', 'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt']
def query(sql):
    return subprocess.run(cmd, input=sql, text=True, capture_output=True)
def checked(sql):
    r = query(sql)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()
checked("update incargo_admin.sync_state set last_attempt=null where kind='inspections';update incargo_http.fixture set raw='[{\"ciudad\":\"budget A\"},{\"ciudad\":\"budget B\"}]' where kind='inspections';select incargo_admin.sync_legacy('inspections');")
hashes = checked("select hash from incargo_admin.documents where original_payload->>'ciudad' in ('budget A','budget B') order by hash").splitlines()
assert len(hashes) == 2
before = int(checked('select count(*) from incargo_admin.revisions'))
locker = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
locker.stdin.write("begin;select pg_advisory_xact_lock(hashtextextended('legacy-size:inspections',0));select 'locked';\n"); locker.stdin.flush()
for line in locker.stdout:
    if line.strip() == 'locked': break
else:
    raise AssertionError('Lock setup exited before readiness: ' + locker.stderr.read())
def change(i):
    return query(f"begin;set local application_name='shared-budget-{i}';set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);select public.incargo_legacy_correct('inspections','{hashes[i]}',null,null,0,'60000000-0000-0000-0000-00000000000{i}',jsonb_build_object('firma','data:image/png;base64,'||replace(encode(decode('89504e470d0a1a0a','hex')||convert_to(repeat('x',1100000),'UTF8'),'base64'),E'\\n','')),'shared budget regression');commit;")
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    pending = [pool.submit(change, i) for i in range(2)]
    try:
        for _ in range(100):
            if checked("select count(*) from pg_stat_activity where application_name like 'shared-budget-%' and wait_event_type='Lock'") == '2': break
            time.sleep(.03)
        else: raise AssertionError('Both different-document writers must wait for the shared kind lock')
    finally:
        locker.stdin.write('commit;\n'); locker.stdin.close(); assert locker.wait(timeout=15) == 0
    results = [p.result(timeout=30) for p in pending]
assert sum(r.returncode == 0 for r in results) == 1, [(r.returncode, r.stderr) for r in results]
assert any('Evidence exceeds safe response limit' in r.stderr for r in results)
assert int(checked('select count(*) from incargo_admin.revisions')) == before + 1
assert checked("select count(*) from incargo_admin.documents where original_payload->>'ciudad' in ('budget A','budget B') and original_payload ? 'firma'") == '0'
assert int(checked("select octet_length(incargo_admin.board_payload('inspections')::text)")) < 2900000
print('PASS: different-document corrections share the budget lock; only one commits and the board remains readable')
