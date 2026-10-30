const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
(async()=>{
 const root=path.resolve(__dirname,'../../logistica-1.0.0');
 const server=http.createServer((req,res)=>{if(req.url==='/api/incargo-config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({url:'https://mock.supabase.co',publishableKey:'test-only'}));return;}const filename=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!filename.startsWith(root+'/')||!fs.existsSync(filename)||fs.statSync(filename).isDirectory()){res.writeHead(404).end();return;}res.setHeader('Content-Type',filename.endsWith('.css')?'text/css':filename.endsWith('.js')?'application/javascript':filename.endsWith('.png')?'image/png':'text/html');fs.createReadStream(filename).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 let role='operations',fail=false;
 const trips=[{id:'t1',route_label:'Bogotá → Medellín',scheduled_date:'2026-10-30',vehicle_plate:'TEST01',driver_user_id:'driver-test'},{id:'t2',route_label:'Cali → Bogotá',scheduled_date:'2026-10-31',vehicle_plate:'TEST02',driver_user_id:null}];
 const deliveries=[{id:'d1',trip_id:'t1',customer_name:'Empresa de prueba Norte',status:'pending',destination_text:'Medellín',origin_text:'Bogotá',remittance_reference:'TEST-001',cargo_description:'Carga de prueba'},{id:'d2',trip_id:'t2',customer_name:'Empresa de prueba Sur',status:'exception',destination_text:'Bogotá',invoice_reference:'FAC-TEST'},{id:'d3',trip_id:'t1',customer_name:'Empresa de prueba Norte',status:'delivered',destination_text:'Medellín'}];
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();if(url.hostname!=='mock.supabase.co')throw Error('Unexpected external request '+url.hostname);let result=[];const method=route.request().method();if(method!=='GET')writes.push(url.pathname);
 if(url.pathname==='/auth/v1/token')result={access_token:'test-only',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'test-user',email:'test@example.invalid'}};
 else if(url.pathname==='/auth/v1/user')result={id:'test-user',email:'test@example.invalid'};
 else if(url.pathname.endsWith('incargo_memberships'))result=url.searchParams.has('user_id')?[{role}]:[{user_id:'driver-test'}];
 else if(url.pathname.endsWith('incargo_trips')){if(fail)return route.fulfill({status:503,body:'{}',contentType:'application/json'});result=trips;}
 else if(url.pathname.endsWith('incargo_deliveries'))result=deliveries;
 else if(url.pathname.endsWith('incargo_start_delivery')){deliveries.find(d=>d.id===route.request().postDataJSON().p_delivery).status='in_transit';result={status:'in_transit',outcome:'started'};}
 else if(url.pathname.endsWith('incargo_client_admin_accounts'))result=[{account_id:'account-test',display_name:'Cuenta de prueba'}];
 else if(url.pathname.endsWith('incargo_pending_client_access_requests'))result=[];
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 const base='http://127.0.0.1:'+server.address().port;
 await page.goto(base+'/operaciones.html');assert(await page.locator('#workspace').isHidden());
 async function login(){await page.locator('#login-form [name=email]').fill('test@example.invalid');await page.locator('#login-form [name=password]').fill('fixture');await page.locator('#login-form button').click();await page.getByText('Sesión activa en esta pestaña.',{exact:true}).waitFor();}
 await login();await page.locator('[data-panel=ops-dashboard-panel]').click();await page.getByRole('heading',{name:'Cada envío, bajo control.'}).waitFor();assert.equal(await page.locator('.inc-metric-pending strong').textContent(),'1');assert.equal(await page.locator('.inc-metric-delivered strong').textContent(),'1');assert.equal(await page.locator('.inc-metric-exception strong').textContent(),'1');
 await page.screenshot({path:'/tmp/incargo-panel-desktop.png',fullPage:true});
 // Reused panel navigates to the actual form/action, and counts follow server responses.
 await page.locator('.inc-metric-pending').click();assert(await page.locator('#ops-delivery-panel').isVisible());assert.equal(await page.locator('#ops-status').inputValue(),'pending');await page.getByRole('button',{name:/Marcar En ruta/}).click();await page.getByText('Salida registrada. Estado de las entregas actualizado.',{exact:true}).waitFor();
 await page.locator('[data-panel=ops-dashboard-panel]').click();assert.equal(await page.locator('.inc-metric-in_transit strong').textContent(),'1');assert.equal(await page.locator('.inc-metric-pending strong').textContent(),'0');
 await page.getByRole('button',{name:'Clientes',exact:true}).click();assert.equal(await page.locator('.inc-company-grid article').count(),2);await page.getByRole('searchbox').filter({visible:true}).fill('Sur');assert.equal(await page.locator('.inc-company-grid article').count(),1);
 await page.getByRole('button',{name:'Documentos',exact:true}).click();await page.getByRole('button',{name:'Ver entrega',exact:true}).first().click();assert(await page.locator('#ops-delivery-panel').isVisible());assert(await page.locator('[data-delivery-id=d1] details').getAttribute('open')!==null);
 await page.locator('[data-panel=ops-dashboard-panel]').click();await page.getByRole('button',{name:'Resumen',exact:true}).click();fail=true;await page.locator('#ops-refresh').click();await page.getByText(/No pudimos actualizar el tablero/).waitFor();assert.equal(await page.locator('.inc-metric').count(),0);fail=false;await page.locator('#ops-refresh').click();await page.locator('.inc-metric').first().waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/incargo-panel-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Documentos',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/incargo-panel-documents-mobile.png',fullPage:true});
 await page.locator('#logout').click();assert.equal(await page.locator('.inc-metric').count(),0);assert.equal(await page.locator('#incargo-panel-root').textContent(),'');role='driver';await login();assert(await page.locator('#ops').isHidden());assert(await page.locator('#driver').isVisible());assert.equal(await page.locator('#incargo-panel-root').textContent(),'');assert.equal(writes.filter(p=>p.endsWith('incargo_start_delivery')).length,1);assert.deepEqual(errors,[]);
 console.log('PASS: real-page panel integration, server-derived counts, status action, customer filtering, document deep navigation, refresh failure/recovery, mobile overflow, logout and driver isolation; no production writes.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
