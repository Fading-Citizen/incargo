const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.env.INCARGO_TEST_ROOT||path.join(__dirname,'../../logistica-1.0.0');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const nodes=new Map(),timers=new Map(),listeners=new Map();let seq=0,uploadMode='',confirmMode='',releaseUpload,releaseConfirm,releaseList,role='driver',listFailure=false,listWait=false;
 class Element{
  constructor(){this.children=[];this.hidden=false;this.disabled=false;this.value='';this.style={};this.textContent='';this.elements={};}
  append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;this.textContent='';}
  querySelector(){return this.button??=new Element();}querySelectorAll(){return [...Object.values(this.elements),this.querySelector()];}
  setAttribute(){}removeAttribute(){}closest(){return this;}remove(){}focus(){}
  reset(){for(const field of Object.values(this.elements)){field.value='';if(field.files)field.files=[];}}
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const photo={name:'fixture.png',type:'image/png',size:8};
 get('confirm-form').elements={photo:{files:[photo],disabled:false},receiver:{value:'Receptor A',disabled:false},observation:{value:'Nota A',disabled:false}};
 get('issue-form').elements={note:{value:'Novedad A',disabled:false}};
 const files=new Map(),events=new Map(),proofs=[],calls=[];
 const deliveries=[{id:'A',trip_id:'T',customer_name:'Empresa A',destination_text:'Destino A',status:'pending'},{id:'B',trip_id:'T',customer_name:'Empresa B',destination_text:'Destino B',status:'pending'}];
 const response=(value,status=200)=>({ok:status<400,status,json:async()=>value,text:async()=>JSON.stringify(value)});
 const session={access_token:'synthetic-A',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'driver-A'},scope:'driver'};
 const sandbox={AbortController,Date,addEventListener:(name,fn)=>listeners.set(name,fn),crypto:{randomUUID:()=>`synthetic-${++seq}`},
  setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  document:{getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[]},
  IncargoSession:{create:()=>({restore:async()=>session,clear(){}})},
  fetch:async(url,options={})=>{
   calls.push({url,options});
   if(url==='/api/incargo-config')return response({url:'https://fixture.invalid',publishableKey:'fixture'});
   if(url.includes('incargo_memberships'))return response([{role}]);
   if(url.includes('/incargo_trips?'))return response([{id:'T',route_label:'Ruta de prueba',scheduled_date:'2026-10-17'}]);
   if(url.includes('/incargo_deliveries?')){if(listFailure){listFailure=false;throw Error('Fixture list unavailable');}if(listWait){listWait=false;return new Promise(r=>releaseList=()=>r(response(deliveries.map(d=>({...d})))));}return response(deliveries.map(d=>({...d})));}
   if(url.includes('/storage/v1/object/')){
    if(uploadMode==='before'){uploadMode='';throw Error('Fixture upload unavailable');}
    const key=url.split('/incargo-proofs/')[1];if(files.has(key))return response({message:'The resource already exists'},400);files.set(key,options.body);
    if(uploadMode==='lost'){uploadMode='';throw Error('Fixture upload response lost');}
    if(uploadMode==='wait'){uploadMode='';return new Promise(r=>releaseUpload=()=>r(response({Key:key})));}
    return response({Key:key});
   }
   if(url.endsWith('/incargo_confirm_delivery')){
    if(confirmMode==='forbidden'){confirmMode='';return response({message:'not authorized'},400);}
    const body=JSON.parse(options.body);const delivery=deliveries.find(d=>d.id===body.p_delivery);
    if(events.has(body.p_request))return response(null);
    if(delivery.status==='delivered')return response({message:'already delivered'},400);
    if(!files.has(body.p_object_path)||!body.p_object_path.startsWith(body.p_delivery+'/'))return response({message:'proof missing'},400);
    events.set(body.p_request,body);proofs.push(body);delivery.status='delivered';
    if(confirmMode==='lost'){confirmMode='';throw Error('Fixture confirmation response lost');}
    if(confirmMode==='wait'){confirmMode='';return new Promise(r=>releaseConfirm=()=>r(response(null)));}
    return response(null);
   }
   return response(null);
  }
 };
 const moduleFile=path.join(root,'incargo-confirmation.js');if(fs.existsSync(moduleFile))vm.runInNewContext(fs.readFileSync(moduleFile,'utf8'),sandbox);
 vm.runInNewContext(fs.readFileSync(path.join(root,'incargo-app.js'),'utf8'),sandbox);
 return {get,files,events,proofs,calls,deliveries,ready:tick,upload:v=>uploadMode=v,confirm:v=>confirmMode=v,
  select:i=>get('driver-deliveries').children[i].children.at(-1).onclick(),
  submit:()=>get('confirm-form').onsubmit({preventDefault(){},currentTarget:get('confirm-form')}),
  release:()=>releaseUpload(),releaseConfirm:()=>releaseConfirm(),role:v=>role=v,failList:()=>listFailure=true,
  waitList:()=>listWait=true,releaseList:()=>releaseList(),
  leave:()=>{let prevented=false;const event={preventDefault(){prevented=true;}};listeners.get('beforeunload')?.(event);return prevented;},
  timeout:()=>{for(const [id,t] of timers){if(t.ms<=120000){timers.delete(id);t.fn();}}},
  uploads:()=>calls.filter(x=>x.url.includes('/storage/v1/object/')).length,
  confirmations:()=>calls.filter(x=>x.url.endsWith('/incargo_confirm_delivery')).map(x=>JSON.parse(x.options.body))};
}
test('lost upload response retries the same attempt without another photo object',async()=>{
 const h=fixture();await h.ready();h.select(0);h.upload('lost');await h.submit();assert.equal(h.files.size,1);await h.submit();
 assert.equal(h.files.size,1);assert.equal(h.events.size,1);assert.equal(h.proofs.length,1);assert.equal(h.uploads(),1);
});
test('lost confirmation response retries the same request and succeeds without a second photo',async()=>{
 const h=fixture();await h.ready();h.select(0);h.confirm('lost');await h.submit();await h.submit();
 assert.equal(h.files.size,1);assert.equal(h.events.size,1);assert.equal(h.proofs.length,1);assert.equal(new Set(h.confirmations().map(x=>x.p_request)).size,1);
 assert.match(h.get('notice').textContent,/Entrega y soporte guardados/);
});
test('double submit while upload is pending creates one attempt and freezes delivery and text',async()=>{
 const h=fixture();await h.ready();h.select(0);h.upload('wait');const pending=h.submit();await tick();
 const repeated=h.submit();h.select(1);h.get('confirm-form').elements.observation.value='Edited B';h.release();await pending;await repeated;
 assert.equal(h.uploads(),1);assert.equal(h.proofs.length,1);assert.equal(h.proofs[0].p_delivery,'A');assert.equal(h.proofs[0].p_observation,'Nota A');
});
test('a failure before upload can retry with the same object path after proof-missing verification',async()=>{
 const h=fixture();await h.ready();h.select(0);h.upload('before');await h.submit();await h.submit();
 assert.equal(h.events.size,1);assert.equal(h.proofs.length,1);
 const paths=h.calls.filter(x=>x.url.includes('/storage/v1/object/')).map(x=>x.url);assert.equal(new Set(paths).size,1);
});
module.exports={fixture,tick};

for(const phase of ['upload','confirmation'])test(phase+': timeout permits safe verification; late response cannot create a second attempt',async()=>{
 const h=fixture();await h.ready();h.select(0);if(phase==='upload')h.upload('wait');else h.confirm('wait');
 const pending=h.submit();await tick();h.timeout();await pending;
 assert.equal(h.get('confirm-form').querySelector().disabled,false);assert.match(h.get('notice').textContent,/No pudimos verificar/);
 await h.submit();if(phase==='upload')h.release();else h.releaseConfirm();await tick();
 assert.equal(h.files.size,1);assert.equal(h.events.size,1);assert.equal(h.proofs.length,1);assert.equal(h.uploads(),1);assert.match(h.get('notice').textContent,/Entrega y soporte guardados/);
});
test('failed list refresh after commit only refreshes on retry, without repeating upload or confirmation',async()=>{
 const h=fixture();await h.ready();h.select(0);h.failList();await h.submit();assert.match(h.get('notice').textContent,/Entrega confirmada/);
 const requests=h.confirmations().length;await h.submit();assert.equal(h.confirmations().length,requests);assert.equal(h.uploads(),1);assert.match(h.get('notice').textContent,/Entrega y soporte guardados/);
});
test('authorization rejection never triggers another upload or claims success',async()=>{
 const h=fixture();await h.ready();h.select(0);h.upload('lost');await h.submit();h.confirm('forbidden');await h.submit();
 assert.equal(h.events.size,0);assert.equal(h.uploads(),1);assert.match(h.get('notice').textContent,/No pudimos verificar/);
});
test('logout during upload discards pending data and late result cannot confirm',async()=>{
 const h=fixture();await h.ready();h.select(0);h.upload('wait');const pending=h.submit();await tick();h.get('logout').onclick();h.release();await pending;
 assert.equal(h.confirmations().length,0);assert.equal(h.events.size,0);assert.equal(h.get('workspace').hidden,true);assert.equal(h.get('confirm-state').textContent,'');assert.equal(h.get('confirm-form').elements.receiver.value,'');
});
test('revoked driver membership clears the attempt before any retry mutation',async()=>{
 const h=fixture();await h.ready();h.select(0);h.upload('lost');await h.submit();h.role('operations');await h.submit();
 assert.equal(h.get('workspace').hidden,true);assert.equal(h.confirmations().length,0);assert.equal(h.uploads(),1);
});
test('pending attempt warns on reload and keeps original receiver/photo; success releases controls for another delivery',async()=>{
 const h=fixture();await h.ready();h.select(0);assert.equal(h.leave(),false);h.upload('lost');await h.submit();assert.equal(h.leave(),true);
 h.get('confirm-form').elements.receiver.value='Different receiver';h.get('confirm-form').elements.photo.files=[{name:'different.png',type:'image/png',size:20}];
 await h.submit();assert.equal(h.proofs[0].p_receiver,'Receptor A');assert.equal([...h.files.values()][0].name,'fixture.png');assert.equal(h.leave(),false);
 assert.equal(h.get('confirm-form').elements.receiver.disabled,false);
 const calls=h.calls.length;await h.submit();assert.equal(h.calls.length,calls);
 h.select(1);h.get('confirm-form').elements.receiver.value='Receptor B';h.get('confirm-form').elements.photo.files=[{name:'second.png',type:'image/png',size:8}];
 await h.submit();assert.equal(h.proofs.length,2);assert.equal(h.proofs[1].p_delivery,'B');assert.notEqual(h.proofs[0].p_request,h.proofs[1].p_request);
});
test('timeout after successful confirmation permits list-only retry and ignores the late list',async()=>{
 const h=fixture();await h.ready();h.select(0);h.waitList();const pending=h.submit();await tick();h.timeout();await pending;
 assert.match(h.get('notice').textContent,/Entrega confirmada/);assert.equal(h.get('confirm-form').querySelector().disabled,false);
 await h.submit();h.releaseList();await tick();assert.equal(h.uploads(),1);assert.equal(h.confirmations().length,1);assert.match(h.get('notice').textContent,/Entrega y soporte guardados/);
});
