const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const base=process.env.QA_BASE||'http://127.0.0.1:8750';
 fs.mkdirSync('/tmp/incargo-gallery-qa',{recursive:true});
 try {
  for(const width of [1440,390,320]) {
   const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
   await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   await page.goto(base+'/gallery.html');
   const slider=page.locator('[data-gallery-slider]');
   await slider.scrollIntoViewIfNeeded();
   const position=page.locator('[data-gallery-position]');
   assert.equal(await position.textContent(),'1 / 3');
   await page.getByRole('button',{name:'Imagen siguiente',exact:true}).click();
   assert.equal(await position.textContent(),'2 / 3');
   await page.getByRole('button',{name:'Imagen siguiente',exact:true}).click();
   assert.equal(await position.textContent(),'3 / 3');
   const image=page.locator('img[src="img/servicios/camion-remolque-noche.png"]');
   await image.evaluate(el=>el.decode());
   assert.equal(await image.evaluate(el=>el.naturalWidth),720);
   assert.equal(await image.evaluate(el=>getComputedStyle(el).objectFit),'contain');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await page.locator('.gallery-item').count(),11);
   await slider.screenshot({path:`/tmp/incargo-gallery-qa/slider-${width}.png`});
   await page.getByRole('button',{name:'Imagen siguiente',exact:true}).click();
   assert.equal(await position.textContent(),'1 / 3');
   await page.getByRole('button',{name:'Imagen anterior',exact:true}).click();
   assert.equal(await position.textContent(),'3 / 3');
   const track=page.locator('[data-gallery-track]');await track.focus();
   await page.keyboard.press('Home');assert.equal(await position.textContent(),'1 / 3');
   await page.keyboard.press('ArrowRight');assert.equal(await position.textContent(),'2 / 3');
   await page.keyboard.press('End');assert.equal(await position.textContent(),'3 / 3');
   await page.keyboard.press('ArrowLeft');assert.equal(await position.textContent(),'2 / 3');
   // Native swipe/scroll remains possible without changing page history.
   await track.evaluate(el=>{el.scrollLeft=el.clientWidth*2;el.dispatchEvent(new Event('scroll'));});
   assert.equal(await position.textContent(),'3 / 3');
   await page.close();
  }
  console.log('PASS gallery carousel desktop1440/mobile390/320, original11 entries, image decode/full contain, buttons/wrap/keyboard/scroll/no overflow');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
