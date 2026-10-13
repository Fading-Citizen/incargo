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
    const expired=await browser.newPage();
    await expired.route('https://mock.supabase.co/auth/v1/user',route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
    await expired.goto(base+'/activacion.html#access_token=synthetic-expired&type=invite');
    await expired.getByText('La invitación venció o no es válida.').waitFor({state:'visible'});
    assert.equal(await expired.locator('#activation-form').isHidden(),true);
    await expired.goto(base+'/activacion.html#error=access_denied&error_code=otp_expired');
    await expired.getByText('La invitación venció o no es válida.').waitFor({state:'visible'});
    await expired.waitForFunction(()=>location.hash==='');
    assert.equal(expired.url(),base+'/activacion.html');
    console.log('Activation flow passed: valid invite, token removal, password mismatch, server rejection/retry, expiry and link error.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
