const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTabSession}=require('../../logistica-1.0.0/incargo-session.js');
const store=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};};
const login=(id='fixture-A')=>({access_token:'fixture-access-'+id,refresh_token:'MUST-NOT-BE-STORED',expires_at:2000,user:{id}});
function setup(storage=store(),context='client',extras={}){
 const opts={storage,context,project:'fixture-project',now:()=>1000000,
 verifyUser:async token=>({id:token.replace('fixture-access-','')}),
 authorize:async ()=>context==='client'?{account_id:'fixture-company'}:{role:'operations'},...extras};
 return {adapter:createTabSession(opts),opts,storage};
}
test('reload restores same identity and expiry after server verification',async()=>{
 const h=setup();await h.adapter.remember(login());let verified=0;
 const next=createTabSession({...h.opts,verifyUser:async()=>{verified++;return {id:'fixture-A'};}});
 const session=await next.restore();assert.equal(session.user.id,'fixture-A');assert.equal(session.expires_at,2000);assert.equal(verified,1);
});
test('navigation does not inherit client identity into operations, and return restores client',async()=>{
 const h=setup();await h.adapter.remember(login());
 const ops=createTabSession({...h.opts,context:'operations'});assert.equal(await ops.restore(),null);
 await ops.remember(login('fixture-B'));const back=createTabSession(h.opts);assert.equal((await back.restore()).user.id,'fixture-A');
 assert.equal(ops.current().user.id,'fixture-B');
});
test('storage contains neither refresh token, cached roles, nor personal profile',async()=>{
 const h=setup();await h.adapter.remember({...login(),user:{id:'fixture-A',email:'qa@example.invalid',role:'operations'}});
 const saved=[...h.storage.data.values()][0];assert.equal(saved.includes('MUST-NOT'),false);assert.equal(saved.includes('qa@example'),false);assert.equal(saved.includes('role'),false);
});
test('expiry is never extended and expired restoration is rejected before network',async()=>{
 const h=setup();await h.adapter.remember(login());let called=false;
 const next=createTabSession({...h.opts,now:()=>2000000,verifyUser:async()=>{called=true;}});
 await assert.rejects(()=>next.restore());assert.equal(called,false);assert.equal(h.storage.data.size,0);
});
test('expiry during verification rejects and active expiry clears storage',async()=>{
 let clock=1000000;const h=setup(store(),'client',{now:()=>clock});await h.adapter.remember(login());clock=2000000;
 assert.equal(h.adapter.current(),null);assert.equal(h.storage.data.size,0);
 clock=1000000;const late=setup(store(),'client',{now:()=>clock,authorize:async()=>{clock=2000000;return {account_id:'fixture'};}});
 await assert.rejects(()=>late.adapter.remember(login()));assert.equal(late.storage.data.size,0);
});
test('logout clears only this context and cannot be undone by reload',async()=>{
 const h=setup();await h.adapter.remember(login());const ops=createTabSession({...h.opts,context:'operations'});await ops.remember(login());
 h.adapter.clear();assert.equal(await createTabSession(h.opts).restore(),null);assert.equal((await createTabSession({...h.opts,context:'operations'}).restore()).user.id,'fixture-A');
});
test('logout while restoration is pending prevents late state restoration',async()=>{
 const h=setup();await h.adapter.remember(login());let release;
 const next=createTabSession({...h.opts,verifyUser:()=>new Promise(r=>release=r)});
 const pending=next.restore();next.clear();release({id:'fixture-A'});assert.equal(await pending,null);assert.equal(next.current(),null);assert.equal(h.storage.data.size,0);
});
test('server identity or authorization rejection clears retained credentials',async()=>{
 for(const extra of [{verifyUser:async()=>({id:'different'})},{authorize:async()=>null},{verifyUser:async()=>{throw Error('401');}}]){
  const h=setup();await h.adapter.remember(login());const next=createTabSession({...h.opts,...extra});
  await assert.rejects(()=>next.restore());assert.equal(next.current(),null);assert.equal(h.storage.data.size,0);
 }
});
test('corrupt and cross-context stored records fail closed',async()=>{
 for(const mutate of [()=>'{',r=>JSON.stringify({...r,context:'operations'}),r=>JSON.stringify({...r,project:'different'})]){
  const h=setup();await h.adapter.remember(login());const [key,raw]=[...h.storage.data][0];h.storage.setItem(key,mutate(JSON.parse(raw)));
  await assert.rejects(()=>createTabSession(h.opts).restore());assert.equal(h.storage.data.size,0);
 }
});
test('failed account switch removes previous identity; unavailable storage does not silently persist',async()=>{
 const h=setup();await h.adapter.remember(login());await assert.rejects(()=>h.adapter.remember({...login('fixture-B'),expires_at:0}));assert.equal(h.storage.data.size,0);
 const blocked=store();blocked.setItem=()=>{throw Error('blocked');};const x=setup(blocked);await assert.rejects(()=>x.adapter.remember(login()));assert.equal(x.adapter.current(),null);
});
test('fresh browser tab has no retained identity and scope is fetched anew on return',async()=>{
 const h=setup();await h.adapter.remember(login());assert.equal(await setup().adapter.restore(),null);
 const next=createTabSession({...h.opts,authorize:async()=>({account_id:'reassigned-fixture'})});assert.equal((await next.restore()).scope.account_id,'reassigned-fixture');
});

