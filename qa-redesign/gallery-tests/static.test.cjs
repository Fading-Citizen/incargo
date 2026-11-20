const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '../../logistica-1.0.0');
const html = fs.readFileSync(path.join(root,'gallery.html'),'utf8');
test('new gallery slider has three described slides without replacing original 11 entries',()=>{
 assert.equal((html.match(/class="inc-gallery-slide"/g)||[]).length,3);
 assert.equal((html.match(/class="gallery-item"/g)||[]).length,11);
 assert.match(html,/data-gallery-prev aria-label="Imagen anterior"/);
 assert.match(html,/data-gallery-next aria-label="Imagen siguiente"/);
 assert.match(html,/data-gallery-track tabindex="0"/);
 const slides=html.split('<!-- Additional gallery carousel;')[1].split('<!-- Gallery Grid -->')[0];
 for(const [,src,alt] of slides.matchAll(/<img src="([^"]+)" alt="([^"]+)"/g)) {
  assert.ok(alt.length>20);assert.ok(fs.existsSync(path.join(root,src)));
 }
});
test('new photograph preserves exact user-provided image and has no autoplay dependency',()=>{
 const image=fs.readFileSync(path.join(root,'img/servicios/camion-remolque-noche.png'));
 assert.equal(crypto.createHash('sha256').update(image).digest('hex'),'c0a59309c583cec9764ff59f43fd8a07d580568657d1e007bc1fd955f98ed9c7');
 const js=fs.readFileSync(path.join(root,'js/gallery-slider.js'),'utf8');
 assert.doesNotMatch(js,/setInterval|setTimeout|autoplay|fetch\(/);
 for(const key of ['ArrowLeft','ArrowRight','Home','End']) assert.ok(js.includes(key));
});
