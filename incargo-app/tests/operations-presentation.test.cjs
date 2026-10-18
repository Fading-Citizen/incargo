const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../logistica-1.0.0/incargo-operations-ui.js'),'utf8');
function fixture({error=false,loading=false}={}){
 const nodes=new Map(),observers=new Map();
 class Element{constructor(){this.value='';this.hidden=false;this.textContent='';this.dataset={};this.events={};this.attrs={};this.classes=new Set();this.classList={contains:k=>this.classes.has(k),toggle:(k,v)=>v?this.classes.add(k):this.classes.delete(k)};}addEventListener(k,fn){this.events[k]=fn;}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}focus(){this.focused=true;}querySelector(){return this.heading??=new Element();}}
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)};
 const cards=[['pending','Cliente A REM-001 puerta norte'],['in_transit','Cliente B REM-002 destino sur']].map(([status,search])=>Object.assign(new Element(),{dataset:{status,search}}));
 const loadingNode=loading?new Element():null;let loadError=false;
 if(loadingNode)Object.defineProperty(loadingNode,'className',{set(v){loadError=v.includes('load-error')}});
 get('ops-deliveries').querySelectorAll=()=>cards;
 get('ops-deliveries').querySelector=s=>s==='.loading-state'?(loading&&!loadError?loadingNode:null):s==='.load-error'?(loadError?loadingNode:null):null;
 if(error){get('notice').classes.add('error');get('notice').textContent='Fixture failure';}
 const nav=['delivery','trip','access'].map(name=>Object.assign(new Element(),{dataset:{panel:'ops-'+name+'-panel'}}));
 vm.runInNewContext(source,{document:{getElementById:get,querySelectorAll:s=>s==='[data-panel]'?nav:loading&&!loadError?[loadingNode]:[],querySelector:()=>null},MutationObserver:class{constructor(fn){this.fn=fn}observe(target){observers.set(target,this.fn)}}});
 return {get,cards,nav,loadingNode,fire:id=>observers.get(get(id))(),filter:()=>get('ops-search').events.input()};
}
test('filters intersect literal status and search, clear restores visible counts',()=>{const h=fixture();h.get('ops-search').value='PUERTA';h.filter();assert.deepEqual(h.cards.map(x=>x.hidden),[false,true]);assert.equal(h.get('ops-result-count').textContent,'1 de 2 entregas');h.get('ops-status').value='in_transit';h.filter();assert.equal(h.get('ops-no-matches').hidden,false);h.get('ops-clear-filters').events.click();assert(h.cards.every(x=>!x.hidden));assert.equal(h.get('ops-result-count').textContent,'2 de 2 entregas');assert(h.get('ops-search').focused);});
test('list replacement re-applies filters without network or changing records',()=>{const h=fixture();h.get('ops-status').value='pending';const original=JSON.stringify(h.cards.map(x=>x.dataset));h.fire('ops-deliveries');assert.deepEqual(h.cards.map(x=>x.hidden),[false,true]);assert.equal(JSON.stringify(h.cards.map(x=>x.dataset)),original);});
test('navigation exposes exactly its panel and moves focus to heading',()=>{const h=fixture();h.nav[1].events.click();assert.equal(h.get('ops-trip-panel').hidden,false);assert.equal(h.get('ops-delivery-panel').hidden,true);assert.equal(h.get('ops-access-panel').hidden,true);assert.equal(h.nav[1].attrs['aria-current'],'page');assert(h.get('ops-trip-panel').heading.focused);});
test('error already present at initialization replaces loading instead of false empty state',()=>{const h=fixture({error:true,loading:true});assert.match(h.loadingNode.textContent,/No pudimos cargar/);assert.equal(h.get('ops-result-count').textContent,'Carga pendiente');});
test('later error replaces loading and session status class does not loop',()=>{const h=fixture({loading:true});h.get('notice').textContent='Sesión activa en esta pestaña.';h.fire('notice');assert(h.get('notice').classes.has('session-notice'));h.get('notice').classes.add('error');h.get('notice').textContent='Fixture failure';h.fire('notice');assert.equal(h.get('notice').classes.has('session-notice'),false);assert.match(h.loadingNode.textContent,/No pudimos cargar/);});
