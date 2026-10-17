const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../../logistica-1.0.0');
const source=Object.fromEntries(['incargo-session.js','incargo-client.js','incargo-app.js'].map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]));
const tick=()=>new Promise(r=>setImmediate(r));
function harness(context,{storage=new Map(),clock={now:1800000000000},user='A'}={}){
 const nodes=new Map(),timers=new Map();let timerId=0,focused=null;
 class Element{constructor(){this.children=[];this.hidden=false;this.disabled=false;this.textContent='';this.value='';this.style={};this.elements={email:{value:''}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}querySelector(){return this.button??=new Element();}reset(){}setAttribute(name,value){(this.attributes??={})[name]=value;}removeAttribute(){}focus(){focused=this;}closest(){return this;}remove(){}}
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 get('workspace').hidden=get('client-workspace').hidden=get('profile').hidden=true;
 let identity=[{account_id:'account-A',display_name:'Company A'}],role='operations',hook=null,authUser=user;
 const calls=[],response=(value,status=200)=>({ok:status<400,status,json:async()=>value,text:async()=>JSON.stringify(value)});
 const sandbox={Date:class extends Date{constructor(...a){super(...(a.length?a:[clock.now]));}static now(){return clock.now;}},
 setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,at:clock.now+delay});return id;},clearTimeout:id=>timers.delete(id),
 sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 document:{getElementById:get,querySelector:()=>get('tabs'),querySelectorAll:()=>[],createElement:()=>new Element()},
 FormData:class{get(n){return n==='email'?'fixture@example.invalid':n==='password'?'fixture':null;}},location:{origin:'https://example.invalid'},
 fetch:async(url,options={})=>{calls.push(url);if(hook){const r=hook(url,options);if(r)return r;}
  if(url==='/api/incargo-config')return response({url:'https://fixture.invalid',publishableKey:'fixture'});
  if(url.includes('/auth/v1/token'))return response({access_token:'synthetic-'+authUser,refresh_token:'NEVER-STORE',expires_at:1800000060,user:{id:authUser}});
  if(url.endsWith('/auth/v1/user'))return response({id:authUser,email:'fixture@example.invalid'});
  if(url.endsWith('/incargo_client_identity'))return response(identity);
  if(url.includes('incargo_memberships?select=role'))return response(role?[{role}]:[]);
  if(url.endsWith('/incargo_client_my_deliveries'))return response([{delivery_id:'fixture',reference:'PRUEBA',status:'pending',created_at:'2026-10-16'}]);
  return response([]);
 }};
 vm.runInNewContext(source['incargo-session.js'],sandbox);vm.runInNewContext(source[context==='client'?'incargo-client.js':'incargo-app.js'],sandbox);
 const workspace=()=>get(context==='client'?'client-workspace':'workspace');
 return {get,storage,clock,calls,response,workspace,ready:tick,focused:()=>focused,hook:v=>hook=v,identity:v=>identity=v,role:v=>role=v,user:v=>authUser=v,
  login:async()=>{await tick();await get('login-form').onsubmit({preventDefault(){},currentTarget:get('login-form')});await tick();},
  logout:()=>get('logout').onclick(),refresh:()=>context==='client'?get('refresh').onclick():get('client-admin-retry').onclick(),
  expire:async()=>{clock.now=1800000060000;for(const [id,t] of timers)if(t.at<=clock.now){timers.delete(id);t.fn();}await tick();}};
}
for(const context of ['client','operations']){
 test(context+': reload restores verified session with original expiry and minimal storage',async()=>{
  const h=harness(context);await h.login();assert.equal(h.workspace().hidden,false);assert.equal(h.storage.size,1);
  const record=JSON.parse([...h.storage.values()][0]);assert.equal(record.expires_at,1800000060);assert.equal(record.refresh_token,undefined);assert.equal(record.scope,undefined);assert.equal(record.user,undefined);
  const h2=harness(context,{storage:h.storage,clock:h.clock});await h2.ready();assert.equal(h2.workspace().hidden,false);assert.equal(JSON.parse([...h.storage.values()][0]).expires_at,record.expires_at);
  assert(h2.calls.some(x=>x.endsWith('/auth/v1/user')));assert(!h2.calls.some(x=>x.includes('/auth/v1/token')));
 });
 test(context+': logout removes persisted access and reload stays logged out',async()=>{
  const h=harness(context);await h.login();h.logout();assert.equal(h.storage.size,0);assert.equal(h.workspace().hidden,true);
  const h2=harness(context,{storage:h.storage});await h2.ready();assert.equal(h2.workspace().hidden,true);
 });
 test(context+': original expiry clears UI/storage and expired reload does not contact Auth',async()=>{
  const h=harness(context);await h.login();const saved=new Map(h.storage);await h.expire();assert.equal(h.workspace().hidden,true);assert.equal(h.storage.size,0);
  const h2=harness(context,{storage:saved,clock:h.clock});await h2.ready();assert.equal(h2.workspace().hidden,true);assert.equal(saved.size,0);assert(!h2.calls.some(x=>x.endsWith('/auth/v1/user')));
 });
 test(context+': authorization loss/change clears session on next action',async()=>{
  for(const changed of [false,true]){const h=harness(context);await h.login();if(context==='client')h.identity(changed?[{account_id:'other'}]:[]);else h.role(changed?'driver':null);
   await h.refresh();assert.equal(h.workspace().hidden,true);assert.equal(h.storage.size,0);
  }
 });
 test(context+': restore rejects revoked authorization',async()=>{
  const h=harness(context);await h.login();const h2=harness(context,{storage:h.storage});if(context==='client')h2.identity([]);else h2.role(null);await h2.ready();assert.equal(h2.workspace().hidden,true);assert.equal(h.storage.size,0);
 });
 test(context+': late restore after logout cannot restore session',async()=>{
  const h=harness(context);await h.login();let release;const h2=harness(context,{storage:h.storage});h2.hook(url=>url.endsWith('/auth/v1/user')?new Promise(r=>release=r):null);await tick();h2.logout();release(h2.response({id:'A'}));await tick();assert.equal(h2.workspace().hidden,true);assert.equal(h.storage.size,0);
 });
 test(context+': late data success/401 after logout and login cannot replace new session',async()=>{
  for(const status of [200,401]){const h=harness(context);await h.login();let release;
   h.hook(url=>url.endsWith(context==='client'?'/incargo_client_my_deliveries':'/incargo_client_admin_accounts')?new Promise(r=>release=r):null);
   const pending=h.refresh();await tick();h.logout();h.hook(null);h.user('B');if(context==='client')h.identity([{account_id:'account-B',display_name:'Company B'}]);await h.login();
   release(h.response([],status));await pending;assert.equal(h.workspace().hidden,false);assert.equal(JSON.parse([...h.storage.values()][0]).user_id,'B');
  }
 });
}
test('navigation keeps client and operations storage independent',async()=>{
 const storage=new Map(),a=harness('client',{storage});await a.login();const b=harness('operations',{storage});await b.ready();assert.equal(b.workspace().hidden,true);await b.login();assert.equal(storage.size,2);a.logout();assert.equal(storage.size,1);const b2=harness('operations',{storage});await b2.ready();assert.equal(b2.workspace().hidden,false);
});

for(const role of ['operations','driver']) {
 test(role+': Escape closes profile from heading and returns focus without requests',async()=>{
  const h=harness('operations');h.role(role);await h.login();
  h.get('profile-toggle').onclick();assert.equal(h.get('profile').hidden,false);
  assert.equal(h.focused(),h.get('profile-title'));const requests=h.calls.length;
  let prevented=0,stopped=0;
  h.get('profile').onkeydown?.({key:'Escape',preventDefault(){prevented++;},stopPropagation(){stopped++;}});
  assert.equal(h.get('profile').hidden,true);assert.equal(h.get('profile-toggle').attributes['aria-expanded'],'false');
  assert.equal(h.focused(),h.get('profile-toggle'));assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(h.calls.length,requests);
 });
 test(role+': toggle Escape and repeated open/close stay consistent; other keys do not close',async()=>{
  const h=harness('operations');h.role(role);await h.login();
  for(let i=0;i<2;i++){
   h.get('profile-toggle').onclick();assert.equal(h.get('profile-toggle').attributes['aria-expanded'],'true');
   h.get('profile').onkeydown?.({key:'Tab',preventDefault(){assert.fail('Tab intercepted');},stopPropagation(){assert.fail('Tab stopped');}});
   assert.equal(h.get('profile').hidden,false);
   h.get('profile-toggle').onkeydown?.({key:'Escape',preventDefault(){},stopPropagation(){}});
   assert.equal(h.get('profile').hidden,true);assert.equal(h.focused(),h.get('profile-toggle'));
  }
 });
}
test('hidden profile ignores Escape; logout closes without focusing the hidden toggle',async()=>{
 const h=harness('operations');await h.login();h.get('search').focus();
 h.get('profile').onkeydown?.({key:'Escape',preventDefault(){assert.fail('Hidden profile consumed Escape');},stopPropagation(){assert.fail('Hidden profile stopped Escape');}});
 assert.equal(h.focused(),h.get('search'));h.get('profile-toggle').onclick();h.get('logout').focus();h.logout();
 assert.equal(h.get('profile').hidden,true);assert.equal(h.focused(),h.get('logout'));assert.equal(h.get('workspace').hidden,true);
});
test('toggle closure returns focus to its trigger',async()=>{
 const h=harness('operations');await h.login();h.get('profile-toggle').onclick();h.get('profile-toggle').onclick();
 assert.equal(h.get('profile').hidden,true);assert.equal(h.focused(),h.get('profile-toggle'));
});
