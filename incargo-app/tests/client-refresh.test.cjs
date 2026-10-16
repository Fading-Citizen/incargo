const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../logistica-1.0.0/incargo-client.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const row=n=>({delivery_id:String(n),reference:'PRUEBA-'+n,status:'pending',created_at:'2026-10-16T00:00:00Z',last_event_at:null});
function harness(){
 const nodes=new Map();
 class Element {
  constructor(){this.children=[];this.hidden=false;this.disabled=false;this.textContent='';this.elements={email:{value:''}};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  querySelector(){return this.button??=new Element();}
  reset(){}
  setAttribute(){}
  removeAttribute(){}
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 let rows=[],identity=[{account_id:'test-account',display_name:'PRUEBAS'}],listHook=null,detailHook=null,calls=0,lastBody;
 const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
 const context={document:{getElementById:get,querySelector:()=>get('tabs'),querySelectorAll:()=>[],createElement:()=>new Element()},FormData:class {get(name){return name==='email'?'qa@example.invalid':'fixture';}},location:{origin:'https://example.invalid'},fetch:async(url,options={})=>{
  if(url==='/api/incargo-config')return response({url:'https://fixture.invalid',publishableKey:'fixture'});
  if(url.includes('/auth/v1/token'))return response({access_token:'fixture',user:{id:'fixture'}});
  if(url.endsWith('/incargo_client_identity'))return response(identity);
  if(url.endsWith('/incargo_client_my_deliveries')){calls++;lastBody=JSON.parse(options.body);return listHook?listHook():response(rows);}
  if(url.endsWith('/incargo_client_delivery_milestones'))return detailHook?detailHook():response([]);
  throw Error('Unexpected request '+url);
 }};
 vm.runInNewContext(source,context);
 return {get,setRows:v=>rows=v,setIdentity:v=>identity=v,setList:v=>listHook=v,setDetail:v=>detailHook=v,response,
 calls:()=>calls,lastBody:()=>lastBody,login:async()=>{await get('login-form').onsubmit({preventDefault(){},currentTarget:get('login-form')});await tick();},
 refresh:()=>get('refresh').onclick(),count:()=>get('deliveries').children.length,
 detail:()=>get('deliveries').children[0].children.at(-1).onclick()};
}
test('refresh discovers a newly linked delivery from an empty list without another login',async()=>{
 const h=harness();await h.login();assert.equal(h.count(),0);
 h.setRows([row(1)]);await h.refresh();assert.equal(h.count(),1);assert.equal(h.get('login').hidden,true);assert.equal(h.get('refresh').disabled,false);
});
test('refresh resets pagination and replaces existing rows instead of duplicating them',async()=>{
 const h=harness();h.setRows(Array.from({length:50},(_,i)=>row(i)));await h.login();
 h.setRows([row(51)]);await h.get('more').onclick();assert.equal(h.count(),51);
 h.setRows([row(2)]);await h.refresh();assert.equal(h.count(),1);assert.deepEqual(h.lastBody(),{});
});
test('rapid double refresh issues one list request and disables the control while pending',async()=>{
 const h=harness();await h.login();let release;h.setList(()=>new Promise(r=>release=r));
 const first=h.refresh();await tick();assert.equal(h.get('refresh').disabled,true);
 await h.refresh();assert.equal(h.calls(),2);release(h.response([row(1)]));await first;assert.equal(h.count(),1);
});
test('refresh invalidates an outstanding detail response',async()=>{
 const h=harness();h.setRows([row(1)]);await h.login();let release;h.setDetail(()=>new Promise(r=>release=r));
 const detail=h.detail();await tick();h.setRows([row(2)]);await h.refresh();
 release(h.response([{event_type:'delivered',occurred_at:'2026-10-16T00:00:00Z'}]));await detail;
 assert.equal(h.get('detail').hidden,true);assert.equal(h.get('milestones').children.length,0);
});
test('refresh network failure clears stale rows and retry recovers',async()=>{
 const h=harness();h.setRows([row(1)]);await h.login();h.setList(async()=>{throw Error('Network unavailable');});
 await h.refresh();assert.equal(h.count(),0);assert.equal(h.get('more').textContent,'Reintentar');assert.equal(h.get('refresh').disabled,false);
 h.setList(null);h.setRows([row(2)]);await h.get('more').onclick();assert.equal(h.count(),1);
});
test('revoked or reassigned membership clears the view during refresh',async()=>{
 for(const identity of [[],[{account_id:'other-account'}]]){
  const h=harness();h.setRows([row(1)]);await h.login();h.setIdentity(identity);await h.refresh();
  assert.equal(h.count(),0);assert.equal(h.get('client-workspace').hidden,true);assert.match(h.get('notice').textContent,/acceso de cliente cambió/);
 }
});
test('expired session and late response after logout cannot restore old rows',async()=>{
 const expired=harness();await expired.login();expired.setList(async()=>expired.response({},401));await expired.refresh();assert.equal(expired.get('client-workspace').hidden,true);
 const h=harness();await h.login();let release;h.setList(()=>new Promise(r=>release=r));const pending=h.refresh();await tick();
 h.get('logout').onclick();release(h.response([row(1)]));await pending;assert.equal(h.count(),0);assert.equal(h.get('client-workspace').hidden,true);
});
