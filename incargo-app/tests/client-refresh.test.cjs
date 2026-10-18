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
 let rows=[],identity=[{account_id:'test-account',display_name:'PRUEBAS'}],identityHook=null,listHook=null,detailHook=null,calls=0,lastBody;
 const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
 const retainedStorage=new Map();const context={setTimeout:()=>1,clearTimeout:()=>{},sessionStorage:{getItem:k=>retainedStorage.get(k)??null,setItem:(k,v)=>retainedStorage.set(k,v),removeItem:k=>retainedStorage.delete(k)},document:{getElementById:get,querySelector:()=>get('tabs'),querySelectorAll:()=>[],createElement:()=>new Element()},FormData:class {get(name){return name==='email'?'qa@example.invalid':'fixture';}},location:{origin:'https://example.invalid'},fetch:async(url,options={})=>{
  if(url==='/api/incargo-config')return response({url:'https://fixture.invalid',publishableKey:'fixture'});
  if(url.includes('/auth/v1/token'))return response({access_token:'fixture',expires_at:Math.floor(Date.now()/1000)+60,user:{id:'fixture'}});
  if(url.endsWith('/auth/v1/user'))return response({id:'fixture'});
  if(url.endsWith('/incargo_client_identity'))return identityHook?identityHook():response(identity);
  if(url.endsWith('/incargo_client_my_deliveries')){calls++;lastBody=JSON.parse(options.body);return listHook?listHook():response(rows);}
  if(url.endsWith('/incargo_client_delivery_milestones'))return detailHook?detailHook():response([]);
  throw Error('Unexpected request '+url);
 }};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../../logistica-1.0.0/incargo-session.js'),'utf8'),context);vm.runInContext(source,context);
 return {get,setIdentityHook:v=>identityHook=v,setRows:v=>rows=v,setIdentity:v=>identity=v,setList:v=>listHook=v,setDetail:v=>detailHook=v,response,
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


test('review: stale detail 401 after refresh does not clear current session',async()=>{
 const h=harness();h.setRows([row(1)]);await h.login();let release;
 h.setDetail(()=>new Promise(r=>release=r));const pending=h.detail();await tick();
 h.setRows([row(2)]);await h.refresh();release(h.response({},401));await pending;
 assert.equal(h.count(),1);assert.equal(h.get('client-workspace').hidden,false);assert.equal(h.get('detail').hidden,true);
});
test('review: old list success or 401 cannot overwrite or clear new account',async()=>{
 for(const status of [200,401]){
  const h=harness();await h.login();let release;h.setList(()=>new Promise(r=>release=r));
  const pending=h.refresh();await tick();h.get('logout').onclick();
  h.setIdentity([{account_id:'account-b',display_name:'B'}]);h.setList(null);h.setRows([row('B')]);await h.login();
  release(h.response([row('A')],status));await pending;
  assert.equal(h.get('account-name').textContent,'B');assert.equal(h.count(),1);
  assert.equal(h.get('deliveries').children[0].children[0].textContent,'PRUEBA-B');assert.equal(h.get('client-workspace').hidden,false);
 }
});
test('review: membership lookup 500 is retryable and reenables controls',async()=>{
 const h=harness();await h.login();h.setIdentityHook(()=>h.response({},500));await h.refresh();
 assert.equal(h.get('refresh').disabled,false);assert.equal(h.get('more').disabled,false);assert.equal(h.get('more').textContent,'Reintentar');
 h.setIdentityHook(null);h.setRows([row(3)]);await h.refresh();assert.equal(h.count(),1);
});
test('review: refresh during pagination is ignored then resets cursor after completion',async()=>{
 const h=harness();h.setRows(Array.from({length:50},(_,i)=>row(i)));await h.login();let release;
 h.setList(()=>new Promise(r=>release=r));const pending=h.get('more').onclick();await tick();
 const calls=h.calls();await h.refresh();assert.equal(h.calls(),calls);assert.equal(h.count(),50);
 release(h.response([row(51)]));await pending;assert.equal(h.count(),51);
 h.setList(null);h.setRows([row(9)]);await h.refresh();assert.equal(h.count(),1);assert.deepEqual(h.lastBody(),{});
});
test('review: malformed list response leaves retry available',async()=>{
 const h=harness();await h.login();h.setList(()=>h.response({unexpected:true}));await h.refresh();
 assert.equal(h.count(),0);assert.equal(h.get('more').textContent,'Reintentar');assert.equal(h.get('refresh').disabled,false);
 h.setList(null);h.setRows([row(1)]);await h.get('more').onclick();assert.equal(h.count(),1);
});
test('review: late identity result after logout cannot issue list query or restore rows',async()=>{
 const h=harness();await h.login();let release;h.setIdentityHook(()=>new Promise(r=>release=r));
 const calls=h.calls(),pending=h.refresh();await tick();h.get('logout').onclick();
 release(h.response([{account_id:'test-account'}]));await pending;
 assert.equal(h.calls(),calls);assert.equal(h.count(),0);assert.equal(h.get('client-workspace').hidden,true);
});

test('client Spanish copy renders empty, failed list, recovery and validation states',async()=>{
 const h=harness();await h.login();
 assert.equal(h.get('list-status').textContent,'Aún no hay envíos vinculados a tu cuenta.');
 h.setList(()=>h.response({},500));await h.refresh();
 assert.equal(h.get('list-status').textContent,'No pudimos consultar tus envíos. Inténtalo más tarde.');
 h.get('logout').onclick();assert.equal(h.get('notice').textContent,'Sesión cerrada en esta pestaña.');
 h.get('forgot-link').onclick();assert.equal(h.get('auth-title').textContent,'Recupera tu contraseña');
 assert.equal(h.get('auth-description').textContent,'Te enviaremos un enlace para establecer una contraseña nueva.');
 await h.get('register-form').onsubmit({preventDefault(){},currentTarget:h.get('register-form')});
 assert.equal(h.get('notice').textContent,'La contraseña debe tener al menos 12 caracteres y coincidir en ambos campos.');
});

test('client Spanish copy renders milestone and expired-session states',async()=>{
 const h=harness();h.setRows([{...row(1),status:'in_transit',last_event_at:'2026-10-16T00:00:00Z'}]);await h.login();
 assert.match(h.get('deliveries').children[0].children[2].textContent,/ · Último hito:/);
 await h.detail();assert.equal(h.get('detail-status').textContent,'Todavía no hay hitos registrados.');
 h.setDetail(()=>h.response([{event_type:'in_transit',occurred_at:'2026-10-16T00:00:00Z'}]));await h.detail();
 assert.match(h.get('milestones').children[0].textContent,/^En ruta · /);
 h.setDetail(()=>h.response({},403));await h.detail();
 assert.equal(h.get('client-workspace').hidden,true);
 assert.equal(h.get('notice').textContent,'Tu sesión terminó o ya no tienes acceso. Ingresa nuevamente.');
});
