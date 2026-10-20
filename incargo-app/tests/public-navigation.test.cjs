const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../logistica-1.0.0');
test('public navigation retains customer access and excludes internal access at every breakpoint',()=>{
 let pages=0;
 for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.html'))){
  const html=fs.readFileSync(path.join(root,name),'utf8');
  if(!html.includes('inc-access'))continue;
  pages++;
  for(const nav of html.matchAll(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi)){
   assert.doesNotMatch(nav[0],/href=["'](?:operaciones|admin)\.html/i,name);
  }
  assert.match(html,/href="cliente\.html"[^>]*class="nav-item nav-link inc-access"/,name);
 }
 assert.ok(pages>=17,'all shared public navigation pages inspected');
});
test('client login keeps exactly one operational link outside the public header',()=>{
 const html=fs.readFileSync(path.join(root,'cliente.html'),'utf8');
 assert.doesNotMatch(html.match(/<header>[\s\S]*?<\/header>/)[0],/operaciones\.html|admin\.html/);
 assert.equal((html.match(/href="operaciones\.html"/g)||[]).length,1);
 assert.match(html,/<div class="auth-footer">[^<]*<a href="operaciones\.html">Ingresa a operaciones<\/a>/);
 assert.ok(html.indexOf('auth-footer')>html.indexOf('id="login"'));
 assert.ok(html.indexOf('auth-footer')<html.indexOf('id="client-workspace"'));
 assert.ok(fs.existsSync(path.join(root,'operaciones.html')));
});
