// Disposable local PostgreSQL only. Requires a pinned local pg + embedded binary runtime.
// Usage: INCARGO_PG_RUNTIME=<directory> node --test incargo-app/tests/in-transit-postgres.test.cjs
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
const repo=process.env.INCARGO_TEST_REPO||path.resolve(__dirname,'../..');
const runtime=process.env.INCARGO_PG_RUNTIME;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('En ruta: real PostgreSQL authorization, atomicity and concurrency',{skip:!runtime},async t=>{
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
  await admin.query(fs.readFileSync(path.join(repo,'incargo-app/in-transit-applied.sql'),'utf8'));
  await t.test('applied SQL excludes inherited service_role and anonymous execute',async()=>{
   const result=await admin.query("select p.oid,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated,has_function_privilege('anon',p.oid,'EXECUTE') as anon,has_function_privilege('service_role',p.oid,'EXECUTE') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='incargo_private' and p.proname='start_delivery') or (n.nspname='public' and p.proname='incargo_start_delivery')");
   assert.equal(result.rowCount,2);for(const row of result.rows){assert.equal(row.authenticated,true);assert.equal(row.anon,false);assert.equal(row.service,false);}
  });
  await admin.query(`insert into auth.users(id) select $1::uuid where false`,[id(1)]);
  for(let n=1;n<=6;n++)await admin.query('insert into auth.users(id) values($1)',[id(n)]);
  await admin.query("insert into incargo_memberships(user_id,role) values($1,'operations'),($2,'operations'),($3,'driver')",[id(1),id(2),id(3)]);
  await admin.query("insert into incargo_trips(id,route_label,scheduled_date,vehicle_plate,driver_user_id) values($1,'Ruta A','2026-10-18','DEMO-A',$3),($2,'Ruta B','2026-10-18','DEMO-B',$3)",[id(10),id(11),id(3)]);
  for(let n=100;n<120;n++)await admin.query('insert into incargo_deliveries(id,trip_id,customer_name,remittance_reference) values($1,$2,$3,$4)',[id(n),id(n%2?11:10),n%2?'Empresa B':'Empresa A','REM-'+n]);
  await admin.query("insert into incargo_client_accounts(id,display_name,created_by) values($1,'Empresa A',$3),($2,'Empresa B',$3)",[id(20),id(21),id(1)]);
  await admin.query('insert into incargo_client_memberships(user_id,account_id,created_by) values($1,$3,$5),($2,$4,$5)',[id(4),id(5),id(20),id(21),id(1)]);
  await admin.query('insert into incargo_client_delivery_links(delivery_id,account_id,created_by) values($1,$3,$5),($2,$4,$5)',[id(100),id(101),id(20),id(21),id(1)]);
  const begin=async(client,user,role='authenticated')=>{await client.query('begin');await client.query('set local role '+role);await client.query("select set_config('request.jwt.claim.sub',$1,true)",[user?id(user):'']);};
  const as=async(user,sql,params=[])=>{const client=await connect();try{await begin(client,user);const result=await client.query(sql,params);await client.query('commit');return result;}catch(error){await client.query('rollback');throw error;}finally{await client.end();}};
  const start=(user,delivery,request)=>as(user,'select public.incargo_start_delivery($1,$2) as result',[id(delivery),id(request)]).then(r=>r.rows[0].result);
  const state=async delivery=>(await admin.query('select status,(select count(*)::int from incargo_delivery_events e where e.delivery_id=d.id and e.event_type=\'in_transit\') as events from incargo_deliveries d where id=$1',[id(delivery)])).rows[0];
  await t.test('only operations can call either entry point; anon cannot execute',async()=>{
   for(const user of [null,3,4,5,6])await assert.rejects(start(user,100,200+Number(user)),/operations required/);
   await assert.rejects(as(3,'select incargo_private.start_delivery($1,$2)',[id(100),id(210)]),/operations required/);
   const anon=await connect();try{await begin(anon,null,'anon');await assert.rejects(anon.query('select public.incargo_start_delivery($1,$2)',[id(100),id(211)]),/permission denied/);}finally{await anon.query('rollback');await anon.end();}
   assert.deepEqual(await state(100),{status:'pending',events:0});
  });
  await t.test('atomic start and replay do not duplicate the event; current operations scope includes both accounts',async()=>{
   assert.equal((await start(1,100,300)).outcome,'started');assert.equal((await start(1,100,300)).outcome,'replayed');
   assert.equal((await start(2,100,301)).outcome,'already_in_transit');assert.deepEqual(await state(100),{status:'in_transit',events:1});
   assert.equal((await start(2,101,302)).outcome,'started');
   await assert.rejects(start(2,100,300),/request conflict/);await assert.rejects(start(1,102,300),/request conflict/);
   assert.deepEqual(await state(102),{status:'pending',events:0});
  });
  await t.test('clients A/B see only own status and event; client cannot declare another company departure',async()=>{
   for(const [user,own,other] of [[4,100,101],[5,101,100]]){
    const rows=(await as(user,'select * from incargo_client_my_deliveries()')).rows;assert.equal(rows.length,1);assert.equal(rows[0].delivery_id,id(own));assert.equal(rows[0].status,'in_transit');
    const ownEvents=(await as(user,'select * from incargo_client_delivery_milestones($1)',[id(own)])).rows;assert.equal(ownEvents[0].event_type,'in_transit');
    assert.equal((await as(user,'select * from incargo_client_delivery_milestones($1)',[id(other)])).rows.length,0);await assert.rejects(start(user,other,310+user),/operations required/);
   }
  });
  await t.test('exception/delivered reject new departures; old request acknowledges without reverting',async()=>{
   await admin.query("update incargo_deliveries set status='exception' where id=$1",[id(100)]);
   assert.equal((await start(1,100,300)).status,'exception');await assert.rejects(start(1,100,320),/requires pending/);
   await admin.query("update incargo_deliveries set status='delivered' where id=$1",[id(100)]);
   assert.equal((await start(1,100,300)).status,'delivered');await assert.rejects(start(1,100,321),/requires pending/);assert.equal((await state(100)).events,1);
  });
  await t.test('existing driver confirmation from pending remains valid',async()=>{
   await admin.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['incargo-proofs',id(102)+'/fixture.png',id(3)]);
   await as(3,'select incargo_confirm_delivery($1,$2,$3,$4,null)',[id(102),id(330),id(102)+'/fixture.png','Receptor sintético']);assert.deepEqual(await state(102),{status:'delivered',events:0});
  });
  await t.test('failure between writes rolls back the event and status',async()=>{
   await admin.query(`create function public.fixture_reject_update() returns trigger language plpgsql as $$begin if new.id='${id(103)}'::uuid then raise exception 'fixture rejected';end if;return new;end$$;create trigger fixture_reject before update on incargo_deliveries for each row execute function public.fixture_reject_update()`);
   await assert.rejects(start(1,103,340),/fixture rejected/);assert.deepEqual(await state(103),{status:'pending',events:0});await admin.query('drop trigger fixture_reject on incargo_deliveries;drop function fixture_reject_update()');
  });
  const waitLocked=async client=>{for(let i=0;i<100;i++){const row=(await admin.query('select wait_event_type from pg_stat_activity where pid=$1',[client.processID])).rows[0];if(row?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,10));}assert.fail('Expected real row lock contention');};
  await t.test('two sessions with same or different request ids produce one departure',async()=>{
   for(const [delivery,requestA,requestB] of [[104,350,350],[105,351,352]]){
    const a=await connect(),b=await connect();try{await begin(a,1);await begin(b,1);await a.query('select incargo_start_delivery($1,$2)',[id(delivery),id(requestA)]);
     const second=b.query('select incargo_start_delivery($1,$2)',[id(delivery),id(requestB)]);await waitLocked(b);await a.query('commit');await second;await b.query('commit');assert.deepEqual(await state(delivery),{status:'in_transit',events:1});
    }finally{await a.query('rollback');await b.query('rollback');await a.end();await b.end();}
   }
  });
  await t.test('concurrent novelty wins before departure; no automatic return from exception',async()=>{
   const a=await connect(),b=await connect();try{await begin(a,3);await begin(b,1);await a.query('select incargo_record_issue($1,$2,$3)',[id(106),id(360),'Novedad sintética']);
    const second=b.query('select incargo_start_delivery($1,$2)',[id(106),id(361)]);const rejected=assert.rejects(second,/requires pending/);await waitLocked(b);await a.query('commit');await rejected;await b.query('rollback');assert.deepEqual(await state(106),{status:'exception',events:0});
   }finally{await a.query('rollback');await b.query('rollback');await a.end();await b.end();}
  });
  await t.test('revocation committed while departure waits is enforced, including replay',async()=>{
   const a=await connect(),b=await connect();try{await a.query('begin');await a.query('delete from incargo_memberships where user_id=$1',[id(1)]);await begin(b,1);
    const second=b.query('select incargo_start_delivery($1,$2)',[id(107),id(370)]);const rejected=assert.rejects(second,/operations required/);await waitLocked(b);await a.query('commit');await rejected;await b.query('rollback');
    await assert.rejects(start(1,100,300),/operations required/);assert.deepEqual(await state(107),{status:'pending',events:0});
   }finally{await a.query('rollback');await b.query('rollback');await a.end();await b.end();}
  });
 }finally{
  await admin?.end();const stop=spawnSync(binaries.pg_ctl,['-D',directory,'-m','fast','-w','stop'],{encoding:'utf8',windowsHide:true});if(stop.status!==0)server.kill();
 }
});
