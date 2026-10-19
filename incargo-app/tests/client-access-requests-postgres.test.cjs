// Disposable local PostgreSQL only. Requires a pinned local pg + embedded binary runtime.
// Usage: INCARGO_PG_RUNTIME=<directory> node --test incargo-app/tests/client-access-requests-postgres.test.cjs
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
const repo=process.env.INCARGO_TEST_REPO||path.resolve(__dirname,'../..');
const runtime=process.env.INCARGO_PG_RUNTIME;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('Explicit requests: authorization, privacy and atomic approval',{skip:!runtime},async t=>{
 const {Client}=require(path.join(runtime,'node_modules/pg'));
 const binaries=await import(require('node:url').pathToFileURL(path.join(runtime,'node_modules/@embedded-postgres/windows-x64/dist/index.js')));
 const directory=fs.mkdtempSync(path.join(runtime,'incargo-fixture-'));
 const init=spawnSync(binaries.initdb,['-D',directory,'-U','postgres','-A','trust','--encoding=UTF8','--locale=C'],{encoding:'utf8',windowsHide:true});
 assert.equal(init.status,0,init.stderr||init.stdout||String(init.error));
 const port=await new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const p=socket.address().port;socket.close(()=>resolve(p));});});
 const server=spawn(binaries.postgres,['-D',directory,'-h','127.0.0.1','-p',String(port)],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let logs='';server.stderr.on('data',chunk=>logs+=chunk);
 const config={host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:500};
 const connect=async()=>{const client=new Client(config);await client.connect();return client;};
 let admin;
 try{
  for(let i=0;i<100;i++){try{admin=await connect();break;}catch{await new Promise(r=>setTimeout(r,50));}}
  assert(admin,'Postgres unavailable: '+logs);
  for(const file of ['tests/policy-bootstrap.sql','migration.sql','migration_permissions_fix.sql','migration_hardening.sql','migration_anon_revoke.sql','client-portal.proposal.sql'])await admin.query(fs.readFileSync(path.join(repo,'incargo-app',file),'utf8'));

  await admin.query('alter table auth.users add email text, add email_confirmed_at timestamptz, add deleted_at timestamptz');
  await admin.query('alter default privileges in schema public grant execute on functions to service_role');
  await admin.query(fs.readFileSync(path.join(repo,'incargo-app/client-access-requests.proposal.sql'),'utf8'));
  for(let n=1;n<=10;n++)await admin.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)",[id(n),'fixture'+n+'@example.invalid',n===5?null:new Date()]);
  await admin.query("insert into incargo_memberships(user_id,role) values($1,'operations'),($2,'driver'),($3,'operations')",[id(1),id(2),id(10)]);
  await admin.query("insert into incargo_client_accounts(id,display_name,created_by) values($1,'PRUEBA A',$3),($2,'PRUEBA B',$3)",[id(20),id(21),id(1)]);
  const as=async(user,name,args=[],role='authenticated')=>{const c=await connect();try{await c.query('begin');await c.query('set local role '+role);await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user?id(user):'']);const result=await c.query('select * from '+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args);await c.query('commit');return result.rows;}catch(e){await c.query('rollback');throw e;}finally{await c.end();}};
  const submit=(user,company='PRUEBA empresa')=>as(user,'public.incargo_request_client_access',[company]);
  const approve=async(actor,user,account,revision)=>as(actor,'public.incargo_approve_client_access_request',[id(user),id(account),revision??(await admin.query('select updated_at::text from incargo_private.client_access_requests where user_id=$1',[id(user)])).rows[0]?.updated_at]);
  await t.test('only verified caller can request, with bounded company and no enumeration',async()=>{
   for(const user of [null,5])await assert.rejects(submit(user),/verified/);for(const company of ['',' ','x'.repeat(121)])await assert.rejects(submit(3,company),/invalid company/);
   await submit(3);await submit(3);await submit(4,'PRUEBA B');assert.equal((await admin.query('select count(*)::int n from incargo_private.client_access_requests')).rows[0].n,2);
   const own=await as(3,'public.incargo_my_client_access_request');assert.equal(own.length,1);assert.deepEqual(Object.keys(own[0]).sort(),['company_claim','requested_at','status']);assert.equal((await as(6,'public.incargo_my_client_access_request')).length,0);
   const pending=await as(1,'public.incargo_pending_client_access_requests');assert.equal(pending.length,2);assert(pending.every(r=>[id(3),id(4)].includes(r.user_id)));assert.equal(pending[0].email,'fixture3@example.invalid');
  });
  await t.test('client/driver cannot list, approve, or bypass through private helper',async()=>{
   for(const user of [null,2,3]){await assert.rejects(as(user,'public.incargo_pending_client_access_requests'),/not authorized/);await assert.rejects(approve(user,3,20),/not authorized/);await assert.rejects(as(user,'incargo_private.pending_client_access_requests'),/not authorized/);}
  });
  await t.test('atomic approval creates exactly one membership and audit, retry cannot reassign',async()=>{
   await assert.rejects(approve(1,3,999),/account not found/);assert.equal((await as(3,'public.incargo_my_client_access_request'))[0].status,'pending');
   await approve(1,3,20);await approve(1,3,20);await assert.rejects(approve(1,3,21),/conflict/);
   const rows=(await admin.query('select account_id from incargo_client_memberships where user_id=$1',[id(3)])).rows;assert.equal(rows[0].account_id,id(20));assert.equal((await admin.query('select count(*)::int n from incargo_private.client_link_audit where user_id=$1',[id(3)])).rows[0].n,1);
   await assert.rejects(submit(3),/already linked/);await admin.query('delete from incargo_client_memberships where user_id=$1',[id(3)]);await assert.rejects(approve(1,3,20),/conflict/);assert.equal((await as(3,'public.incargo_my_client_access_request'))[0].status,'review_required');
  });
  await t.test('changed verification, changed email and existing membership block approval',async()=>{
   await admin.query('update auth.users set email_confirmed_at=null where id=$1',[id(4)]);await assert.rejects(approve(1,4,20),/verified/);
   await admin.query("update auth.users set email_confirmed_at=now(),email='changed@example.invalid' where id=$1",[id(4)]);await assert.rejects(approve(1,4,20),/verified/);await submit(4);
   await admin.query('insert into incargo_client_memberships(user_id,account_id,created_by) values($1,$2,$3)',[id(4),id(21),id(1)]);await assert.rejects(approve(1,4,20),/conflict/);assert.equal((await admin.query('select account_id from incargo_client_memberships where user_id=$1',[id(4)])).rows[0].account_id,id(21));
  });
  await t.test('concurrent approvals for different companies have one winner',async()=>{
   await submit(6);const results=await Promise.allSettled([approve(1,6,20),approve(10,6,21)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await admin.query('select count(*)::int n from incargo_private.client_link_audit where user_id=$1',[id(6)])).rows[0].n,1);
  });
  await t.test('changed request cannot be approved from an outdated screen',async()=>{await submit(7);const revision=(await admin.query('select updated_at::text from incargo_private.client_access_requests where user_id=$1',[id(7)])).rows[0].updated_at;await submit(7,'CHANGED');await assert.rejects(approve(1,7,20,revision),/request changed/);assert.equal((await as(7,'public.incargo_my_client_access_request'))[0].status,'pending');});
  await t.test('no direct request/Auth read or anonymous/service execution',async()=>{
   for(const role of ['anon','service_role'])await assert.rejects(as(null,'public.incargo_pending_client_access_requests',[],role),/permission denied/);
   const c=await connect();try{await c.query('set role authenticated');await assert.rejects(c.query('select * from incargo_private.client_access_requests'),/permission denied/);await assert.rejects(c.query('select * from auth.users'),/permission denied/);}finally{await c.end();}
  });
 }finally{
  await admin?.end();const stop=spawnSync(binaries.pg_ctl,['-D',directory,'-m','fast','-w','stop'],{encoding:'utf8',windowsHide:true});if(stop.status!==0)server.kill();
 }
});
