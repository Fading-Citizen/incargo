(() => {
  'use strict';
  const status=document.getElementById('activation-status');
  const form=document.getElementById('activation-form');
  const help=document.getElementById('activation-help');
  let config, accessToken=null;
  const showError=(message)=>{status.textContent=message;status.className='error';help.hidden=false;form.hidden=true;accessToken=null;};
  const authHeaders=()=>({apikey:config.publishableKey,'Content-Type':'application/json'});
  async function readResponse(response){const body=await response.json().catch(()=>({}));if(!response.ok){const error=Error(response.status===401||response.status===403?'La invitación venció o no es válida.':body.msg||body.message||'No se pudo completar la solicitud.');error.status=response.status;throw error;}return body;}
  async function start(){
    accessToken=null;form.hidden=true;help.hidden=true;status.textContent='Verificando invitación…';status.className='';
    const query=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));
    const token=fragment.get('access_token');
    const tokenType=fragment.get('type')||query.get('type');
    const tokenHash=fragment.get('token_hash');
    const linkError=fragment.get('error_code')||query.get('error_code')||fragment.get('error')||query.get('error');
    history.replaceState(null,'','/activacion.html');
    if(linkError){showError('La invitación venció o no es válida.');return;}
    if(tokenType!=='invite'||(!token&&!tokenHash)){showError('Abre el enlace de invitación completo desde tu correo.');return;}
    try{
      const response=await fetch('/api/incargo-config',{cache:'no-store'});
      if(!response.ok)throw Error('El acceso no está configurado. Contacta a Incargo.');
      config=await response.json();
      if(tokenHash){
        const verified=await readResponse(await fetch(config.url+'/auth/v1/verify',{method:'POST',headers:authHeaders(),body:JSON.stringify({type:'invite',token_hash:tokenHash}),cache:'no-store'}));
        accessToken=verified.access_token||verified.session?.access_token||null;
      }else accessToken=token;
      if(!accessToken)throw Error('La invitación no produjo una sesión válida.');
      await readResponse(await fetch(config.url+'/auth/v1/user',{headers:{apikey:config.publishableKey,Authorization:`Bearer ${accessToken}`},cache:'no-store'}));
      status.textContent='Invitación verificada. Elige una contraseña de al menos 12 caracteres.';status.className='success';form.hidden=false;
    }catch(error){showError(error.message);}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const password=form.elements.password.value,confirmation=form.elements.confirmation.value;
    if(password.length<12||password!==confirmation){status.textContent='La contraseña debe tener al menos 12 caracteres y coincidir en ambos campos.';status.className='error';return;}
    const button=form.querySelector('button');button.disabled=true;
    try{
      await readResponse(await fetch(config.url+'/auth/v1/user',{method:'PUT',headers:{...authHeaders(),Authorization:`Bearer ${accessToken}`},body:JSON.stringify({password}),cache:'no-store'}));
      accessToken=null;form.reset();form.hidden=true;help.hidden=true;status.textContent='Contraseña establecida. Ya puedes ingresar a Incargo.';status.className='success';
    }catch(error){if(error.status===401||error.status===403)showError(error.message);else{status.textContent=error.message;status.className='error';}}finally{button.disabled=false;}
  });
  window.addEventListener('hashchange',()=>{if(location.hash)start();});
  start();
})();
