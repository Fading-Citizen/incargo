const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../logistica-1.0.0');
const source=fs.readFileSync(path.join(root,'incargo-activation.js'),'utf8');
const html=fs.readFileSync(path.join(root,'activacion.html'),'utf8');
const redirect=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=(body={},status=200)=>({ok:status<400,status,json:async()=>body});
async function fixture(hash,hook=()=>null){
 const calls=[],nodes=new Map(),listeners={};
 const get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:'',className:'',elements:{password:{value:''},confirmation:{value:''}},button:{disabled:false},addEventListener(type,fn){this[type]=fn;},querySelector(){return this.button;},reset(){this.resets=(this.resets||0)+1;this.elements.password.value='';this.elements.confirmation.value='';}});return nodes.get(id);};
 const location={hash,search:'',pathname:'/activacion.html'};
 vm.runInNewContext(source,{URLSearchParams,location,history:{replaceState(_a,_b,url){location.pathname=url;location.hash='';location.search='';}},document:{getElementById:get,querySelector:()=>get('heading')},window:{addEventListener(type,fn){listeners[type]=fn;}},fetch:async(url,options={})=>{
  calls.push({url,options});const result=hook(url,options);if(result)return result;
  if(url==='/api/incargo-config')return response({url:'https://fixture.invalid',publishableKey:'fixture'});
  if(url==='https://fixture.invalid/auth/v1/verify')return response({access_token:'synthetic-verified'});
  if(url==='https://fixture.invalid/auth/v1/user')return response({id:'synthetic-user'});
  throw Error('Unexpected fixture request: '+url);
 }});
 await tick();return {get,calls,location,submit:async(password='twelve-characters-A',confirmation=password)=>{const form=get('activation-form');form.elements.password.value=password;form.elements.confirmation.value=confirmation;await form.submit({preventDefault(){}});},navigate:async hash=>{location.hash=hash;listeners.hashchange();await tick();}};
}
const status=h=>h.get('activation-status').textContent;
for(const type of ['invite','recovery','signup'])test(type+': root redirect preserves fragment then activation removes it',async()=>{
 const hash='#access_token=synthetic-token&type='+type;let target;
 vm.runInNewContext(redirect,{URLSearchParams,location:{hash,replace:url=>target=url}});
 assert.equal(target,'/activacion.html'+hash);
 const h=await fixture(hash);assert.equal(h.location.hash,'');assert.equal(h.location.pathname,'/activacion.html');
 assert.equal(h.get('activation-form').hidden,type==='signup');
 assert.match(status(h),type==='signup'?/Ya puedes ingresar a Mis envíos/:/verificado/);
 assert.equal(h.calls.at(-1).options.headers.Authorization,'Bearer synthetic-token');
});
test('password mismatch and short value make no update; 422 is retryable and success clears form',async()=>{
 let updates=0;const h=await fixture('#access_token=synthetic&type=invite',(_url,options)=>options.method==='PUT'&&++updates===1?response({message:'La contraseña no cumple los requisitos.'},422):null);
 await h.submit('twelve-characters-A','mismatch-password-A');await h.submit('short');assert.equal(updates,0);
 await h.submit();assert.equal(updates,1);assert.equal(status(h),'La contraseña no cumple los requisitos.');assert.equal(h.get('activation-form').hidden,false);assert.equal(h.get('activation-form').button.disabled,false);
 await h.submit();assert.equal(updates,2);assert.match(status(h),/Contraseña establecida/);assert.equal(h.get('activation-form').hidden,true);assert.equal(h.get('activation-form').resets,1);assert.equal(h.get('activation-form').button.disabled,false);
});
test('hash verification handles recovery, invite and signup with exact types and customer destination',async()=>{
 const h=await fixture('#token_hash=synthetic-recovery&type=recovery');assert.match(status(h),/recuperación verificado/);
 await h.navigate('#token_hash=synthetic-invite&type=invite');assert.match(status(h),/invitación verificado/);await h.submit();assert.match(status(h),/Contraseña establecida/);
 await h.navigate('#token_hash=synthetic-signup&type=signup');assert.match(status(h),/Ya puedes ingresar a Mis envíos/);assert.equal(h.get('activation-form').hidden,true);
 assert.deepEqual(h.calls.filter(c=>c.url.endsWith('/verify')).map(c=>JSON.parse(c.options.body)),[{type:'recovery',token_hash:'synthetic-recovery'},{type:'invite',token_hash:'synthetic-invite'},{type:'signup',token_hash:'synthetic-signup'}]);
 assert.match(html,/<a href="cliente.html">Ir a Mis envíos<\/a>/);
});
for(const type of ['recovery','signup'])test(type+': expired bearer hides form and explains invalid link',async()=>{
 const h=await fixture('#access_token=synthetic-expired&type='+type,url=>url.endsWith('/user')?response({},401):null);assert.match(status(h),/venció o no es válido/);assert.equal(h.get('activation-form').hidden,true);assert.equal(h.get('activation-help').hidden,false);
});
for(const [fragment,pattern,help] of [
 ['error=access_denied&error_code=otp_expired&type=invite',/invitación venció/,false],
 ['error=server_error&error_code=unexpected_failure&type=recovery',/No se pudo verificar el enlace de recuperación/,true],
 ['type=recovery',/Abre el enlace completo/,false]
])test('link error: '+fragment,async()=>{const h=await fixture('#'+fragment);assert.match(status(h),pattern);assert.equal(h.location.hash,'');assert.equal(h.calls.length,0);assert.equal(h.get('activation-form').hidden,true);assert.equal(h.get('activation-help').hidden,help);});
for(const [code,body,pattern,help] of [[403,{code:'otp_expired'},/recuperación venció/,false],[503,{message:'internal service unavailable'},/No se pudo verificar/,true]])test('hash verification response '+code,async()=>{
 const h=await fixture('#token_hash=synthetic&type=recovery',url=>url.endsWith('/verify')?response(body,code):null);assert.match(status(h),pattern);assert.equal(h.get('activation-form').hidden,true);assert.equal(h.get('activation-help').hidden,help);assert.equal(h.calls.some(c=>c.url.endsWith('/user')),false);
});
test('configuration outage hides form and does not request Auth',async()=>{const h=await fixture('#access_token=synthetic&type=recovery',url=>url==='/api/incargo-config'?response({},503):null);assert.match(status(h),/El acceso no está configurado/);assert.equal(h.calls.length,1);assert.equal(h.get('activation-form').hidden,true);assert.equal(h.get('activation-help').hidden,true);});
test('network failure is a service error, not an expired link',async()=>{const h=await fixture('#access_token=synthetic&type=recovery',url=>{if(url.endsWith('/user'))throw Error('fixture network failure');});assert.match(status(h),/No se pudo verificar el enlace de recuperación/);assert.equal(h.get('activation-form').hidden,true);assert.equal(h.get('activation-help').hidden,true);});
