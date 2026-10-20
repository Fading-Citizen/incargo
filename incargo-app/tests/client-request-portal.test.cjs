const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../logistica-1.0.0/incargo-request-access.js'),'utf8');const tick=()=>new Promise(r=>setImmediate(r));
function fixture(enabled=true){const nodes=new Map(),calls=[],timers=[];let hook=null,rows=[];const get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,disabled:false,textContent:'',reset(){this.resets=(this.resets||0)+1;},querySelector(){return this.button??={disabled:false};}});return nodes.get(id);};
const response=(value,status=200)=>({ok:status<400,status,json:async()=>value});const data={email:'fixture@example.invalid',password:'synthetic',company:'PRUEBA A'};
const context={IncargoAccessRequests:{enabled},document:{getElementById:get},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},FormData:class{get(key){return data[key];}},fetch:async(url,options={})=>{calls.push({url,options});if(hook){const result=hook(url,options);if(result)return result;}if(url==='/api/incargo-config')return response({url:'https://fixture.invalid',publishableKey:'fixture'});if(url.includes('/auth/v1/token'))return response({access_token:'synthetic',expires_at:Date.now()/1000+60});if(url.endsWith('incargo_my_client_access_request'))return response(rows);if(url.endsWith('incargo_request_client_access')){rows=[{status:'pending'}];return response('pending');}throw Error('unexpected');}};
vm.runInNewContext(source,context);return {get,calls,data,timers,response,hook:fn=>hook=fn,rows:r=>rows=r,login:()=>get('request-login').onsubmit({preventDefault(){},currentTarget:get('request-login')}),submit:()=>get('request-form').onsubmit({preventDefault(){},currentTarget:get('request-form')})};}
test('disabled portal never contacts Auth or request RPC',()=>{const h=fixture(false);assert.equal(h.calls.length,0);assert.equal(h.get('request-login').onsubmit,undefined);});
test('explicit submit sends only company, status is pending, approved state hides form',async()=>{const h=fixture();await h.login();assert.match(h.get('request-notice').textContent,/Todavía no/);await h.submit();const sent=h.calls.find(c=>c.url.endsWith('incargo_request_client_access'));assert.deepEqual(JSON.parse(sent.options.body),{p_company:'PRUEBA A'});assert.match(h.get('request-notice').textContent,/pendiente/);h.rows([{status:'approved'}]);await h.get('request-refresh').onclick();assert.equal(h.get('request-form').hidden,true);});
test('double submit makes one request and errors leave status consultation available',async()=>{const h=fixture();await h.login();let release;h.hook(url=>url.endsWith('incargo_request_client_access')?new Promise(r=>release=r):null);const first=h.submit();await tick();await h.submit();assert.equal(h.calls.filter(c=>c.url.endsWith('incargo_request_client_access')).length,1);release(h.response({},500));await first;assert.match(h.get('request-notice').textContent,/No pudimos confirmar/);assert.equal(h.get('request-form').querySelector('button').disabled,false);});
test('late submit after logout cannot restore request state and next login controls work',async()=>{const h=fixture();await h.login();let release;h.hook(url=>url.endsWith('incargo_request_client_access')?new Promise(r=>release=r):null);const pending=h.submit();await tick();h.get('request-logout').onclick();release(h.response('pending'));await pending;assert.equal(h.get('request-workspace').hidden,true);assert.equal(h.get('request-form').querySelector('button').disabled,false);h.hook(null);await h.login();assert.equal(h.get('request-workspace').hidden,false);});
test('latest refresh wins; expiry clears workspace',async()=>{const h=fixture();await h.login();let release;h.hook(url=>url.endsWith('incargo_my_client_access_request')?new Promise(r=>release=r):null);const pending=h.get('request-refresh').onclick();await tick();h.hook(null);h.rows([{status:'approved'}]);await h.get('request-refresh').onclick();release(h.response([{status:'pending'}]));await pending;assert.match(h.get('request-notice').textContent,/aprobada/);h.timers.at(-1)();assert.equal(h.get('request-workspace').hidden,true);});

test('invalid configuration never sends credentials and login retry recovers without reload',async()=>{
 for(const config of [{},{url:'https://fixture.invalid'},{url:42,publishableKey:'fixture'}]){
  const h=fixture();h.hook(url=>url==='/api/incargo-config'?h.response(config):null);
  await h.login();
  assert.equal(h.calls.filter(c=>c.url.includes('/auth/v1/token')).length,0);
  assert.equal(h.get('request-login').hidden,false);
  assert.equal(h.get('request-login').querySelector('button').disabled,false);
  h.hook(null);await h.login();
  assert.equal(h.calls.filter(c=>c.url==='/api/incargo-config').length,2);
  assert.equal(h.get('request-workspace').hidden,false);
  await h.submit();assert.match(h.get('request-notice').textContent,/pendiente/);
 }
});
