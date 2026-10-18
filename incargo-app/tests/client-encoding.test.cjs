const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
for(const name of ['cliente.html','incargo-client.js','activacion.html','incargo-activation.js']){
 test(name+': client portal copy remains valid UTF-8',()=>{
  const bytes=fs.readFileSync(path.join(__dirname,'../../logistica-1.0.0',name));
  const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  assert.doesNotMatch(source,/\uFFFD|Ã|Â|â€|>\? INCARGO</);
  if(name==='cliente.html')for(const phrase of ['Mis envíos','ÁREA DE CLIENTES','Correo electrónico','¿La olvidaste?','Mínimo 12 caracteres','contraseña única','recuperación','Hitos del envío'])assert.ok(source.includes(phrase),phrase);
  if(name==='incargo-client.js')for(const phrase of ['Tu sesión terminó','Aún no hay envíos','Último hito','Todavía no hay hitos','Sin conexión','Después de verificar','recibirás un enlace'])assert.ok(source.includes(phrase),phrase);
 });
}
