(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const states={pending:'Pendiente',in_transit:'En ruta',exception:'Novedad',delivered:'Entregada'};
  const milestones={created:'Registro del envío',in_transit:'En ruta',exception:'Novedad',delivered:'Entregada'};
  let retained,expiryTimer;let config,session,accountId=null,items=[],cursor=null,generation=0,selection=0,loading=false;
  function message(text,error=false){$('notice').textContent=text;$('notice').className=text?(error?'error':'success'):'';}
  let detailTrigger=null,detailId=null;
  let authView='login',authRequest=0;
  const authCopy={login:['Ingresa a Mis envíos','Usa el correo y la contraseña de tu cuenta de cliente.'],register:['Crea tu cuenta','Después de verificar tu correo, Incargo deberá vincularte a una cuenta comercial.'],recovery:['Recupera tu contraseña','Te enviaremos un enlace para establecer una contraseña nueva.']};
  function view(name){retained?.clear();authView=name;authRequest++;generation++;for(const mode of Object.keys(authCopy))$(mode+'-form').hidden=mode!==name;document.querySelector('.auth-tabs').hidden=name==='recovery';document.querySelectorAll('[data-auth-view]').forEach(button=>{const active=button.dataset.authView===name;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});$('auth-title').textContent=authCopy[name][0];$('auth-description').textContent=authCopy[name][1];message('');}
  document.querySelectorAll('[data-auth-view]').forEach(button=>button.onclick=()=>view(button.dataset.authView));
  $('forgot-link').onclick=()=>{view('recovery');$('recovery-form').elements.email.value=$('login-form').elements.email.value;};
  $('back-to-login').onclick=()=>view('login');
  async function settings(){if(!config){const response=await fetch('/api/incargo-config',{cache:'no-store'});if(!response.ok)throw Error('El acceso no está disponible. Inténtalo más tarde.');config=await response.json();if(!config.url||!config.publishableKey)throw Error('El acceso no está disponible. Inténtalo más tarde.');}return config;}
  async function authPost(path,body){await settings();return fetch(config.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});}
  function authFailure(response,defaultText){if(response.status===429)return 'Demasiados intentos. Espera un momento y vuelve a probar.';return defaultText;}
  function clear(){ resetDetail(); $('client-search').value='';$('client-status').value='';$('filter-count').textContent='';detailTrigger=null;retained?.clear();clearTimeout(expiryTimer);generation++;selection++;session=null;accountId=null;items=[];cursor=null;loading=false;$('deliveries').replaceChildren();$('milestones').replaceChildren();$('detail').hidden=true;$('client-workspace').hidden=true;$('login').hidden=false;$('account-name').textContent='';$('list-status').textContent='';$('more').hidden=true;$('more').disabled=false;$('refresh').disabled=false;}
  const ticket=()=>({generation,session,accountId});
  const current=t=>{if(t.generation!==generation||t.session!==session||t.accountId!==accountId)return false;if(session&&session.expires_at*1000<=Date.now()){clear();message('Tu sesión terminó. Ingresa nuevamente.',true);return false;}return true;};
  function retain(){return retained??=IncargoSession.create({context:'client',config});}
  function showSession(next){
    session=next;accountId=next.scope.account_id;$('account-name').textContent=next.scope.display_name;
    $('login').hidden=true;$('client-workspace').hidden=false;message('');
    clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{if(session===next){clear();message('Tu sesión terminó. Ingresa nuevamente.',true);}},Math.min(2147483647,Math.max(0,next.expires_at*1000-Date.now())));
    void loadMore();
  }
  async function rpc(name,body={},active=session){
    if(!active||active.expires_at*1000<=Date.now())throw Error('Tu sesión terminó. Ingresa nuevamente.');
    const response=await fetch(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+active.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
    if(response.status===401||response.status===403)throw Error('Tu sesión terminó o ya no tienes acceso. Ingresa nuevamente.');
    if(!response.ok)throw Error('No pudimos consultar tus envíos. Inténtalo más tarde.');
    return response.json();
  }
  function showList(){
    const area=$('deliveries');area.replaceChildren();
    const query=($('client-search').value||'').trim().toLocaleLowerCase('es'),status=$('client-status').value||'';
    const filtered=items.filter(row=>(!status||row.status===status)&&(!query||(row.reference||'').toLocaleLowerCase('es').includes(query)));
    $('filter-count').textContent=items.length?filtered.length+' de '+items.length+' envíos cargados'+(!filtered.length?' · No hay coincidencias.':''):'';
    for(const row of filtered){const card=document.createElement('article');card.className='card';const title=document.createElement('h2');title.textContent=row.reference||'Sin remesa';const status=document.createElement('p');status.textContent='Estado: '+(states[row.status]||'No disponible');const date=document.createElement('p');date.className='muted';date.textContent='Registro: '+formattedDate(row.created_at)+(row.last_event_at?' · Último hito: '+formattedDate(row.last_event_at):'');const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Ver hitos';button.onclick=()=>showDetail(row.delivery_id,button);card.append(title,status,date,button);area.append(card);}
    if(!loading)$('list-status').textContent=items.length?'':'Aún no hay envíos vinculados a tu cuenta.';
  }
  async function revalidate(active){
    const identity=await rpc('incargo_client_identity',{},active.session);
    if(!current(active))return false;
    if(!Array.isArray(identity)||identity.length!==1||identity[0].account_id!==active.accountId){clear();message('Tu acceso de cliente cambió. Ingresa nuevamente.',true);return false;}
    return true;
  }
  async function loadMore(){
    if(!session||loading)return;
    const active=ticket(),button=$('more');loading=true;$('refresh').disabled=true;button.disabled=true;button.hidden=true;$('list-status').textContent='Cargando envíos.';
    try{
      if(!await revalidate(active))return;
      const page=await rpc('incargo_client_my_deliveries',cursor?{p_before_created_at:cursor.created_at,p_before_id:cursor.delivery_id}:{},active.session);
      if(!current(active))return;
      if(!Array.isArray(page))throw Error('No pudimos consultar tus envíos. Inténtalo más tarde.');
      items.push(...page);cursor=page.length===50?page.at(-1):null;button.hidden=!cursor;showList();$('list-status').textContent=items.length?'':'Aún no hay envíos vinculados a tu cuenta.';button.textContent='Cargar más';
    }catch(error){if(!current(active))return;if(/sesión terminó/.test(error.message)){clear();message(error.message,true);}else{$('list-status').textContent=error.message;button.textContent='Reintentar';button.hidden=false;}}
    finally{if(current(active)){loading=false;button.disabled=false;$('refresh').disabled=false;}}
  }
  async function refreshDeliveries(){
    if(!session||loading)return;
    generation++;closeDetail(false);items=[];cursor=null;$('filter-count').textContent='';
    $('deliveries').replaceChildren();$('milestones').replaceChildren();$('detail').hidden=true;$('more').hidden=true;
    await loadMore();
  }
  const stateDescriptions={pending:'El envío está registrado como pendiente. Aún no consta una salida en este estado.',in_transit:'Operaciones registró la salida. Este estado no indica una posición en tiempo real.',exception:'Hay una novedad registrada. Consulta a Incargo para conocer las indicaciones de tu envío.',delivered:'La entrega figura como completada en el sistema.'};
  const eventDescriptions={created:'Registro del envío en el sistema; no acredita recepción física.',in_transit:'Salida registrada por operaciones.',exception:'Se registró una novedad en el envío.',delivered:'Confirmación de entrega registrada.'};
  function formattedDate(value){
    if(!value||!Number.isFinite(new Date(value).getTime()))return 'Fecha no disponible';
    return new Date(value).toLocaleString('es-CO',{timeZone:'America/Bogota',year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  }
  function field(label,value){const box=document.createElement('div'),term=document.createElement('dt'),description=document.createElement('dd');term.textContent=label;description.textContent=value;box.append(term,description);return box;}
  const cargo=globalThis.IncargoCargo;
  function resetCargo(){if(!cargo?.enabled)return;$('cargo-fields').replaceChildren();$('cargo-status').textContent='';$('cargo-retry').hidden=true;}
  async function loadCargo(id,active,selected){
    if(!cargo?.enabled)return;
    resetCargo();$('cargo-detail').hidden=false;$('cargo-unavailable').textContent='Servicio aún no disponible en esta vista.';$('cargo-status').textContent='Cargando origen y carga.';
    try{
      const rows=await rpc('incargo_client_delivery_cargo',{p_delivery:id},active.session);
      if(!current(active)||selected!==selection)return;
      if(!Array.isArray(rows)||rows.length>1||rows.some(row=>!row||row.delivery_id!==id))throw Error('Invalid cargo');
      const items=rows.length?cargo.fields(rows[0]):[];
      $('cargo-fields').replaceChildren(...items.map(([label,value])=>field(label,value)));
      $('cargo-status').textContent=rows.length?'Datos registrados por operaciones.':'No hay datos disponibles para este envío. Actualiza tus envíos para comprobar el acceso.';
    }catch(error){
      if(!current(active)||selected!==selection)return;
      if(/sesión terminó/.test(error.message)){clear();message(error.message,true);}
      else{$('cargo-fields').replaceChildren();$('cargo-status').textContent='No pudimos consultar origen y carga. Reintenta.';$('cargo-retry').hidden=false;}
    }
  }
  if(cargo?.enabled)$('cargo-retry').onclick=()=>detailId?showDetail(detailId,detailTrigger):undefined;
  function resetDetail(){
    resetCargo();
    detailId=null;$('logistics-fields').replaceChildren();$('logistics-status').textContent='';$('logistics-retry').hidden=true;$('detail-summary').replaceChildren();$('detail-reference').textContent='';$('detail-state').textContent='';$('detail-explanation').textContent='';$('detail-freshness').textContent='';$('detail-retry').hidden=true;
  }
  async function showDetail(id,trigger){
    if(!session)return;
    const row=items.find(item=>item.delivery_id===id);if(!row)return;
    detailTrigger=trigger;detailId=id;const active=ticket(),selected=++selection;
    $('detail').hidden=false;$('detail-reference').textContent=row.reference||'Sin remesa';
    $('detail-state').textContent=states[row.status]||'Estado no disponible';
    $('detail-explanation').textContent=stateDescriptions[row.status]||'No hay una descripción disponible para este estado.';
    $('detail-summary').replaceChildren(field('Registrado en el sistema',formattedDate(row.created_at)),field('Último hito informado en la lista',row.last_event_at?formattedDate(row.last_event_at):'Sin hitos informados'));
    $('detail-freshness').textContent='Estado de la última consulta de envíos. Usa Actualizar envíos para comprobar cambios.';
    resetCargo();$('logistics-fields').replaceChildren();$('logistics-status').textContent='Cargando datos logísticos.';$('logistics-retry').hidden=true;$('detail-retry').hidden=true;$('detail-title').focus?.();$('detail').scrollIntoView?.({block:'start'});$('milestones').replaceChildren();$('detail-status').textContent='Cargando hitos.';
    try{
      if(!await revalidate(active))return;
      const logistics=loadLogistics(id,active,selected);
      const cargoRequest=loadCargo(id,active,selected);
      const events=await rpc('incargo_client_delivery_milestones',{p_delivery:id},active.session);
      if(!current(active)||selected!==selection)return;
      if(!Array.isArray(events)||events.some(event=>!event||typeof event.event_type!=='string'))throw Error('No pudimos cargar el historial. Reintenta la consulta.');
      $('milestones').replaceChildren();$('detail-status').textContent=events.length?events.length+' '+(events.length===1?'hito registrado.':'hitos registrados.'):'Todavía no hay hitos registrados.';
      const ordered=[...events].sort((a,b)=>(Date.parse(a.occurred_at)||0)-(Date.parse(b.occurred_at)||0));
      const latest=ordered.at(-1);$('detail-summary').replaceChildren(field('Registro del envío',formattedDate(row.created_at)),field('Último hito del historial',latest?formattedDate(latest.occurred_at):'Sin hitos registrados'));
      for(const event of ordered){
        const li=document.createElement('li');li.textContent=(milestones[event.event_type]||'Actualización')+' · '+formattedDate(event.occurred_at);
        const description=document.createElement('p');description.textContent=eventDescriptions[event.event_type]||'Evento informado por el sistema.';li.append(description);$('milestones').append(li);
      }
      await Promise.all([logistics,cargoRequest]);if(!current(active)||selected!==selection)return;
      $('detail-freshness').textContent='Historial consultado: '+formattedDate(new Date().toISOString())+' (hora de Colombia). La hora de consulta no es la hora del último hito.';
    }catch(error){if(!current(active)||selected!==selection)return;if(/sesión terminó/.test(error.message)){clear();message(error.message,true);}else{$('detail-status').textContent=error.message;$('detail-retry').hidden=false;}}
  }
  function scheduledDate(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return 'Sin fecha programada';
    const date=new Date(value+'T12:00:00Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return 'Sin fecha programada';
    return date.toLocaleDateString('es-CO',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'});
  }
  async function loadLogistics(id,active,selected){
    try{
      const rows=await rpc('incargo_client_delivery_logistics',{p_delivery:id},active.session);
      if(!current(active)||selected!==selection)return;
      if(!Array.isArray(rows)||rows.length>1||rows.some(row=>!row||row.delivery_id!==id||['destination_text','route_label','scheduled_date'].some(key=>row[key]!=null&&typeof row[key]!=='string')))throw Error('Invalid logistics');
      $('logistics-fields').replaceChildren();
      if(!rows.length){$('logistics-status').textContent='No hay datos logísticos disponibles para este envío. Actualiza tus envíos para comprobar el acceso.';return;}
      const row=rows[0];$('logistics-fields').append(field('Destino',row.destination_text?.trim()||'Sin destino registrado'),field('Ruta',row.route_label?.trim()||'Sin ruta registrada'),field('Fecha programada del viaje',scheduledDate(row.scheduled_date)));
      $('logistics-status').textContent='Información registrada por operaciones. La fecha programada del viaje no es una fecha estimada de entrega.';
    }catch(error){
      if(!current(active)||selected!==selection)return;
      if(/sesión terminó/.test(error.message)){clear();message(error.message,true);}
      else{$('logistics-fields').replaceChildren();$('logistics-status').textContent='No pudimos consultar los datos logísticos. Reintenta la consulta.';$('logistics-retry').hidden=false;}
    }
  }
  $('logistics-retry').onclick=()=>detailId?showDetail(detailId,detailTrigger):undefined;
  function closeDetail(restoreFocus=true){
    selection++;$('detail').hidden=true;$('milestones').replaceChildren();$('detail-status').textContent='';resetDetail();
    if(restoreFocus)(detailTrigger?.isConnected===false?$('client-search'):detailTrigger)?.focus?.();detailTrigger=null;
  }
  $('detail-retry').onclick=()=>detailId?showDetail(detailId,detailTrigger):undefined;
  function applyFilters(){const listMessage=$('list-status').textContent;closeDetail(false);showList();$('list-status').textContent=listMessage;}
  $('client-search').oninput=applyFilters;$('client-status').onchange=applyFilters;
  $('clear-client-filters').onclick=()=>{$('client-search').value='';$('client-status').value='';applyFilters();$('client-search').focus?.();};
  $('close-detail').onclick=()=>closeDetail();
  $('detail').onkeydown=event=>{if(event.key==='Escape'&&!$('detail').hidden){event.preventDefault();event.stopPropagation();closeDetail();}};
  $('register-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),data=new FormData(form),email=String(data.get('email')).trim(),password=String(data.get('password')),attempt=authRequest;if(password.length<12||password!==data.get('confirmation')){message('La contraseña debe tener al menos 12 caracteres y coincidir en ambos campos.',true);return;}button.disabled=true;button.textContent='Creando cuenta.';message('Creando cuenta.');try{const response=await authPost('signup?redirect_to='+encodeURIComponent(location.origin+'/activacion.html'),{email,password});if(attempt!==authRequest)return;if(!response.ok)throw Error(authFailure(response,'No pudimos crear la cuenta. Revisa los datos o inténtalo más tarde.'));form.reset();message('Revisa tu correo para verificar la cuenta. Después, solicita a Incargo que vincule tus envíos.');}catch(error){if(attempt===authRequest)message(error.message==='Failed to fetch'?'Sin conexión. Inténtalo de nuevo.':error.message,true);}finally{button.disabled=false;button.textContent='Crear cuenta';}};
  $('recovery-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),email=String(new FormData(form).get('email')).trim(),attempt=authRequest;button.disabled=true;button.textContent='Enviando.';message('Enviando enlace.');try{const response=await authPost('recover?redirect_to='+encodeURIComponent(location.origin+'/activacion.html'),{email});if(attempt!==authRequest)return;if(!response.ok)throw Error(authFailure(response,'No pudimos enviar el enlace. Inténtalo más tarde.'));message('Si existe una cuenta para ese correo, recibirás un enlace de recuperación.');}catch(error){if(attempt===authRequest)message(error.message==='Failed to fetch'?'Sin conexión. Inténtalo de nuevo.':error.message,true);}finally{button.disabled=false;button.textContent='Enviar enlace de recuperación';}};
  $('login-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('.primary-action');clear();const attempt=generation;button.disabled=true;button.textContent='Ingresando.';message('Comprobando tu acceso.');try{
    await settings();const data=new FormData(form);const response=await authPost('token?grant_type=password',{email:data.get('email'),password:data.get('password')});
    if(!response.ok)throw Error(authFailure(response,'Correo o contraseña incorrectos, o cuenta pendiente de verificación.'));const next=await response.json();if(generation!==attempt)return;
    const verified=await retain().remember(next);if(generation!==attempt||!verified)return;
    showSession(verified);form.reset();
  }catch(error){if(generation===attempt){clear();message(error.message==='Failed to fetch'?'Sin conexión. Inténtalo de nuevo.':error.message,true);}}finally{button.disabled=false;button.textContent='Ingresar a Mis envíos';}};
  $('refresh').onclick=refreshDeliveries;$('more').onclick=loadMore;$('logout').onclick=()=>{clear();message('Sesión cerrada en esta pestaña.');};
  const restoreAttempt=generation;
  void (async()=>{try{await settings();if(generation!==restoreAttempt)return;const next=await retain().restore();if(generation===restoreAttempt&&next)showSession(next);}catch(error){if(generation===restoreAttempt){clear();message(error.message,true);}}})();
})();

