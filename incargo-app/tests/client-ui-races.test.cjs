const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'../../logistica-1.0.0');
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const row=(n,owner)=>({delivery_id:uuid(n),reference:`${owner}-${n}`,status:'pending',created_at:new Date(Date.UTC(2026,9,16,0,0,0)-n*1000).toISOString(),last_event_at:null});
const reply=(route,status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
(async()=>{
 const server=http.createServer((req,res)=>{if(req.url==='/api/incargo-config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({url:'https://mock.supabase.co',publishableKey:'fixture'}));return;}const file=req.url.slice(1);if(!['cliente.html','incargo-client.js','incargo-session.js','incargo-app.css'].includes(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');fs.createReadStream(path.join(root,file)).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();let email='a@example.invalid',identity=null,firstError=true,hold=null,holdDetail=null,requests=[];
  await page.route('https://mock.supabase.co/**',async route=>{
   const url=new URL(route.request().url()),name=url.pathname.split('/').at(-1),body=route.request().postDataJSON?.()||{};
   if(url.pathname==='/auth/v1/token')return reply(route,200,{access_token:email,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:email,email}});
   const owner=route.request().headers().authorization?.split(' ').at(-1)||email;
   if(url.pathname==='/auth/v1/user')return reply(route,200,{id:owner,email:owner});
   if(name==='incargo_client_identity')return reply(route,200,identity===null?[{account_id:owner,display_name:owner}]:identity);
   if(name==='incargo_client_my_deliveries'){
    requests.push({owner,body});
    if(owner==='a@example.invalid'&&firstError){firstError=false;return reply(route,500,{});}
    if(hold&&owner==='a@example.invalid'){const release=hold;hold=null;await release.promise;return reply(route,401,{});}
    if(owner==='b@example.invalid')return reply(route,200,[row(201,'B')]);
    return reply(route,200,body.p_before_id?[row(51,'A')]:Array.from({length:50},(_,i)=>row(i+1,'A')));
   }
   if(name==='incargo_client_delivery_milestones'){
    if(holdDetail&&body.p_delivery===uuid(1)){const release=holdDetail;holdDetail=null;await release.promise;return reply(route,200,[{event_type:'exception',occurred_at:'2026-10-16T00:00:00Z'}]);}
    return reply(route,200,[{event_type:'delivered',occurred_at:'2026-10-16T00:00:00Z'}]);
   }
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/cliente.html');
  async function login(as){email=as;await page.locator('#login-form [name=email]').fill(as);await page.locator('#login-form [name=password]').fill('fixture');await page.locator('#login-form button[type=submit]').click();await page.locator('#client-workspace').waitFor({state:'visible'});}
  await login('a@example.invalid');await page.getByText('Reintentar').waitFor();assert.equal(await page.locator('#deliveries article').count(),0);
  await page.getByText('Reintentar').click();await page.getByText('A-1',{exact:true}).waitFor();assert.equal(await page.locator('#deliveries article').count(),50);
  await page.getByText('Cargar m�s').click();await page.getByText('A-51',{exact:true}).waitFor();assert.equal(await page.locator('#deliveries article').count(),51);assert.equal(requests.at(-1).body.p_before_id,uuid(50));
  holdDetail={};holdDetail.promise=new Promise(resolve=>holdDetail.resolve=resolve);const releaseDetail=holdDetail.resolve;await page.locator('#deliveries article').first().getByText('Ver hitos').click();await page.locator('#deliveries article').nth(1).getByText('Ver hitos').click();await page.getByText(/Entregada �/).waitFor();releaseDetail();await page.waitForTimeout(50);assert.equal(await page.getByText(/Novedad �/).count(),0);
  hold={};hold.promise=new Promise(resolve=>hold.resolve=resolve);const releasePage=hold.resolve;await page.locator('#logout').click();await login('a@example.invalid');
  await page.locator('#logout').click();await login('b@example.invalid');await page.getByText('B-201',{exact:true}).waitFor();releasePage();await page.waitForTimeout(50);assert.equal(await page.getByText('B-201',{exact:true}).count(),1);
  identity=[{account_id:'different-account',display_name:'Different'}];await page.locator('#deliveries article').first().getByText('Ver hitos').click();await page.getByText(/acceso de cliente cambi�/).waitFor();assert.equal(await page.locator('#client-workspace').isHidden(),true);assert.equal(await page.locator('#deliveries article').count(),0);
  identity=null;await login('b@example.invalid');await page.getByText('B-201',{exact:true}).waitFor();identity=[];await page.locator('#deliveries article').first().getByText('Ver hitos').click();await page.getByText(/acceso de cliente cambi�/).waitFor();assert.equal(await page.locator('#deliveries article').count(),0);
  console.log('Client UI races passed: retry, 51 rows, cursor, detail selection, stale session, late 401, reassigned and revoked membership.');await page.close();
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

