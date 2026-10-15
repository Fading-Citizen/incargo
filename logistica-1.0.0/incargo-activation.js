(() => {
  'use strict';
  const status=document.getElementById('activation-status');
  const form=document.getElementById('activation-form');
  const help=document.getElementById('activation-help');
  let config, accessToken=null, linkType=null;
  const kind=()=>linkType==='recovery'?'recuperación':'invitación';
  const showError=(message,linkProblem=false)=>{status.textContent=message;status.className='error';help.hidden=!linkProblem;form.hidden=true;accessToken=null;if(linkProblem)help.textContent=`El enlace de ${kind()} venció, ya se utilizó o no es válido. Solicita uno nuevo al equipo de Incargo.`;};
  const authHeaders=()=>({apikey:config.publishableKey,'Content-Type':'application/json'});
  async function readResponse(response){const body=await response.json().catch(()=>({}));if(!response.ok){const error=Error(body.msg||body.message||'No se pudo completar la solicitud.');error.status=response.status;error.code=body.error_code||body.code;throw error;}return body;}
  const expired=error=>error.code==='otp_expired'||error.code==='invalid_token'||error.code==='bad_jwt';
  const authError=error=>{if(expired(error)||error.status===401)return showError(`El enlace de ${kind()} venció o no es válido.`,true);showError(`No se pudo verificar el enlace de ${kind()}. Inténtalo de nuevo más tarde.`);};
  async function start(){
    accessToken=null;form.hidden=true;help.hidden=true;status.textContent='Verificando enlace…';status.className='';
    const query=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));
    const token=fragment.get('access_token');
    linkType=fragment.get('type')||query.get('type');
    const tokenHash=fragment.get('token_hash');
    const linkError=fragment.get('error_code')||query.get('error_code')||fragment.get('error')||query.get('error');
    history.replaceState(null,'','/activacion.html');
    if(linkError){if(linkError==='otp_expired')showError(`El enlace de ${kind()} venció o no es válido.`,true);else showError(`No se pudo verificar el enlace de ${kind()}. Inténtalo de nuevo más tarde.`);return;}
    if(!['invite','recovery'].includes(linkType)||(!token&&!tokenHash)){showError('Abre el enlace completo de invitación o recuperación desde tu correo.',true);return;}
    try{
      const response=await fetch('/api/incargo-config',{cache:'no-store'});
      if(!response.ok)throw Error('El acceso no está configurado. Contacta a Incargo.');
      config=await response.json();
      if(!config.url||!config.publishableKey)throw Error('El acceso no está configurado. Contacta a Incargo.');
      if(tokenHash){
        const verified=await readResponse(await fetch(config.url+'/auth/v1/verify',{method:'POST',headers:authHeaders(),body:JSON.stringify({type:linkType,token_hash:tokenHash}),cache:'no-store'}));
        accessToken=verified.access_token||verified.session?.access_token||null;
      }else accessToken=token;
      if(!accessToken)throw Error('El enlace no produjo una sesión válida.');
      await readResponse(await fetch(config.url+'/auth/v1/user',{headers:{apikey:config.publishableKey,Authorization:`Bearer ${accessToken}`},cache:'no-store'}));
      status.textContent=`Enlace de ${kind()} verificado. Elige una contraseña de al menos 12 caracteres.`;status.className='success';form.hidden=false;
    }catch(error){if(error.message==='El acceso no está configurado. Contacta a Incargo.')showError(error.message);else authError(error);}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const password=form.elements.password.value,confirmation=form.elements.confirmation.value;
    if(password.length<12||password!==confirmation){status.textContent='La contraseña debe tener al menos 12 caracteres y coincidir en ambos campos.';status.className='error';return;}
    const button=form.querySelector('button');button.disabled=true;
    try{
      await readResponse(await fetch(config.url+'/auth/v1/user',{method:'PUT',headers:{...authHeaders(),Authorization:`Bearer ${accessToken}`},body:JSON.stringify({password}),cache:'no-store'}));
      accessToken=null;form.reset();form.hidden=true;help.hidden=true;status.textContent='Contraseña establecida. Ya puedes ingresar a Incargo.';status.className='success';
    }catch(error){if(expired(error)||error.status===401)authError(error);else{status.textContent=error.status===422?error.message:'No se pudo establecer la contraseña. Inténtalo de nuevo más tarde.';status.className='error';}}finally{button.disabled=false;}
  });
  window.addEventListener('hashchange',()=>{if(location.hash)start();});
  start();
})();
