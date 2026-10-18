const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../logistica-1.0.0/incargo-app.js'),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(initialRole='operations'){
 const nodes=new Map(),timers=new Map(),calls=[],events=new Map();let seq=0,role=initialRole,mode='',release,listFail=false;
 class Element{constructor(){this.children=[];this.hidden=false;this.disabled=false;this.textContent='';this.value='';this.style={};this.elements={};}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}querySelector(){return this.button??=new Element();}querySelectorAll(){return [];}reset(){}setAttribute(){}removeAttribute(){}closest(){return this;}remove(){}focus(){}}
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const rows=['pending','pending','in_transit','exception','delivered'].map((status,i)=>({id:String(i),trip_id:'trip',customer_name:'Empresa '+i,remittance_reference:'REM-'+i,status}));
 const response=(value,status=200)=>({ok:status<400,status,json:async()=>value,text:async()=>JSON.stringify(value)});
 const sandbox={AbortController,Date,crypto:{randomUUID:()=>String(++seq)},setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
 document:{getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[]},
 IncargoSession:{create:()=>({clear(){},restore:async()=>({access_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'fixture'},scope:initialRole})})},
 fetch:async(url,options={})=>{calls.push({url,body:options.body});
  if(url==='/api/incargo-config')return response({url:'https://fixture.invalid',publishableKey:'fixture'});
  if(url.includes('incargo_memberships'))return response([{role}]);
  if(url.includes('/incargo_trips?'))return response([{id:'trip',route_label:'Ruta sintética',scheduled_date:'2026-10-18'}]);
  if(url.includes('/incargo_deliveries?')){if(listFail){listFail=false;throw Error('Fixture list failure');}return response(rows.map(r=>({...r})));}
  if(url.endsWith('/incargo_start_delivery')){
   if(mode==='missing'){mode='';return response({code:'PGRST202',message:'not found'},404);}
   if(mode==='before'){mode='';throw Error('Fixture offline');}
   if(mode==='exception'){mode='';return response({message:'departure requires pending delivery'},400);}
   const body=JSON.parse(options.body),row=rows.find(r=>r.id===body.p_delivery);const replay=events.has(body.p_request);
   if(!replay){events.set(body.p_request,body);row.status='in_transit';}
   const result=response({status:row.status,outcome:replay?'replayed':'started'});
   if(mode==='lost'){mode='';throw Error('Fixture response lost');}
   if(mode==='wait'){mode='';return new Promise(r=>release=()=>r(result));}
   return result;
  }
  return response([]);
 }};
 vm.runInNewContext(source,sandbox);
 const button=i=>get('ops-deliveries').children[i]?.children.find(e=>e.className==='departure-action');
 return {get,rows,events,calls,button,ready:tick,mode:v=>mode=v,role:v=>role=v,release:()=>release(),failList:()=>listFail=true,
 timeout:()=>{for(const [id,t] of timers){if(t.ms<=60000){timers.delete(id);t.fn();}}},rpc:()=>calls.filter(c=>c.url.endsWith('/incargo_start_delivery')).map(c=>JSON.parse(c.body))};
}
test('only operations sees a departure action, only pending rows offer it',async()=>{
 const h=fixture();await h.ready();assert(h.button(0));assert(h.button(1));for(const i of [2,3,4])assert.equal(h.button(i),undefined);
 const driver=fixture('driver');await driver.ready();assert.equal(driver.get('ops-deliveries').children.length,0);assert.equal(driver.rpc().length,0);
});
test('successful departure refreshes server status and removes action without changing another delivery',async()=>{
 const h=fixture();await h.ready();await h.button(0).onclick();assert.equal(h.events.size,1);assert.equal(h.button(0),undefined);assert(h.button(1));assert.equal(h.rows[1].status,'pending');assert.match(h.get('notice').textContent,/Salida registrada/);
});
test('double click and another departure while pending do not produce competing calls',async()=>{
 const h=fixture();await h.ready();const first=h.button(0),other=h.button(1);h.mode('wait');const pending=first.onclick();await tick();
 await first.onclick();await other.onclick();assert.equal(h.rpc().length,1);assert.equal(h.button(1).disabled,true);h.release();await pending;assert.equal(h.events.size,1);
});
for(const mode of ['lost','before'])test(mode+': retry preserves the request id and does not infer failure means rollback',async()=>{
 const h=fixture();await h.ready();h.mode(mode);await h.button(0).onclick();assert.match(h.button(0).textContent,/Verificar salida/);await h.button(0).onclick();assert.equal(h.events.size,1);assert.equal(new Set(h.rpc().map(r=>r.p_request)).size,1);
});
test('timeout and late response do not overwrite a later successful verification',async()=>{
 const h=fixture();await h.ready();h.mode('wait');const pending=h.button(0).onclick();await tick();h.timeout();await pending;await h.button(0).onclick();h.release();await tick();assert.equal(h.events.size,1);assert.match(h.get('notice').textContent,/Salida registrada/);
});
test('confirmed departure with failed refresh retries only the list',async()=>{
 const h=fixture();await h.ready();h.failList();await h.button(0).onclick();assert.match(h.button(0).textContent,/Actualizar estado/);const calls=h.rpc().length;await h.button(0).onclick();assert.equal(h.rpc().length,calls);assert.equal(h.events.size,1);
});
test('missing migration and server state rejection never display optimistic En ruta',async()=>{
 for(const mode of ['missing','exception']){const h=fixture();await h.ready();h.mode(mode);await h.button(0).onclick();assert.equal(h.events.size,0);assert.equal(h.rows[0].status,'pending');assert.doesNotMatch(h.get('notice').textContent,/Salida registrada/);assert(h.button(0));}
});
test('revocation before departure clears the workspace without issuing mutation',async()=>{
 const h=fixture();await h.ready();h.role('driver');await h.button(0).onclick();assert.equal(h.rpc().length,0);assert.equal(h.get('workspace').hidden,true);
});
test('logout while request is outstanding prevents late UI restoration and stale retry',async()=>{
 const h=fixture();await h.ready();const button=h.button(0);h.mode('wait');const pending=button.onclick();await tick();h.get('logout').onclick();h.release();await pending;await button.onclick();assert.equal(h.get('workspace').hidden,true);assert.equal(h.get('ops-deliveries').children.length,0);assert.equal(h.rpc().length,1);
});
