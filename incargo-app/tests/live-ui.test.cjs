const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');

(async()=>{
  const root=path.resolve(__dirname,'../../logistica-1.0.0');
  const server=http.createServer((req,res)=>{
    if(req.url==='/api/incargo-config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({url:'https://mock.supabase.co',publishableKey:'publishable-test-only'}));return;}
    const filename=req.url.slice(1);if(!['operaciones.html','seguimiento.html','incargo-app.css','incargo-app.js','incargo-tracking.js'].includes(filename)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',filename.endsWith('.css')?'text/css':filename.endsWith('.js')?'application/javascript':'text/html');fs.createReadStream(path.join(root,filename)).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const trips=[],deliveries=[];
    await page.route('https://mock.supabase.co/**',async route=>{
      const url=new URL(route.request().url()),method=route.request().method();let result=[];
      if(url.pathname==='/auth/v1/token')result={access_token:'test-session',user:{id:route.request().postDataJSON().email.startsWith('ops')?'00000000-0000-4000-8000-000000000001':'00000000-0000-4000-8000-000000000002'}};
      else if(url.pathname.endsWith('incargo_memberships'))result=url.searchParams.get('select')==='role'?[{role:currentRole}]:[{user_id:'00000000-0000-4000-8000-000000000002'}];
      else if(url.pathname.endsWith('incargo_trips')){if(method==='POST')trips.push({id:'00000000-0000-4000-8000-000000000011',...route.request().postDataJSON()});result=trips;}
      else if(url.pathname.endsWith('incargo_deliveries')){if(method==='POST')deliveries.push({id:'00000000-0000-4000-8000-000000000021',status:'pending',...route.request().postDataJSON()});result=deliveries;}
      else if(url.pathname.endsWith('incargo_list_tracking_links'))result=[];
      else if(url.pathname.endsWith('incargo_create_tracking_link'))result='a'.repeat(64);
      else if(url.pathname.endsWith('incargo_record_issue')){deliveries[0].status='exception';result=null;}
      else if(url.pathname.endsWith('incargo_confirm_delivery')){deliveries[0].status='delivered';result=null;}
      else if(url.pathname.includes('/storage/v1/object/'))result={Key:'test'};
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
    });
    let currentRole='operations';
    const base='http://127.0.0.1:'+server.address().port;
    await page.goto(base+'/operaciones.html');
    assert.equal(await page.locator('#workspace').isHidden(),true);
    await page.locator('#login-form [name=email]').fill('ops@example.invalid');await page.locator('#login-form [name=password]').fill('fixture');await page.locator('#login-form button').click();
    await page.locator('#ops').waitFor({state:'visible'});
    await page.getByText('Todavía no hay viajes.').waitFor({state:'visible'});
    await page.locator('#trip-form [name=route]').fill('Ruta ficticia');await page.locator('#trip-form [name=date]').fill('2026-10-15');await page.locator('#trip-form [name=vehicle]').fill('DEM123');await page.locator('#trip-form button').click();
    assert.equal(trips.length,1);
    await page.locator('#delivery-form [name=customer]').fill('Cliente Ficticio');await page.locator('#delivery-form button').click();assert.equal(deliveries.length,1);
    await page.getByRole('button',{name:'Crear enlace limitado'}).click();await page.getByText(/seguimiento.html#token=/).waitFor({state:'visible'});
    await page.screenshot({path:'/tmp/incargo-live-ops-mobile.png',fullPage:true});
    await page.locator('#logout').click();currentRole='driver';await page.locator('#login-form [name=email]').fill('driver@example.invalid');await page.locator('#login-form [name=password]').fill('fixture');await page.locator('#login-form button').click();
    await page.locator('#driver').waitFor({state:'visible'});
    await page.getByRole('button',{name:'Seleccionar'}).click();await page.locator('#issue-form [name=note]').fill('Novedad ficticia');await page.locator('#issue-form button').click();
    assert.equal(deliveries[0].status,'exception');
    await page.locator('#confirm-form [name=receiver]').fill('Receptor Ficticio');
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=8;c.height=8;return c.toDataURL('image/png').split(',')[1]});
    await page.locator('#confirm-form [name=photo]').setInputFiles({name:'ficticio.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.locator('#confirm-form button').click();await page.getByText('Entrega y soporte guardados.').waitFor({state:'visible'});assert.equal(deliveries[0].status,'delivered');
    await page.setViewportSize({width:1280,height:800});await page.screenshot({path:'/tmp/incargo-live-driver-desktop.png',fullPage:true});
    const client=await browser.newPage({viewport:{width:390,height:844}});
    await client.route('https://gmjsqboyuvierfwruspv.supabase.co/functions/v1/incargo-tracking',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({customer_name:'Cliente Ficticio',invoice_reference:'FAC-DEMO',status:'delivered',events:[{type:'delivered',at:'2026-10-15T12:00:00Z'}],support_url:null})}));
    await client.goto(base+'/seguimiento.html#token='+'a'.repeat(64));await client.getByText('Cliente Ficticio').waitFor({state:'visible'});assert.match(await client.locator('#result').textContent(),/FAC-DEMO/);
    await client.screenshot({path:'/tmp/incargo-live-client-mobile.png',fullPage:true});await client.close();
    console.log('Connected UI mock passed: role gate, empty state, trip, delivery, link, issue, proof confirmation, mobile and desktop.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
