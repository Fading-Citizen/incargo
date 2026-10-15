const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');

(async()=>{
  const root=path.resolve(__dirname,'../../logistica-1.0.0');
  const server=http.createServer((request,response)=>{
    if(request.url==='/api/incargo-config'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({url:'https://mock.supabase.co',publishableKey:'publishable-test-only'}));return;}
    const name=request.url==='/'?'index.html':request.url.slice(1);if(!['index.html','activacion.html','incargo-app.css','incargo-activation.js'].includes(name)){response.writeHead(404).end();return;}
    response.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'application/javascript':'text/html');fs.createReadStream(path.join(root,name)).pipe(response);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    let updates=0;
    await page.route('https://mock.supabase.co/auth/v1/user',route=>{
      if(route.request().method()==='PUT'){
        updates++;
        if(updates===1)return route.fulfill({status:422,contentType:'application/json',body:'{"message":"La contraseña no cumple los requisitos."}'});
      }
      return route.fulfill({status:200,contentType:'application/json',body:'{"id":"synthetic-user"}'});
    });
    const base='http://127.0.0.1:'+server.address().port;
    await page.goto(base+'/#access_token=synthetic-token&type=invite');
    await page.locator('#activation-form').waitFor({state:'visible'});
    assert.equal(page.url(),base+'/activacion.html');
    await page.locator('[name=password]').fill('twelve-characters-A');
    await page.locator('[name=confirmation]').fill('mismatch-password-A');
    await page.locator('#activation-form button').click();
    assert.equal(updates,0);
    await page.locator('[name=confirmation]').fill('twelve-characters-A');
    await page.locator('#activation-form button').click();
    await page.getByText('La contraseña no cumple los requisitos.').waitFor({state:'visible'});
    assert.equal(await page.locator('#activation-form').isVisible(),true);
    await page.locator('#activation-form button').click();
    await page.getByText('Contraseña establecida. Ya puedes ingresar a Incargo.').waitFor({state:'visible'});
    assert.equal(updates,2);
    await page.screenshot({path:'/tmp/incargo-activation-mobile.png',fullPage:true});
    const recovery=await browser.newPage();
    const verifiedTypes=[];
    await recovery.route('https://mock.supabase.co/auth/v1/verify',route=>{verifiedTypes.push(route.request().postDataJSON().type);return route.fulfill({status:200,contentType:'application/json',body:'{"access_token":"synthetic-verified"}'});});
    await recovery.route('https://mock.supabase.co/auth/v1/user',route=>route.fulfill({status:200,contentType:'application/json',body:'{"id":"synthetic-user"}'}));
    await recovery.goto(base+'/#access_token=synthetic-recovery&type=recovery');
    await recovery.getByText('Enlace de recuperación verificado.',{exact:false}).waitFor();
    assert.equal(recovery.url(),base+'/activacion.html');
    assert.equal(await recovery.locator('#activation-form').isVisible(),true);
    await recovery.goto(base+'/activacion.html#token_hash=synthetic-hash&type=recovery');
    await recovery.getByText('Enlace de recuperación verificado.',{exact:false}).waitFor();
    await recovery.screenshot({path:'/tmp/incargo-recovery-form.png',fullPage:true});
    await recovery.goto(base+'/activacion.html#token_hash=synthetic-invite-hash&type=invite');
    await recovery.getByText('Enlace de invitación verificado.',{exact:false}).waitFor();
    assert.deepEqual(verifiedTypes,['recovery','invite']);
    await recovery.locator('[name=password]').fill('twelve-characters-B');
    await recovery.locator('[name=confirmation]').fill('twelve-characters-B');
    await recovery.locator('#activation-form button').click();
    await recovery.getByText('Contraseña establecida. Ya puedes ingresar a Incargo.').waitFor();
    const expired=await browser.newPage();
    await expired.route('https://mock.supabase.co/auth/v1/user',route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
    await expired.goto(base+'/activacion.html#access_token=synthetic-expired&type=recovery');
    await expired.getByText('El enlace de recuperación venció o no es válido.').waitFor();
    assert.equal(await expired.locator('#activation-form').isHidden(),true);
    await expired.goto(base+'/activacion.html#error=access_denied&error_code=otp_expired&type=invite');
    await expired.getByText('El enlace de invitación venció o no es válido.').waitFor();
    assert.equal(expired.url(),base+'/activacion.html');
    await expired.goto(base+'/activacion.html#error=server_error&error_code=unexpected_failure&type=recovery');
    await expired.getByText('No se pudo verificar el enlace de recuperación. Inténtalo de nuevo más tarde.').waitFor();
    assert.equal(await expired.locator('#activation-help').isHidden(),true);
    await expired.goto(base+'/activacion.html#access_token=synthetic-token&type=signup');
    await expired.getByText('Abre el enlace completo de invitación o recuperación desde tu correo.').waitFor();
    await expired.goto(base+'/activacion.html#type=recovery');
    await expired.getByText('Abre el enlace completo de invitación o recuperación desde tu correo.').waitFor();
    const failed=await browser.newPage();
    await failed.route('https://mock.supabase.co/auth/v1/verify',route=>route.fulfill({status:403,contentType:'application/json',body:'{"code":"otp_expired"}'}));
    await failed.goto(base+'/activacion.html#token_hash=synthetic-expired&type=recovery');
    await failed.getByText('El enlace de recuperación venció o no es válido.').waitFor();
    await failed.unroute('https://mock.supabase.co/auth/v1/verify');
    await failed.route('https://mock.supabase.co/auth/v1/verify',route=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"internal service unavailable"}'}));
    await failed.goto(base+'/activacion.html#token_hash=synthetic-error&type=recovery');
    await failed.getByText('No se pudo verificar el enlace de recuperación. Inténtalo de nuevo más tarde.').waitFor();
    assert.equal(await failed.locator('#activation-help').isHidden(),true);
    const unavailable=await browser.newPage();
    await unavailable.route('**/api/incargo-config',route=>route.fulfill({status:503,body:'{}'}));
    await unavailable.goto(base+'/activacion.html#access_token=synthetic-token&type=recovery');
    await unavailable.getByText('El acceso no está configurado. Contacta a Incargo.').waitFor();
    assert.equal(await unavailable.locator('#activation-help').isHidden(),true);
    const offline=await browser.newPage();
    await offline.route('https://mock.supabase.co/auth/v1/user',route=>route.abort('failed'));
    await offline.goto(base+'/activacion.html#access_token=synthetic-token&type=recovery');
    await offline.getByText('No se pudo verificar el enlace de recuperación. Inténtalo de nuevo más tarde.').waitFor();
    assert.equal(await offline.locator('#activation-help').isHidden(),true);
    console.log('Activation flow passed: invite and recovery redirects, token/hash verification, password validation, expiry, invalid links, and service errors.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
