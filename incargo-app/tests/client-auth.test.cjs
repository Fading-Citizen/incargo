const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'../../logistica-1.0.0');
 const server=http.createServer((req,res)=>{if(req.url==='/api/incargo-config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({url:'https://mock.supabase.co',publishableKey:'fixture'}));return;}const name=req.url.slice(1);if(!['cliente.html','incargo-client.js','incargo-session.js','incargo-app.css'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');fs.createReadStream(path.join(root,name)).pipe(res)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});let signups=0,recovers=0,failSignup=false,holdLogin;
   await page.route('https://mock.supabase.co/**',async route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/signup')){signups++;assert.equal(url.searchParams.get('redirect_to'),'http://127.0.0.1:'+server.address().port+'/activacion.html');return route.fulfill({status:failSignup?429:200,contentType:'application/json',body:'{}'});}if(url.pathname.endsWith('/recover')){recovers++;return route.fulfill({status:200,contentType:'application/json',body:'{}'});}if(url.pathname.endsWith('/token')){if(holdLogin)await holdLogin;return route.fulfill({status:400,contentType:'application/json',body:'{}'});}return route.fulfill({status:200,contentType:'application/json',body:'[]'});});
   await page.goto('http://127.0.0.1:'+server.address().port+'/cliente.html');await page.screenshot({path:'/tmp/incargo-client-auth-'+width+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.getByRole('button',{name:'Crear cuenta',exact:true}).first().click();await page.screenshot({path:'/tmp/incargo-client-register-'+width+'.png',fullPage:true});await page.locator('#register-email').fill('cliente@example.invalid');await page.locator('#register-password').fill('valid-password-A');await page.locator('#register-confirm').fill('different-password');await page.locator('#register-form button[type=submit]').click();await page.getByText(/coincidir en ambos campos/).waitFor();assert.equal(signups,0);
   await page.locator('#register-confirm').fill('valid-password-A');await page.locator('#register-form button[type=submit]').click();await page.getByText(/Revisa tu correo para verificar la cuenta/).waitFor();assert.equal(signups,1);
   failSignup=true;await page.locator('#register-email').fill('cliente@example.invalid');await page.locator('#register-password').fill('valid-password-A');await page.locator('#register-confirm').fill('valid-password-A');await page.locator('#register-form button[type=submit]').click();await page.getByText(/Demasiados intentos/).waitFor();assert.equal(signups,2);
   await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.locator('#client-email').fill('cliente@example.invalid');await page.locator('#forgot-link').click();assert.equal(await page.locator('#recovery-email').inputValue(),'cliente@example.invalid');await page.locator('#recovery-form button[type=submit]').click();await page.getByText(/Si existe una cuenta/).waitFor();assert.equal(recovers,1);
   await page.locator('#back-to-login').click();await page.locator('#client-password').fill('fixture');let release;holdLogin=new Promise(r=>release=r);await page.locator('#login-form button[type=submit]').click();await page.getByText('Comprobando tu acceso.').waitFor();await page.locator('#forgot-link').click();release();await page.waitForTimeout(50);assert.equal(await page.locator('#recovery-form').isVisible(),true);assert.equal(await page.locator('#client-workspace').isHidden(),true);
   await page.close();
  }
  console.log('Client auth passed: registration, validation, rate limit, recovery, interrupted login, mobile and desktop.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

