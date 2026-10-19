const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../logistica-1.0.0/incargo-client.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const row=n=>({delivery_id:String(n),reference:'PRUEBA-'+n,status:'pending',created_at:'2026-10-16T00:00:00Z',last_event_at:null});
function harness(cargoEnabled=false){
 const nodes=new Map();
 class Element {
  constructor(){this.children=[];this.hidden=false;this.disabled=false;this.textContent='';this.elements={email:{value:''}};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  querySelector(){return this.button??=new Element();}
  focus(){this.focused=true;}
  reset(){}
  setAttribute(){}
  removeAttribute(){}
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 let rows=[],identity=[{account_id:'test-account',display_name:'PRUEBAS'}],identityHook=null,listHook=null,detailHook=null,logisticsHook=null,cargoHook=null,calls=0,lastBody;
 const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
 const retainedStorage=new Map();const context={setTimeout:()=>1,clearTimeout:()=>{},sessionStorage:{getItem:k=>retainedStorage.get(k)??null,setItem:(k,v)=>retainedStorage.set(k,v),removeItem:k=>retainedStorage.delete(k)},document:{getElementById:get,querySelector:()=>get('tabs'),querySelectorAll:()=>[],createElement:()=>new Element()},FormData:class {get(name){return name==='email'?'qa@example.invalid':'fixture';}},location:{origin:'https://example.invalid'},fetch:async(url,options={})=>{
  if(url==='/api/incargo-config')return response({url:'https://fixture.invalid',publishableKey:'fixture'});
  if(url.includes('/auth/v1/token'))return response({access_token:'fixture',expires_at:Math.floor(Date.now()/1000)+60,user:{id:'fixture'}});
  if(url.endsWith('/auth/v1/user'))return response({id:'fixture'});
  if(url.endsWith('/incargo_client_identity'))return identityHook?identityHook():response(identity);
  if(url.endsWith('/incargo_client_my_deliveries')){calls++;lastBody=JSON.parse(options.body);return listHook?listHook():response(rows);}
  if(url.endsWith('/incargo_client_delivery_cargo'))return cargoHook?cargoHook(JSON.parse(options.body)):response([]);
  if(url.endsWith('/incargo_client_delivery_logistics'))return logisticsHook?logisticsHook(JSON.parse(options.body)):response([]);
  if(url.endsWith('/incargo_client_delivery_milestones'))return detailHook?detailHook():response([]);
  throw Error('Unexpected request '+url);
 }};
 context.IncargoCargo={...require('../../logistica-1.0.0/incargo-cargo.js'),enabled:cargoEnabled};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../../logistica-1.0.0/incargo-session.js'),'utf8'),context);vm.runInContext(source,context);
 return {get,setIdentityHook:v=>identityHook=v,setRows:v=>rows=v,setIdentity:v=>identity=v,setList:v=>listHook=v,setDetail:v=>detailHook=v,setLogistics:v=>logisticsHook=v,setCargo:v=>cargoHook=v,response,
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


test('local filters intersect reference and status, clear restores loaded rows without requests',async()=>{
 const h=harness();h.setRows([row(1),{...row(2),status:'delivered'}]);await h.login();const calls=h.calls();
 h.get('client-search').value='prueba';h.get('client-status').value='delivered';h.get('client-search').oninput();
 assert.equal(h.count(),1);assert.equal(h.get('filter-count').textContent,'1 de 2 envíos cargados');
 h.get('client-search').value='absent';h.get('client-search').oninput();assert.equal(h.count(),0);assert.match(h.get('filter-count').textContent,/No hay coincidencias/);
 h.get('clear-client-filters').onclick();assert.equal(h.count(),2);assert.equal(h.calls(),calls);assert(h.get('client-search').focused);
});
test('filters survive refresh, pagination and error retry without hiding pending/error messages',async()=>{
 const h=harness();h.setRows(Array.from({length:50},(_,i)=>row(i)));await h.login();
 h.get('client-search').value='PRUEBA-99';h.get('client-search').oninput();assert.equal(h.count(),0);
 h.setRows([row(99)]);await h.get('more').onclick();assert.equal(h.count(),1);assert.match(h.get('filter-count').textContent,/1 de 51/);
 h.setList(()=>h.response({},500));await h.refresh();const error=h.get('list-status').textContent;
 h.get('clear-client-filters').onclick();assert.equal(h.get('list-status').textContent,error);assert.equal(h.get('filter-count').textContent,'');
 h.setList(null);h.setRows([]);await h.get('more').onclick();assert.equal(h.count(),0);assert.match(h.get('list-status').textContent,/Aún no hay/);
});
test('close and Escape invalidate late milestone responses and restore the opener focus',async()=>{
 for(const status of [200,500,401]){
 const h=harness();h.setRows([row(1)]);await h.login();const opener=h.get('deliveries').children[0].children.at(-1);let release;
 h.setDetail(()=>new Promise(resolve=>release=resolve));const pending=h.detail();await tick();assert(h.get('detail-title').focused);
 h.get('close-detail').onclick();assert(opener.focused);assert.equal(h.get('detail').hidden,true);
 release(h.response(status===200?[{event_type:'delivered',occurred_at:'2026-10-16'}]:{},status));await pending;
 assert.equal(h.get('detail').hidden,true);assert.equal(h.get('milestones').children.length,0);assert.equal(h.get('client-workspace').hidden,false);
 h.setDetail(null);await h.detail();let prevented=false;h.get('detail').onkeydown({key:'Escape',preventDefault(){prevented=true},stopPropagation(){}});assert(prevented);assert.equal(h.get('detail').hidden,true);
 }
});
test('filtering closes details and late results cannot appear under a different filtered delivery',async()=>{
 const h=harness();h.setRows([row(1),row(2)]);await h.login();let release;h.setDetail(()=>new Promise(resolve=>release=resolve));const pending=h.detail();await tick();
 h.get('client-search').value='PRUEBA-2';h.get('client-search').oninput();release(h.response([{event_type:'delivered',occurred_at:'2026-10-16'}]));await pending;
 assert.equal(h.count(),1);assert.equal(h.get('detail').hidden,true);assert.equal(h.get('milestones').children.length,0);
 h.get('logout').onclick();assert.equal(h.get('client-search').value,'');assert.equal(h.get('client-status').value,'');assert.equal(h.get('filter-count').textContent,'');
});

test('closing after the opener was replaced returns focus to the client search',async()=>{
 const h=harness();h.setRows([row(1)]);await h.login();const opener=h.get('deliveries').children[0].children.at(-1);
 await h.detail();opener.isConnected=false;h.get('close-detail').onclick();assert(h.get('client-search').focused);assert.equal(h.get('detail').hidden,true);
});

const detailText=node=>[node.textContent,...node.children.map(detailText)].join(' ');
test('shipment detail identifies the reference and uses only authorized fields, with Colombia dates',async()=>{
 const h=harness();h.setRows([{...row(1),reference:'PRUEBA <img src=x>',status:'in_transit',destination_text:'PRIVATE DESTINATION',note:'PRIVATE NOTE',created_at:'2026-10-16T03:00:00Z'}]);await h.login();
 h.setDetail(()=>h.response([{event_type:'in_transit',occurred_at:'2026-10-16T15:00:00Z',note:'PRIVATE NOTE'},{event_type:'created',occurred_at:'2026-10-16T03:00:00Z'}]));await h.detail();
 assert.equal(h.get('detail-reference').textContent,'PRUEBA <img src=x>');assert.equal(h.get('detail-state').textContent,'En ruta');
 assert.match(detailText(h.get('detail-summary')),/15.*oct.*2026.*22:00/);
 assert.match(detailText(h.get('milestones').children[0]),/Registro del envío.*no acredita recepción física/);
 assert.match(h.get('detail-freshness').textContent,/La hora de consulta no es la hora del último hito/);
 assert.doesNotMatch(detailText(h.get('milestones'))+detailText(h.get('detail-summary')),/PRIVATE/);
});
test('malformed history and server error offer detail-only retry without duplicating events',async()=>{
 for(const failure of [{unexpected:true},[null]]){const h=harness();h.setRows([row(1)]);await h.login();h.setDetail(()=>h.response(failure));await h.detail();
 assert.equal(h.get('detail-retry').hidden,false);assert.equal(h.get('milestones').children.length,0);const lists=h.calls();
 h.setDetail(()=>h.response([{event_type:'in_transit',occurred_at:'invalid'}]));await h.get('detail-retry').onclick();
 assert.equal(h.calls(),lists);assert.equal(h.get('milestones').children.length,1);assert.match(h.get('milestones').children[0].textContent,/Fecha no disponible/);assert.equal(h.get('detail-retry').hidden,true);
 }
 const h=harness();h.setRows([row(1)]);await h.login();h.setDetail(()=>h.response({},500));await h.detail();assert.equal(h.get('detail-retry').hidden,false);
 h.get('close-detail').onclick();await h.get('detail-retry').onclick();assert.equal(h.get('detail-reference').textContent,'');assert.equal(h.get('detail').hidden,true);
});
test('late history of A cannot overwrite B reference, timeline or retry state',async()=>{
 for(const status of [200,500,401]){const h=harness();h.setRows([row('A'),{...row('B'),status:'delivered'}]);await h.login();let release;
 h.setDetail(()=>new Promise(r=>release=r));const first=h.detail();await tick();h.setDetail(()=>h.response([{event_type:'delivered',occurred_at:'2026-10-19T15:00:00Z'}]));
 await h.get('deliveries').children[1].children.at(-1).onclick();release(h.response([],status));await first;
 assert.equal(h.get('detail-reference').textContent,'PRUEBA-B');assert.equal(h.get('detail-state').textContent,'Entregada');assert.equal(h.get('milestones').children.length,1);assert.equal(h.get('detail-retry').hidden,true);
 h.get('logout').onclick();assert.equal(h.get('detail-reference').textContent,'');assert.equal(h.get('detail-summary').children.length,0);
 }
});

test('logistics shows only approved fields and preserves a date-only scheduled day',async()=>{
 const h=harness();h.setRows([row(1)]);h.setLogistics(()=>h.response([{delivery_id:'1',destination_text:'Destino <img src=x>',route_label:'Ruta PRUEBA',scheduled_date:'2026-10-21',vehicle_plate:'PRIVATE',receiver_name:'PRIVATE',note:'PRIVATE'}]));await h.login();await h.detail();
 const text=detailText(h.get('logistics-fields'));assert.match(text,/Destino <img src=x>/);assert.match(text,/21 de octubre de 2026/);assert.match(text,/Fecha programada del viaje/);assert.doesNotMatch(text,/PRIVATE/);assert.match(h.get('logistics-status').textContent,/no es una fecha estimada/);
});
test('logistics empty, malformed, absent fields and errors remain distinct; retry recovers',async()=>{
 const h=harness();h.setRows([row(1)]);await h.login();await h.detail();assert.match(h.get('logistics-status').textContent,/No hay datos logísticos/);
 for(const payload of [[{delivery_id:'foreign',destination_text:'OTHER'}],{},[null]]){h.setLogistics(()=>h.response(payload));await h.detail();assert.equal(h.get('logistics-retry').hidden,false);assert.equal(h.get('logistics-fields').children.length,0);}
 h.setLogistics(()=>h.response({},500));await h.detail();assert.match(h.get('logistics-status').textContent,/No pudimos consultar/);assert.equal(h.get('detail-status').textContent,'Todavía no hay hitos registrados.');
 h.setLogistics(()=>h.response([{delivery_id:'1',destination_text:null,route_label:'',scheduled_date:'2026-02-31'}]));await h.get('logistics-retry').onclick();assert.equal(h.get('logistics-retry').hidden,true);assert.match(detailText(h.get('logistics-fields')),/Sin destino registrado.*Sin ruta registrada.*Sin fecha programada/);
});
for(const action of ['close','logout','switch','filter'])test('late logistics success/error cannot restore after '+action,async()=>{
 for(const status of [200,500,401]){
 const h=harness();h.setRows([row('A'),row('B')]);await h.login();let release;h.setLogistics(()=>new Promise(r=>release=r));const pending=h.detail();await tick();
 if(action==='close')h.get('close-detail').onclick();
 if(action==='logout')h.get('logout').onclick();
 if(action==='filter'){h.get('client-search').value='B';h.get('client-search').oninput();}
 if(action==='switch'){h.setLogistics(()=>h.response([{delivery_id:'B',destination_text:'Destino B',route_label:null,scheduled_date:null}]));await h.get('deliveries').children[1].children.at(-1).onclick();}
 release(h.response([{delivery_id:'A',destination_text:'OLD A'}],status));await pending;
 assert.doesNotMatch(detailText(h.get('logistics-fields')),/OLD A/);
 if(action==='switch'){assert.match(detailText(h.get('logistics-fields')),/Destino B/);assert.equal(h.get('client-workspace').hidden,false);}else assert.equal(h.get('logistics-fields').children.length,0);
 }
});
test('current logistics authorization error clears the entire customer view',async()=>{
 const h=harness();h.setRows([row(1)]);h.setLogistics(()=>h.response({},401));await h.login();await h.detail();assert.equal(h.get('client-workspace').hidden,true);assert.equal(h.get('logistics-fields').children.length,0);assert.equal(h.get('detail-reference').textContent,'');
});
test('cargo disabled never calls the pending RPC',async()=>{const h=harness();h.setCargo(()=>{throw Error('Unexpected call');});h.setRows([row(1)]);await h.login();await h.detail();assert.equal(h.get('cargo-fields').children.length,0);});
test('enabled cargo null, invalid, error, retry, and literal text',async()=>{
 const h=harness(true);h.setRows([row(1)]);await h.login();await h.detail();assert.match(h.get('cargo-status').textContent,/No hay datos/);
 h.setCargo(()=>h.response([{delivery_id:'1',package_count:-1}]));await h.detail();assert.equal(h.get('cargo-retry').hidden,false);
 h.setCargo(()=>h.response({},500));await h.detail();assert.match(h.get('cargo-status').textContent,/No pudimos/);
 h.setCargo(()=>h.response([{delivery_id:'1',origin_text:'<img src=x>',cargo_description:null,package_count:null,gross_weight_kg:12.345,private_note:'PRIVATE'}]));await h.get('cargo-retry').onclick();const text=detailText(h.get('cargo-fields'));assert.match(text,/<img src=x>/);assert.match(text,/12,345 kg/);assert.match(text,/Sin cantidad registrada/);assert.doesNotMatch(text,/PRIVATE/);assert.equal(h.get('cargo-retry').hidden,true);
});
for(const action of ['close','logout','switch','filter','refresh'])test('late cargo cannot cross '+action,async()=>{
 for(const status of [200,500,401]){const h=harness(true);h.setRows([row('A'),row('B')]);await h.login();let release;h.setCargo(()=>new Promise(r=>release=r));const pending=h.detail();await tick();
 if(action==='close')h.get('close-detail').onclick();if(action==='logout')h.get('logout').onclick();if(action==='refresh')await h.refresh();if(action==='filter'){h.get('client-search').value='B';h.get('client-search').oninput();}
 if(action==='switch'){h.setCargo(()=>h.response([{delivery_id:'B',origin_text:'Origen B'}]));await h.get('deliveries').children[1].children.at(-1).onclick();}
 release(h.response([{delivery_id:'A',origin_text:'OLD A'}],status));await pending;assert.doesNotMatch(detailText(h.get('cargo-fields')),/OLD A/);if(action==='switch')assert.match(detailText(h.get('cargo-fields')),/Origen B/);else assert.equal(h.get('cargo-fields').children.length,0);
 }
});
test('current cargo auth error clears view',async()=>{const h=harness(true);h.setRows([row(1)]);h.setCargo(()=>h.response({},401));await h.login();await h.detail();assert.equal(h.get('client-workspace').hidden,true);assert.equal(h.get('cargo-fields').children.length,0);});
