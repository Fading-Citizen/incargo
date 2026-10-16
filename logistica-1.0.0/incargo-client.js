(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const states={pending:'Pendiente',in_transit:'En ruta',exception:'Novedad',delivered:'Entregada'};
  const milestones={created:'Recibido',in_transit:'En ruta',exception:'Novedad',delivered:'Entregada'};
  let retained,expiryTimer;let config,session,accountId=null,items=[],cursor=null,generation=0,selection=0,loading=false;
  function message(text,error=false){$('notice').textContent=text;$('notice').className=text?(error?'error':'success'):'';}
  let authView='login',authRequest=0;
  const authCopy={login:['Ingresa a Mis env�os','Usa el correo y la contrase�a de tu cuenta de cliente.'],register:['Crea tu cuenta','Despu�s de verificar tu correo, Incargo deber� vincularte a una cuenta comercial.'],recovery:['Recupera tu contrase�a','Te enviaremos un enlace para establecer una contrase�a nueva.']};
  function view(name){retained?.clear();authView=name;authRequest++;generation++;for(const mode of Object.keys(authCopy))$(mode+'-form').hidden=mode!==name;document.querySelector('.auth-tabs').hidden=name==='recovery';document.querySelectorAll('[data-auth-view]').forEach(button=>{const active=button.dataset.authView===name;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});$('auth-title').textContent=authCopy[name][0];$('auth-description').textContent=authCopy[name][1];message('');}
  document.querySelectorAll('[data-auth-view]').forEach(button=>button.onclick=()=>view(button.dataset.authView));
  $('forgot-link').onclick=()=>{view('recovery');$('recovery-form').elements.email.value=$('login-form').elements.email.value;};
  $('back-to-login').onclick=()=>view('login');
  async function settings(){if(!config){const response=await fetch('/api/incargo-config',{cache:'no-store'});if(!response.ok)throw Error('El acceso no est� disponible. Int�ntalo m�s tarde.');config=await response.json();if(!config.url||!config.publishableKey)throw Error('El acceso no est� disponible. Int�ntalo m�s tarde.');}return config;}
  async function authPost(path,body){await settings();return fetch(config.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});}
  function authFailure(response,defaultText){if(response.status===429)return 'Demasiados intentos. Espera un momento y vuelve a probar.';return defaultText;}
  function clear(){retained?.clear();clearTimeout(expiryTimer);generation++;selection++;session=null;accountId=null;items=[];cursor=null;loading=false;$('deliveries').replaceChildren();$('milestones').replaceChildren();$('detail').hidden=true;$('client-workspace').hidden=true;$('login').hidden=false;$('account-name').textContent='';$('list-status').textContent='';$('more').hidden=true;$('more').disabled=false;$('refresh').disabled=false;}
  const ticket=()=>({generation,session,accountId});
  const current=t=>{if(t.generation!==generation||t.session!==session||t.accountId!==accountId)return false;if(session&&session.expires_at*1000<=Date.now()){clear();message('Tu sesi�n termin�. Ingresa nuevamente.',true);return false;}return true;};
  function retain(){return retained??=IncargoSession.create({context:'client',config});}
  function showSession(next){
    session=next;accountId=next.scope.account_id;$('account-name').textContent=next.scope.display_name;
    $('login').hidden=true;$('client-workspace').hidden=false;message('');
    clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{if(session===next){clear();message('Tu sesi�n termin�. Ingresa nuevamente.',true);}},Math.min(2147483647,Math.max(0,next.expires_at*1000-Date.now())));
    void loadMore();
  }
  async function rpc(name,body={},active=session){
    if(!active||active.expires_at*1000<=Date.now())throw Error('Tu sesi�n termin�. Ingresa nuevamente.');
    const response=await fetch(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+active.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
    if(response.status===401||response.status===403)throw Error('Tu sesi�n termin� o ya no tienes acceso. Ingresa nuevamente.');
    if(!response.ok)throw Error('No pudimos consultar tus env�os. Int�ntalo m�s tarde.');
    return response.json();
  }
  function showList(){
    const area=$('deliveries');area.replaceChildren();
    for(const row of items){const card=document.createElement('article');card.className='card';const title=document.createElement('h2');title.textContent=row.reference||'Sin remesa';const status=document.createElement('p');status.textContent='Estado: '+(states[row.status]||'No disponible');const date=document.createElement('p');date.className='muted';date.textContent='Creado: '+new Date(row.created_at).toLocaleDateString('es-CO')+(row.last_event_at?' � �ltimo hito: '+new Date(row.last_event_at).toLocaleDateString('es-CO'):'');const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Ver hitos';button.onclick=()=>showDetail(row.delivery_id);card.append(title,status,date,button);area.append(card);}
    $('list-status').textContent=items.length?'':'A�n no hay env�os vinculados a tu cuenta.';
  }
  async function revalidate(active){
    const identity=await rpc('incargo_client_identity',{},active.session);
    if(!current(active))return false;
    if(!Array.isArray(identity)||identity.length!==1||identity[0].account_id!==active.accountId){clear();message('Tu acceso de cliente cambi�. Ingresa nuevamente.',true);return false;}
    return true;
  }
  async function loadMore(){
    if(!session||loading)return;
    const active=ticket(),button=$('more');loading=true;$('refresh').disabled=true;button.disabled=true;button.hidden=true;$('list-status').textContent='Cargando env�os.';
    try{
      if(!await revalidate(active))return;
      const page=await rpc('incargo_client_my_deliveries',cursor?{p_before_created_at:cursor.created_at,p_before_id:cursor.delivery_id}:{},active.session);
      if(!current(active))return;
      if(!Array.isArray(page))throw Error('No pudimos consultar tus env�os. Int�ntalo m�s tarde.');
      items.push(...page);cursor=page.length===50?page.at(-1):null;button.hidden=!cursor;showList();button.textContent='Cargar m�s';
    }catch(error){if(!current(active))return;if(/sesi�n termin�/.test(error.message)){clear();message(error.message,true);}else{$('list-status').textContent=error.message;button.textContent='Reintentar';button.hidden=false;}}
    finally{if(current(active)){loading=false;button.disabled=false;$('refresh').disabled=false;}}
  }
  async function refreshDeliveries(){
    if(!session||loading)return;
    generation++;selection++;items=[];cursor=null;
    $('deliveries').replaceChildren();$('milestones').replaceChildren();$('detail').hidden=true;$('more').hidden=true;
    await loadMore();
  }
  async function showDetail(id){
    if(!session)return;
    const active=ticket(),selected=++selection;$('detail').hidden=false;$('milestones').replaceChildren();$('detail-status').textContent='Cargando hitos.';
    try{
      if(!await revalidate(active))return;
      const events=await rpc('incargo_client_delivery_milestones',{p_delivery:id},active.session);
      if(!current(active)||selected!==selection)return;
      $('milestones').replaceChildren();$('detail-status').textContent=events.length?'':'Todav�a no hay hitos registrados.';
      for(const event of events){const li=document.createElement('li');li.textContent=(milestones[event.event_type]||'Actualizaci�n')+' � '+new Date(event.occurred_at).toLocaleString('es-CO');$('milestones').append(li);}
    }catch(error){if(!current(active)||selected!==selection)return;if(/sesi�n termin�/.test(error.message)){clear();message(error.message,true);}else $('detail-status').textContent=error.message;}
  }
  $('register-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),data=new FormData(form),email=String(data.get('email')).trim(),password=String(data.get('password')),attempt=authRequest;if(password.length<12||password!==data.get('confirmation')){message('La contrase�a debe tener al menos 12 caracteres y coincidir en ambos campos.',true);return;}button.disabled=true;button.textContent='Creando cuenta.';message('Creando cuenta.');try{const response=await authPost('signup?redirect_to='+encodeURIComponent(location.origin+'/activacion.html'),{email,password});if(attempt!==authRequest)return;if(!response.ok)throw Error(authFailure(response,'No pudimos crear la cuenta. Revisa los datos o int�ntalo m�s tarde.'));form.reset();message('Revisa tu correo para verificar la cuenta. Despu�s, solicita a Incargo que vincule tus env�os.');}catch(error){if(attempt===authRequest)message(error.message==='Failed to fetch'?'Sin conexi�n. Int�ntalo de nuevo.':error.message,true);}finally{button.disabled=false;button.textContent='Crear cuenta';}};
  $('recovery-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),email=String(new FormData(form).get('email')).trim(),attempt=authRequest;button.disabled=true;button.textContent='Enviando.';message('Enviando enlace.');try{const response=await authPost('recover?redirect_to='+encodeURIComponent(location.origin+'/activacion.html'),{email});if(attempt!==authRequest)return;if(!response.ok)throw Error(authFailure(response,'No pudimos enviar el enlace. Int�ntalo m�s tarde.'));message('Si existe una cuenta para ese correo, recibir�s un enlace de recuperaci�n.');}catch(error){if(attempt===authRequest)message(error.message==='Failed to fetch'?'Sin conexi�n. Int�ntalo de nuevo.':error.message,true);}finally{button.disabled=false;button.textContent='Enviar enlace de recuperaci�n';}};
  $('login-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('.primary-action');clear();const attempt=generation;button.disabled=true;button.textContent='Ingresando.';message('Comprobando tu acceso.');try{
    await settings();const data=new FormData(form);const response=await authPost('token?grant_type=password',{email:data.get('email'),password:data.get('password')});
    if(!response.ok)throw Error(authFailure(response,'Correo o contrase�a incorrectos, o cuenta pendiente de verificaci�n.'));const next=await response.json();if(generation!==attempt)return;
    const verified=await retain().remember(next);if(generation!==attempt||!verified)return;
    showSession(verified);form.reset();
  }catch(error){if(generation===attempt){clear();message(error.message==='Failed to fetch'?'Sin conexi�n. Int�ntalo de nuevo.':error.message,true);}}finally{button.disabled=false;button.textContent='Ingresar a Mis env�os';}};
  $('refresh').onclick=refreshDeliveries;$('more').onclick=loadMore;$('logout').onclick=()=>{clear();message('Sesi�n cerrada en esta pesta�a.');};
  const restoreAttempt=generation;
  void (async()=>{try{await settings();if(generation!==restoreAttempt)return;const next=await retain().restore();if(generation===restoreAttempt&&next)showSession(next);}catch(error){if(generation===restoreAttempt){clear();message(error.message,true);}}})();
})();

