// Disposable local PostgreSQL only. Requires a pinned local pg + embedded binary runtime.
// Usage: INCARGO_PG_RUNTIME=<directory> node --test incargo-app/tests/in-transit-postgres.test.cjs
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
const repo=process.env.INCARGO_TEST_REPO||path.resolve(__dirname,'../..');
const runtime=process.env.INCARGO_PG_RUNTIME;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('Client logistics proposal: PostgreSQL ownership and field allowlist',{skip:!runtime},async t=>{
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
  await admin.query('alter default privileges in schema public grant execute on functions to service_role');
  await admin.query(fs.readFileSync(path.join(repo,'incargo-app/client-logistics.proposal.sql'),'utf8'));
  for(let n=1;n<=6;n++)await admin.query('insert into auth.users(id) values($1)',[id(n)]);
  await admin.query("insert into incargo_memberships(user_id,role) values($1,'operations'),($2,'driver')",[id(1),id(2)]);
  await admin.query("insert into incargo_trips(id,route_label,scheduled_date,vehicle_plate,driver_user_id) values($1,'PRUEBA ruta A','2026-10-20','PRIVATE-PLATE',$3),($2,'PRUEBA ruta B','2026-10-21','PRIVATE-PLATE',$3)",[id(10),id(11),id(2)]);
  for(const [delivery,trip,destination] of [[100,10,'PRUEBA destino A'],[101,11,'PRUEBA destino B'],[102,10,null]])await admin.query("insert into incargo_deliveries(id,trip_id,customer_name,destination_text) values($1,$2,'PRIVATE CUSTOMER',$3)",[id(delivery),id(trip),destination]);
  await admin.query("insert into incargo_client_accounts(id,display_name,created_by) values($1,'PRUEBA A',$3),($2,'PRUEBA B',$3)",[id(20),id(21),id(1)]);
  await admin.query('insert into incargo_client_memberships(user_id,account_id,created_by) values($1,$3,$5),($2,$4,$5)',[id(3),id(4),id(20),id(21),id(1)]);
  await admin.query('insert into incargo_client_delivery_links(delivery_id,account_id,created_by) values($1,$3,$5),($2,$4,$5)',[id(100),id(101),id(20),id(21),id(1)]);
  const as=async(user,delivery,entry='public.incargo_client_delivery_logistics',role='authenticated')=>{
   const c=await connect();try{await c.query('begin');await c.query('set local role '+role);await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user?id(user):'']);return (await c.query('select * from '+entry+'($1)',[delivery?id(delivery):null])).rows;}finally{await c.query('rollback');await c.end();}
  };
  await t.test('clients A/B obtain only own logistics and precisely the approved four columns',async()=>{
   for(const [user,own,foreign,label] of [[3,100,101,'A'],[4,101,100,'B']]){
    const rows=await as(user,own);assert.equal(rows.length,1);assert.equal(rows[0].destination_text,'PRUEBA destino '+label);assert.equal(rows[0].route_label,'PRUEBA ruta '+label);
    assert.deepEqual(Object.keys(rows[0]).sort(),['delivery_id','destination_text','route_label','scheduled_date'].sort());assert.doesNotMatch(JSON.stringify(rows),/PRIVATE/);
    assert.equal((await as(user,foreign)).length,0);assert.equal((await as(user,foreign,'incargo_private.client_delivery_logistics')).length,0);
   }
  });
  await t.test('no link, unknown ID, null identity/ID and driver/operations alone receive no rows',async()=>{
   for(const [user,delivery] of [[3,102],[3,999],[3,null],[null,100],[5,100],[1,100],[2,100]])assert.equal((await as(user,delivery)).length,0);
  });
  await t.test('dual operations/client role does not bypass the commercial account scope',async()=>{
   await admin.query('insert into incargo_client_memberships(user_id,account_id,created_by) values($1,$2,$1)',[id(1),id(20)]);
   assert.equal((await as(1,100)).length,1);assert.equal((await as(1,101)).length,0);
  });
  await t.test('missing destination stays null, never derived from another delivery on the trip',async()=>{
   await admin.query('insert into incargo_client_delivery_links(delivery_id,account_id,created_by) values($1,$2,$3)',[id(102),id(20),id(1)]);
   assert.equal((await as(3,102))[0].destination_text,null);
  });
  await t.test('membership revocation and delivery reassignment take effect on next request',async()=>{
   await admin.query('delete from incargo_client_memberships where user_id=$1',[id(3)]);assert.equal((await as(3,100)).length,0);
   await admin.query('update incargo_client_delivery_links set account_id=$1 where delivery_id=$2',[id(21),id(100)]);
   assert.equal((await as(1,100)).length,0);assert.equal((await as(4,100)).length,1);
  });
  await t.test('anon/service denied; existing direct-table access remains unavailable to the client',async()=>{
   for(const role of ['anon','service_role'])await assert.rejects(as(null,100,'public.incargo_client_delivery_logistics',role),/permission denied/);
   for(const entry of ['public.incargo_client_delivery_logistics(uuid)','incargo_private.client_delivery_logistics(uuid)']){
    const acl=(await admin.query("select has_function_privilege('authenticated',$1,'EXECUTE') as allowed,has_function_privilege('anon',$1,'EXECUTE') as anon,has_function_privilege('service_role',$1,'EXECUTE') as service",[entry])).rows[0];assert.deepEqual(acl,{allowed:true,anon:false,service:false});
   }
   const c=await connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id(4)]);assert.equal((await c.query('select * from incargo_deliveries')).rows.length,0);}finally{await c.query('rollback');await c.end();}
  });
 }finally{
  await admin?.end();const stop=spawnSync(binaries.pg_ctl,['-D',directory,'-m','fast','-w','stop'],{encoding:'utf8',windowsHide:true});if(stop.status!==0)server.kill();
 }
});
