const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../../logistica-1.0.0');
const source=Object.fromEntries(['incargo-session.js','incargo-client.js','incargo-app.js'].map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]));
const tick=()=>new Promise(r=>setImmediate(r));
function harness(context,{storage=new Map(),clock={now:1800000000000},user='A',cargoEnabled=false,formValues={}}={}){
 const nodes=new Map(),timers=new Map();let timerId=0,focused=null;
 class Element{constructor(){this.children=[];this.hidden=false;this.disabled=false;this.textContent='';this.value='';this.style={};this.elements={email:{value:''}};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}querySelector(){return this.button??=new Element();}reset(){this.resets=(this.resets||0)+1;}setAttribute(name,value){(this.attributes??={})[name]=value;}removeAttribute(){}focus(){focused=this;}closest(){return this;}remove(){}}
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 get('workspace').hidden=get('client-workspace').hidden=get('profile').hidden=true;
 let identity=[{account_id:'account-A',display_name:'Company A'}],role='operations',hook=null,authUser=user;
 const calls=[],response=(value,status=200)=>({ok:status<400,status,json:async()=>value,text:async()=>JSON.stringify(value)});
 const sandbox={Date:class extends Date{constructor(...a){super(...(a.length?a:[clock.now]));}static now(){return clock.now;}},
 setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,at:clock.now+delay});return id;},clearTimeout:id=>timers.delete(id),
 sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 document:{getElementById:get,querySelector:()=>get('tabs'),querySelectorAll:()=>[],createElement:()=>new Element()},
 FormData:class{get(n){return n==='email'?'fixture@example.invalid':n==='password'?'fixture':formValues[n]??null;}*[Symbol.iterator](){yield*Object.entries(formValues);}},location:{origin:'https://example.invalid'},
 fetch:async(url,options={})=>{calls.push(url);if(hook){const r=hook(url,options);if(r)return r;}
  if(url==='/api/incargo-config')return response({url:'https://fixture.invalid',publishableKey:'fixture'});
  if(url.includes('/auth/v1/token'))return response({access_token:'synthetic-'+authUser,refresh_token:'NEVER-STORE',expires_at:1800000060,user:{id:authUser}});
  if(url.endsWith('/auth/v1/user'))return response({id:authUser,email:'fixture@example.invalid'});
  if(url.endsWith('/incargo_client_identity'))return response(identity);
  if(url.includes('incargo_memberships?select=role'))return response(role?[{role}]:[]);
  if(url.endsWith('/incargo_client_my_deliveries'))return response([{delivery_id:'fixture',reference:'PRUEBA',status:'pending',created_at:'2026-10-16'}]);
  return response([]);
 }};
 sandbox.IncargoCargo={...require('../../logistica-1.0.0/incargo-cargo.js'),enabled:cargoEnabled};
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

const visibleText=element=>[element.textContent,...element.children.map(visibleText)].join(' ');
const deliveryRows=[
 {id:'delivery-A',trip_id:'trip-A',customer_name:'Empresa A',invoice_reference:'FACT-A',remittance_reference:'REM-A',destination_text:'Destino norte <img src=x>',status:'pending'},
 {id:'delivery-B',trip_id:'trip-B',customer_name:'Empresa B',invoice_reference:null,remittance_reference:null,destination_text:null,status:'exception'}
];
function withDeliveries(h,rows=deliveryRows){h.hook(url=>{
 if(url.includes('/incargo_trips?'))return h.response([{id:'trip-A',route_label:'Ruta norte',scheduled_date:'2026-10-17'}]);
 if(url.includes('/incargo_deliveries?'))return h.response(rows);
 return null;
});}
for(const role of ['operations','driver'])test(role+': authorized delivery cards show destination, remittance, trip and explicit missing fields',async()=>{
 const h=harness('operations');h.role(role);withDeliveries(h);await h.login();
 const area=h.get(role==='operations'?'ops-deliveries':'driver-deliveries');
 assert.match(visibleText(area.children[0]),/Destino norte <img src=x>/);
 assert.match(visibleText(area.children[0]),/REM-A/);assert.match(visibleText(area.children[0]),/Ruta norte/);
 assert.match(visibleText(area.children[1]),/Sin destino registrado/);assert.match(visibleText(area.children[1]),/Sin remesa/);assert.match(visibleText(area.children[1]),/Viaje: No disponible/);
 h.logout();assert.equal(area.children.length,0);
 h.user('B');withDeliveries(h,[deliveryRows[1]]);await h.login();assert.doesNotMatch(visibleText(area),/Destino norte|REM-A/);
});
test('driver searches remittance/destination and repeated selection replaces details without mixing deliveries',async()=>{
 const h=harness('operations');h.role('driver');withDeliveries(h);await h.login();
 for(const query of ['rem-a','DESTINO NORTE']){h.get('search').value=query;h.get('search').oninput();assert.equal(h.get('driver-deliveries').children.length,1);assert.match(visibleText(h.get('driver-deliveries')),/Empresa A/);}
 h.get('search').value='';h.get('search').oninput();
 for(let i=0;i<2;i++)h.get('driver-deliveries').children[0].children.at(-1).onclick();
 assert.equal(h.get('selected').children.length,2);assert.match(visibleText(h.get('selected')),/Destino norte/);
 h.get('driver-deliveries').children[1].children.at(-1).onclick();assert.doesNotMatch(visibleText(h.get('selected')),/Destino norte|REM-A/);
 assert.match(visibleText(h.get('selected')),/Empresa B/);
 h.get('search').value='not-found';h.get('search').oninput();assert.match(visibleText(h.get('driver-deliveries')),/No hay coincidencias/);
});
test('driver restored session reloads authorized destinations; failed initial fetch does not invent data',async()=>{
 const h=harness('operations');h.role('driver');withDeliveries(h);await h.login();
 const restored=harness('operations',{storage:h.storage});restored.role('driver');withDeliveries(restored,[deliveryRows[1]]);await restored.ready();
 assert.doesNotMatch(visibleText(restored.get('driver-deliveries')),/Destino norte/);assert.match(visibleText(restored.get('driver-deliveries')),/Empresa B/);
 const failed=harness('operations');failed.role('driver');failed.hook(url=>url.includes('/incargo_deliveries?')?Promise.reject(Error('Fixture network failure')):null);await failed.login();
 assert.equal(failed.get('driver-deliveries').children.length,0);assert.match(failed.get('notice').textContent,/Fixture network failure/);
});

for(const outcome of [200,401,'network'])test('driver: late initial '+outcome+' cannot replace a subsequent driver session',async()=>{
 const h=harness('operations');h.role('driver');let release,reject;
 h.hook(url=>url.includes('/incargo_deliveries?')?new Promise((resolve,fail)=>{release=resolve;reject=fail;}):null);
 const pending=h.login();await tick();await tick();assert.equal(typeof release,'function');
 h.logout();h.user('B');withDeliveries(h,[deliveryRows[1]]);await h.login();
 const notice=h.get('notice').textContent;
 if(outcome==='network')reject(Error('Previous driver request failed'));
 else release(h.response([deliveryRows[0]],outcome));
 await pending;
 assert.equal(h.workspace().hidden,false);assert.equal(JSON.parse([...h.storage.values()][0]).user_id,'B');
 assert.match(visibleText(h.get('driver-deliveries')),/Empresa B/);
 assert.doesNotMatch(visibleText(h.get('driver-deliveries')),/Empresa A|Destino norte|REM-A/);
 assert.equal(h.get('selected').children.length,0);assert.equal(h.get('notice').textContent,notice);
});

test('driver: an empty assignment after reload is explicit and offers no delivery action',async()=>{
 const h=harness('operations');h.role('driver');withDeliveries(h);await h.login();
 h.get('driver-deliveries').children[0].children.at(-1).onclick();
 const restored=harness('operations',{storage:h.storage});restored.role('driver');await restored.ready();
 assert.equal(restored.workspace().hidden,false);
 assert.match(visibleText(restored.get('driver-trips')),/No tienes viajes asignados/);
 assert.match(visibleText(restored.get('driver-deliveries')),/No tienes entregas asignadas/);
 assert.doesNotMatch(visibleText(restored.get('driver-deliveries')),/Empresa A|Empresa B|REM-A/);
 assert.equal(restored.get('selected').children.length,0);
 assert.equal(restored.get('issue-form').hidden,true);assert.equal(restored.get('confirm-form').hidden,true);
 for(const query of ['REM-A','']){restored.get('search').value=query;restored.get('search').oninput();assert.match(visibleText(restored.get('driver-deliveries')),/No tienes entregas asignadas/);}
 assert(!restored.calls.some(url=>/incargo_confirm_delivery|incargo_report_issue|storage\/v1\/object/.test(url)));
});
test('operations cargo creation validates, preserves failed draft and sends one concurrent INSERT',async()=>{
 const values={customer:'PRUEBA',trip:'fixture-trip',origin_text:' Origen A ',cargo_description:'Cajas',package_count:'2',gross_weight_kg:'12.345'};
 const h=harness('operations',{cargoEnabled:true,formValues:values});await h.login();assert.equal(h.get('cargo-inputs').disabled,false);
 let release,sent=[];h.hook((url,opts)=>{if(url.endsWith('/incargo_deliveries')&&opts.method==='POST'){sent.push(JSON.parse(opts.body));return new Promise(r=>release=r);}});
 const form=h.get('delivery-form'),baseline=form.resets||0,submit=()=>form.onsubmit({preventDefault(){},currentTarget:form});
 const pending=submit();await tick();await submit();assert.equal(sent.length,1);assert.equal(sent[0].origin_text,'Origen A');assert.equal(sent[0].package_count,2);assert.equal(sent[0].gross_weight_kg,12.345);
 release(h.response({message:'Fixture failure'},500));await pending;assert.equal(form.resets||0,baseline);assert.equal(form.querySelector('button').disabled,false);assert.match(h.get('notice').textContent,/Fixture failure/);
 values.package_count='0';await submit();assert.equal(sent.length,1);assert.match(h.get('notice').textContent,/entero positivo/);
 h.logout();assert.equal(form.resets,baseline+1);
});
test('operations cargo null payload and reloaded display do not invent quantities',async()=>{
 const h=harness('operations',{cargoEnabled:true,formValues:{customer:'PRUEBA',trip:'fixture-trip'}});await h.login();let body;
 h.hook((url,opts)=>{if(url.endsWith('/incargo_deliveries')&&opts.method==='POST'){body=JSON.parse(opts.body);return h.response(null);}if(url.includes('/incargo_deliveries?'))return h.response([{id:'fixture',trip_id:'fixture-trip',customer_name:'PRUEBA',status:'pending',origin_text:null,cargo_description:null,package_count:null,gross_weight_kg:null}]);});
 const form=h.get('delivery-form'),baseline=form.resets||0;await form.onsubmit({preventDefault(){},currentTarget:form});for(const key of ['origin_text','cargo_description','package_count','gross_weight_kg'])assert.equal(body[key],null);assert.equal(form.resets,baseline+1);assert.equal(h.get('ops-deliveries').children.length,1);
 const text=n=>[n.textContent,...n.children.map(text)].join(' ');assert.match(text(h.get('ops-deliveries')),/Sin origen registrado.*Sin descripción registrada.*Sin cantidad registrada.*Sin peso registrado/);
});
