(() => {
  'use strict';
  // Release hold requested by Incargo: configuration or server capability cannot activate finance.
  const FINANCE_RELEASE_ENABLED = false;
  const requireFinanceRelease=()=>{if(!FINANCE_RELEASE_ENABLED)throw Error('Facturación pendiente de configuración y autorización de activación.');};
  const $=id=>document.getElementById(id);
  let retained,expiryTimer,generation=0;let config, session, role, trips=[], deliveries=[], drivers=[], selectedId=null;
  let confirmationAttempt=null,confirmationBusy=false,reloadEpoch=0,clientAccounts=[];
  const cargo=globalThis.IncargoCargo;
  if(cargo?.enabled){$('cargo-inputs').hidden=false;$('cargo-inputs').disabled=false;}
  const cargoSelect=()=>cargo?.enabled?',origin_text,cargo_description,package_count,gross_weight_kg':'';
  const departures=new Map();let departureInFlight=false;
  const labels={pending:'Pendiente',in_transit:'En ruta',exception:'Novedad',delivered:'Entregada'};
  const node=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
  const notice=(message,error=false)=>{const n=$('notice');n.textContent=message;n.className=error?'error':'success';};
  const fail=error=>{if(error?.stale)return;notice(error?.message||'No se pudo completar la operación.',true);};
  const stale=()=>Object.assign(Error('Solicitud anterior descartada.'),{stale:true});
  // Publish only already-authorized operational records, never credentials or session objects.
  const publishPanel=status=>globalThis.IncargoPanel?.update({status,deliveries:status==='ready'&&role==='operations'?deliveries:[],trips:status==='ready'&&role==='operations'?trips:[],drivers:status==='ready'&&role==='operations'?drivers:[],accounts:status==='ready'&&role==='operations'?clientAccounts:[],updatedAt:status==='ready'?new Date().toISOString():undefined});
  function clear(){
    reloadEpoch++;clientAccounts=[];publishPanel('signed-out');
    accessRequests?.reset();
    if(cargo?.enabled)$('delivery-form').reset();
    generation++;departures.clear();departureInFlight=false;confirmationAttempt=null;confirmationBusy=false;$('confirm-form').reset();$('issue-form').reset();confirmationControls();retained?.clear();clearTimeout(expiryTimer);session=null;role=null;trips=[];deliveries=[];drivers=[];selectedId=null;
    closeProfile();$('login-form').querySelector('button').disabled=false;$('profile-email').textContent='No disponible';$('profile-role').textContent='No disponible';
    for(const id of ['ops-trips','ops-deliveries','driver-trips','driver-deliveries','driver-select','delivery-trip'])$(id).replaceChildren();
    document.querySelectorAll('.client-account-select,.client-delivery-select,#client-delivery-select').forEach(e=>e.replaceChildren());
    $('client-admin-status').textContent='';$('selected').textContent='';$('workspace').hidden=true;$('ops').hidden=true;$('driver').hidden=true;$('login').hidden=false;
  }
  function check(active,attempt){
    if(active!==session||attempt!==generation)throw stale();
    if(!active||active.expires_at*1000<=Date.now()){clear();notice('Tu sesión terminó. Ingresa nuevamente.',true);throw stale();}
  }
  function retain(){return retained??=IncargoSession.create({context:'operations',config});}
  async function request(path,{method='GET',body,storage=false,signal,binary=false}={}){
    const active=session,attempt=generation;const checkCurrent=()=>{check(active,attempt);if(signal?.aborted)throw Error('La solicitud agotó el tiempo de espera.');};checkCurrent();
    try{
    const headers={apikey:config.publishableKey,Authorization:`Bearer ${active.access_token}`};
    // Recheck the current server role before each operation; never use a stored role.
    const membershipResponse=await fetch(config.url+'/rest/v1/incargo_memberships?select=role&user_id=eq.'+encodeURIComponent(active.user.id),{headers,cache:'no-store',signal});
    checkCurrent();
    if(!membershipResponse.ok){if([401,403].includes(membershipResponse.status)){clear();notice('Tu acceso cambió. Ingresa nuevamente.',true);throw stale();}throw Error('No pudimos confirmar tu acceso. Reintenta.');}
    const memberships=await membershipResponse.json();checkCurrent();
    if(!Array.isArray(memberships)||memberships.length!==1||memberships[0].role!==role){clear();notice('Tu acceso cambió. Ingresa nuevamente.',true);throw stale();}
    if(body&&!storage)headers['Content-Type']='application/json';
    if(storage)headers['Content-Type']=body.type;
    const response=await fetch(config.url+path,{method,headers,body:body?(storage?body:JSON.stringify(body)):undefined,cache:'no-store',signal});
    checkCurrent();
    if([401,403].includes(response.status)){clear();notice('Tu sesión terminó o tu acceso cambió. Ingresa nuevamente.',true);throw stale();}
    if(!response.ok){const data=await response.json().catch(()=>({}));checkCurrent();throw Object.assign(Error(data.message||data.error_description||data.error||`Error ${response.status}`),{status:response.status,code:data.code});}
    if(binary){const blob=await response.blob();checkCurrent();return blob;}
    const text=await response.text();checkCurrent();return text?JSON.parse(text):null;
    }catch(error){checkCurrent();throw error;}
  }
  const rest=(table,query='',options={})=>request(`/rest/v1/${table}?${query}`,options);
  const rpc=(name,body)=>request(`/rest/v1/rpc/${name}`,{method:'POST',body});
  const accessRequests=globalThis.IncargoAccessRequests?.enabled?globalThis.IncargoAccessRequests.createOperations({root:$('client-requests'),rpc,document}):null;
  function renderProfile(){
    const email=typeof session?.user?.email==='string'?session.user.email.trim():'';
    $('profile-email').textContent=email||'No disponible';
    $('profile-role').textContent=role==='operations'?'Operaciones':role==='driver'?'Conductor':'No disponible';
  }
  function closeProfile(restoreFocus=false){
    $('profile').hidden=true;$('profile-toggle').setAttribute('aria-expanded','false');
    if(restoreFocus)$('profile-toggle').focus();
  }
  $('profile-toggle').onclick=()=>{
    if(!$('profile').hidden){closeProfile(true);return;}
    $('profile').hidden=false;$('profile-toggle').setAttribute('aria-expanded','true');$('profile-title').focus();
  };
  // Keep Escape local to the disclosure; do not intercept keys in operations forms.
  const profileKeydown=event=>{
    if(event.key!=='Escape'||$('profile').hidden)return;
    event.preventDefault();event.stopPropagation();closeProfile(true);
  };
  $('profile').onkeydown=profileKeydown;$('profile-toggle').onkeydown=profileKeydown;
  function renderTrips(){
    const area=$('ops-trips');area.replaceChildren();
    if(!trips.length)area.append(node('p','Todavía no hay viajes.','muted'));
    trips.forEach(t=>{const item=node('div','', 'item');item.append(node('strong',t.route_label),node('small',`${t.scheduled_date} · ${t.vehicle_plate} · ${t.driver_user_id?'Conductor asignado':'Sin conductor'}`));const picker=node('select','');picker.setAttribute('aria-label','Conductor para '+t.route_label);const empty=node('option','Sin asignar');empty.value='';picker.append(empty);drivers.forEach(d=>{const option=node('option',d.user_id);option.value=d.user_id;picker.append(option);});picker.value=t.driver_user_id||'';const assign=node('button','Guardar asignación','secondary');assign.type='button';assign.onclick=async()=>{assign.disabled=true;try{await request(`/rest/v1/incargo_trips?id=eq.${t.id}`,{method:'PATCH',body:{driver_user_id:picker.value||null}});await reload();notice('Asignación actualizada.');}catch(error){fail(error);}finally{assign.disabled=false;}};item.append(picker,assign);area.append(item);});
    const pick=$('delivery-trip');pick.replaceChildren();trips.forEach(t=>{const option=node('option',t.route_label+' · '+t.scheduled_date);option.value=t.id;pick.append(option);});
  }
  // These fields already belong to the authorized operations/driver response.
  // Keep destinations out of the separately scoped client portal.
  function deliveryContext(delivery){
    const context=node('div','','delivery-context');
    const trip=trips.find(item=>item.id===delivery.trip_id);
    context.append(node('p','Destino: '+(delivery.destination_text?.trim()||'Sin destino registrado')),
      node('p','Remesa: '+(delivery.remittance_reference?.trim()||'Sin remesa')),
      node('p','Viaje: '+(trip?`${trip.route_label} · ${trip.scheduled_date}`:'No disponible')));
    if(cargo?.enabled){try{for(const [label,value] of cargo.fields(delivery))context.append(node('p',label+': '+value));}catch{context.append(node('p','No pudimos mostrar los datos de carga. Actualiza la vista.'));}}
    return context;
  }
  function departureButton(delivery){
    if(role!=='operations')return null;
    const pending=departures.get(delivery.id);
    if(delivery.status!=='pending'&&!pending)return null;
    const button=node('button',pending?.busy?'Registrando salida…':pending?.confirmed?'Actualizar estado':pending?'Verificar salida':'Marcar En ruta');
    button.type='button';button.className='departure-action';button.disabled=departureInFlight||Boolean(pending?.busy);
    button.setAttribute('aria-label',button.textContent+' · '+(delivery.remittance_reference||delivery.customer_name));
    button.onclick=()=>startDeparture(delivery.id);
    return button;
  }
  async function startDeparture(deliveryId){
    if(role!=='operations'||departureInFlight)return;
    let pending=departures.get(deliveryId);
    if(pending?.busy)return;
    const active=session,attemptGeneration=generation;
    try{
      check(active,attemptGeneration);
      if(!pending){
        if(deliveries.find(item=>item.id===deliveryId)?.status!=='pending')return;
        pending={requestId:crypto.randomUUID(),busy:false,confirmed:false};departures.set(deliveryId,pending);
      }
      pending.busy=true;departureInFlight=true;renderOpsDeliveries();
      if(!pending.confirmed){
        const result=await confirmationRequest('/rest/v1/rpc/incargo_start_delivery',{method:'POST',body:{p_delivery:deliveryId,p_request:pending.requestId}});
        check(active,attemptGeneration);
        if(!result||!['in_transit','exception','delivered'].includes(result.status)||!['started','replayed','already_in_transit'].includes(result.outcome))throw Error('Respuesta de salida no válida.');
        pending.confirmed=true;
      }
      // Refresh only the delivery list: avoid unrelated account/link administration.
      const rows=await confirmationRequest('/rest/v1/incargo_deliveries?select=id,trip_id,customer_name,destination_text,invoice_reference,remittance_reference,status'+cargoSelect()+'&order=created_at.desc',{});
      check(active,attemptGeneration);if(!Array.isArray(rows))throw Error('No pudimos actualizar las entregas.');
      deliveries=rows;departures.delete(deliveryId);renderOpsDeliveries();publishPanel('ready');notice('Salida registrada. Estado de las entregas actualizado.');return true;
    }catch(error){
      if(error?.stale||active!==session||attemptGeneration!==generation)return;
      if(error?.code==='PGRST202'||error?.status===404){
        departures.delete(deliveryId);notice('El registro de salida aún no está habilitado. Contacta al equipo de Incargo.',true);
      }else if(error?.message==='departure requires pending delivery'){
        departures.delete(deliveryId);notice('La entrega cambió de estado. Actualiza la página antes de continuar; no se registró otra salida.',true);
      }else notice(pending?.confirmed?'La salida está registrada. Reintenta Actualizar estado para consultar la lista.':'No pudimos verificar la salida. Pulsa Verificar salida para comprobar el mismo intento.',true);
    }finally{
      if(active===session&&attemptGeneration===generation){departureInFlight=false;if(pending)pending.busy=false;renderOpsDeliveries();}
    }
  }

  function renderOpsDeliveries(){const area=$('ops-deliveries');area.replaceChildren();if(!deliveries.length)area.append(node('p','Todavía no hay entregas.','muted'));deliveries.forEach(d=>{const item=node('div','','item delivery-card');item.setAttribute('data-status',d.status);item.setAttribute('data-delivery-id',d.id);item.setAttribute('data-search',[d.customer_name,d.invoice_reference,d.remittance_reference,d.destination_text].filter(Boolean).join(' '));item.append(node('strong',d.customer_name),node('span',labels[d.status]||'Estado no disponible','status-badge status-'+(Object.hasOwn(labels,d.status)?d.status:'unknown')),node('small',`${d.remittance_reference||'Sin remesa'} · ${d.invoice_reference||'Sin factura'}`));const detail=node('details','','delivery-detail');detail.append(node('summary','Ver detalles'),deliveryContext(d));item.append(detail);const button=node('button','Crear enlace limitado','secondary');button.type='button';button.onclick=async()=>{button.disabled=true;try{const token=await rpc('incargo_create_tracking_link',{p_delivery:d.id,p_hours:72});const link=`https://www.incargo.co/seguimiento.html#token=${token}`;const output=node('p',link,'muted');output.style.overflowWrap='anywhere';detail.append(output);detail.open=true;await renderLinks(d.id,detail);notice('Enlace creado. Cópialo y compártelo por el canal autorizado; no se envió ningún mensaje.');}catch(error){fail(error);}finally{button.disabled=false;}};const departure=departureButton(d);if(departure)item.append(departure);item.append(button);area.append(item);renderLinks(d.id,detail).catch(fail);});}
  async function renderLinks(deliveryId,item){const old=item.querySelector('.links');if(old)old.remove();const links=await rpc('incargo_list_tracking_links',{p_delivery:deliveryId});const area=node('div','','links');(links||[]).forEach(link=>{if(link.revoked_at)return;const row=node('div','Vence: '+new Date(link.expires_at).toLocaleString('es-CO'),'item');const revoke=node('button','Revocar enlace','secondary');revoke.type='button';revoke.onclick=async()=>{revoke.disabled=true;try{await rpc('incargo_revoke_tracking_link_by_id',{p_id:link.id});await renderLinks(deliveryId,item);notice('Enlace revocado.');}catch(error){fail(error);}finally{revoke.disabled=false;}};row.append(revoke);area.append(row);});item.append(area);}
  function renderDriver(){
    const tripArea=$('driver-trips');tripArea.replaceChildren();if(!trips.length)tripArea.append(node('p','No tienes viajes asignados.','muted'));trips.forEach(t=>tripArea.append(node('p',`${t.route_label} · ${t.scheduled_date} · ${t.vehicle_plate}`)));
    const area=$('driver-deliveries');area.replaceChildren();const query=$('search').value.trim().toLocaleLowerCase('es');const matches=deliveries.filter(d=>[d.customer_name,d.invoice_reference,d.remittance_reference,d.destination_text].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(query));
    if(!matches.length)area.append(node('p',deliveries.length?'No hay coincidencias.':'No tienes entregas asignadas.','muted'));
    matches.forEach(d=>{const item=node('div','','item driver-delivery'+(d.id===selectedId?' is-selected':''));item.append(node('strong',d.customer_name),node('span',labels[d.status]||'Estado no disponible','status-badge status-'+(Object.hasOwn(labels,d.status)?d.status:'unknown')),node('small',d.invoice_reference||'Sin factura'),deliveryContext(d));const button=node('button','Seleccionar','secondary');button.type='button';button.setAttribute('aria-pressed',String(d.id===selectedId));button.disabled=Boolean(confirmationAttempt);button.onclick=()=>{if(confirmationAttempt)return;selectedId=d.id;renderDriver();$('selected').focus?.({preventScroll:true});if(globalThis.matchMedia?.('(max-width:900px)')?.matches)$('selected').scrollIntoView?.({block:'start'});};item.append(button);area.append(item);});
    const selected=deliveries.find(d=>d.id===selectedId);$('selected').replaceChildren();if(selected)$('selected').append(node('strong',`${selected.customer_name} · ${labels[selected.status]}`),deliveryContext(selected));else $('selected').textContent='Selecciona una entrega.';
    $('issue-form').hidden=!selected||selected.status==='delivered';$('confirm-form').hidden=!selected||(selected.status==='delivered'&&!confirmationAttempt);confirmationControls();
  }
  async function loadClientAdmin(){
    const active=session,attempt=generation;
    const accounts=await rpc('incargo_client_admin_accounts',{});clientAccounts=accounts;
    if(accessRequests)await accessRequests.load(accounts);
    check(active,attempt);
    document.querySelectorAll('.client-account-select').forEach(select=>{select.replaceChildren();for(const account of accounts){const option=node('option',account.display_name);option.value=account.account_id;select.append(option);}});
    document.querySelectorAll('.client-delivery-select,#client-delivery-select').forEach(select=>{select.replaceChildren();for(const delivery of deliveries){const option=node('option',`${delivery.customer_name} · ${delivery.remittance_reference||'Sin remesa'}`);option.value=delivery.id;select.append(option);}});
    document.querySelectorAll('#ops form[id^="client-"] button').forEach(button=>button.disabled=false);
    $('client-admin-retry').hidden=true;
    adminStatus(accounts.length?'Cuentas disponibles para asignación.':'Aún no hay cuentas comerciales. Crea una cuenta tras verificar su identidad.');
  }
  async function refreshClientAdmin(){
    clientAccounts=[];
    try{await loadClientAdmin();}
    catch(error){
      if(error?.stale)return;
      document.querySelectorAll('#ops form[id^="client-"] button').forEach(button=>button.disabled=true);
      $('client-admin-retry').hidden=false;
      adminStatus('No pudimos cargar las cuentas. Reintenta antes de crear o asignar vínculos.',true);
    }
  }
  $('client-admin-retry').onclick=refreshClientAdmin;
  function adminStatus(message,error=false){const area=$('client-admin-status');area.textContent=message;area.className=error?'error':'success';}
  async function submitClientAdmin(formId,rpcName,makeBody,refresh=false){
    const form=$(formId);form.onsubmit=async event=>{event.preventDefault();if($('client-admin-title').closest('section').hidden)return;const button=form.querySelector('button');button.disabled=true;adminStatus('Guardando.');try{const result=await rpc(rpcName,makeBody(new FormData(form)));form.reset();adminStatus(rpcName==='incargo_client_create_account'?`Cuenta creada: ${result}. Guarda este identificador para revisión.`:'Vínculo actualizado.');if(refresh){try{await loadClientAdmin();}catch(error){if(error?.stale)return;adminStatus(`Cuenta creada: ${result}. No pudimos actualizar la lista; recarga antes de continuar.`,true);}}}catch(error){adminStatus(error.message||'No se pudo actualizar el vínculo.',true);}finally{button.disabled=false;}};
  }
  submitClientAdmin('client-account-form','incargo_client_create_account',data=>({p_display_name:String(data.get('name')).trim()}),true);
  submitClientAdmin('client-user-form','incargo_client_link_user',data=>({p_account:data.get('account'),p_user:data.get('user')}));
  submitClientAdmin('client-delivery-form','incargo_client_assign_delivery',data=>({p_account:data.get('account'),p_delivery:data.get('delivery')}));
  submitClientAdmin('client-unlink-user-form','incargo_client_unlink_user',data=>({p_user:data.get('user')}));
  submitClientAdmin('client-unassign-delivery-form','incargo_client_unassign_delivery',data=>({p_delivery:data.get('delivery')}));
  async function reload({signal}={}){
    const active=session,attempt=generation,epoch=++reloadEpoch;
    const current=()=>{check(active,attempt);if(epoch!==reloadEpoch)throw stale();};
    publishPanel('loading');
    try{
      const nextTrips=await rest('incargo_trips','select=id,route_label,scheduled_date,vehicle_plate,driver_user_id&order=scheduled_date.desc',{signal});current();
      const nextDeliveries=await rest('incargo_deliveries','select=id,trip_id,customer_name,destination_text,invoice_reference,remittance_reference,status'+cargoSelect()+'&order=created_at.desc',{signal});current();
      const nextDrivers=role==='operations'?await rest('incargo_memberships','select=user_id&role=eq.driver',{signal}):[];current();
      trips=nextTrips;deliveries=nextDeliveries;drivers=nextDrivers;
      if(role==='operations'){
        const picker=$('driver-select');picker.replaceChildren();const empty=node('option','Sin asignar');empty.value='';picker.append(empty);
        drivers.forEach(d=>{const option=node('option',d.user_id);option.value=d.user_id;picker.append(option);});
        renderTrips();renderOpsDeliveries();await refreshClientAdmin();current();publishPanel('ready');
      }else{renderDriver();publishPanel('signed-out');}
    }catch(error){if(!error?.stale&&epoch===reloadEpoch)publishPanel('error');throw error;}
  }
  async function init(){
    const response=await fetch('/api/incargo-config',{cache:'no-store'});
    if(!response.ok)throw Error('La conexión no está configurada. Contacta a Incargo.');
    config=await response.json();
  }
  async function showSession(next,attempt){
    if(attempt!==generation)return;
    session=next;role=next.scope;
    $('login').hidden=true;$('workspace').hidden=false;$('ops').hidden=role!=='operations';$('driver').hidden=role!=='driver';
    $('role-title').textContent=role==='operations'?'Operaciones':'Mis viajes';renderProfile();closeProfile();
    clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{if(session===next){clear();notice('Tu sesión terminó. Ingresa nuevamente.',true);}},Math.min(2147483647,Math.max(0,next.expires_at*1000-Date.now())));
    await reload();check(next,attempt);if(role==='operations'&&globalThis.IncargoPanel)document.querySelector('[data-panel="ops-dashboard-panel"]')?.click?.();notice('Sesión activa en esta pestaña.');
  }
  $('login-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');clear();const attempt=generation;button.disabled=true;
    try{
      if(!config)await init();if(attempt!==generation)return;
      const data=new FormData(form),response=await fetch(config.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:data.get('email'),password:data.get('password')}),cache:'no-store'});
      if(attempt!==generation)return;
      if(!response.ok)throw Error('Credenciales inválidas o cuenta no habilitada.');
      const login=await response.json();if(attempt!==generation)return;
      const next=await retain().remember(login);if(attempt!==generation||!next)return;
      form.reset();await showSession(next,attempt);
    }catch(error){if(attempt===generation)fail(error);}finally{if(attempt===generation)button.disabled=false;}
  };
  if($('ops-refresh'))$('ops-refresh').onclick=async()=>{const button=$('ops-refresh');button.disabled=true;try{await reload();notice('Datos actualizados.');}catch(error){fail(error);}finally{button.disabled=false;}};
  $('logout').onclick=()=>{clear();$('login-form').querySelector('button').disabled=false;notice('Sesión cerrada en esta pestaña.');};
  $('trip-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;try{const data=new FormData(form);if(!String(data.get('route')).trim()||!String(data.get('vehicle')).trim())throw Error('Completa ruta y placa.');await request('/rest/v1/incargo_trips',{method:'POST',body:{route_label:String(data.get('route')).trim(),scheduled_date:data.get('date'),vehicle_plate:String(data.get('vehicle')).trim().toUpperCase(),driver_user_id:data.get('driver')||null}});form.reset();await reload();notice('Viaje creado.');}catch(error){fail(error);}finally{button.disabled=false;}};
  $('delivery-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');if(button.disabled)return;button.disabled=true;try{const data=new FormData(form);if(!String(data.get('customer')).trim())throw Error('Escribe el cliente.');await request('/rest/v1/incargo_deliveries',{method:'POST',body:{trip_id:data.get('trip'),customer_name:String(data.get('customer')).trim(),destination_text:data.get('destination')||null,invoice_reference:data.get('invoice')||null,remittance_reference:data.get('remittance')||null,...(cargo?.enabled?cargo.parse(Object.fromEntries(data)): {})}});form.reset();await reload();notice('Entrega agregada.');}catch(error){fail(error);}finally{button.disabled=false;}};
  $('search').oninput=renderDriver;
  $('issue-form').onsubmit=async event=>{event.preventDefault();if(confirmationAttempt)return;const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;try{if(!selectedId)throw Error('Selecciona una entrega.');await rpc('incargo_record_issue',{p_delivery:selectedId,p_request:crypto.randomUUID(),p_note:form.elements.note.value.trim()});form.reset();await reload();notice('Novedad guardada.');}catch(error){fail(error);}finally{button.disabled=false;}};
  function confirmationControls(){
    const pending=Boolean(confirmationAttempt);
    $('confirm-form').querySelectorAll?.('input,textarea').forEach(field=>field.disabled=pending);
    $('issue-form').querySelector('button').disabled=pending;
    const button=$('confirm-form').querySelector('button');button.disabled=confirmationBusy;
    button.textContent=confirmationBusy?'Verificando entrega…':confirmationAttempt?.confirmed?'Actualizar vista':pending?'Verificar y reintentar':'Confirmar entrega';
    $('confirm-state').textContent=!pending?'':confirmationAttempt.confirmed?'La entrega ya fue confirmada. Falta actualizar la lista.':'Este intento conserva la entrega, la foto y los datos originales. Si se interrumpe, verifica y reintenta aquí. Mantén esta pestaña abierta hasta terminar.';
  }
  // A timeout is an unknown outcome, never evidence that the server rolled back.
  async function confirmationDeadline(action){
    const controller=new AbortController();let timer;
    try{return await Promise.race([
      action(controller.signal),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('La solicitud agotó el tiempo de espera.'));},60000);})
    ]);}finally{clearTimeout(timer);}
  }
  const confirmationRequest=(path,options)=>confirmationDeadline(signal=>request(path,{...options,signal}));
  async function confirmAttempt(attempt,ensureCurrent){
    ensureCurrent();if(attempt.confirmed)return;
    const confirm=()=>{ensureCurrent();return confirmationRequest('/rest/v1/rpc/incargo_confirm_delivery',{method:'POST',body:attempt.payload});};
    if(attempt.started){
      // The existing RPC recognizes this request before rejecting a delivered row,
      // and verifies assignment and proof ownership. Never infer success from 409.
      try{await confirm();attempt.confirmed=true;return;}
      catch(error){if(error.status!==400||error.message!=='proof missing')throw error;}
    }
    ensureCurrent();attempt.started=true;
    await confirmationRequest(`/storage/v1/object/incargo-proofs/${attempt.payload.p_object_path}`,{method:'POST',body:attempt.photo,storage:true});
    await confirm();attempt.confirmed=true;
  }
  $('confirm-form').onsubmit=async event=>{
    event.preventDefault();if(confirmationBusy)return;
    const form=event.currentTarget,active=session,attemptGeneration=generation;
    try{
      check(active,attemptGeneration);
      if(!confirmationAttempt){
        const selected=deliveries.find(d=>d.id===selectedId);
        if(!selected||selected.status==='delivered')throw Error('Selecciona una entrega pendiente.');
        const photo=form.elements.photo.files[0];
        if(!photo||!['image/png','image/jpeg','image/webp'].includes(photo.type)||photo.size>10485760||photo.size===0)throw Error('Selecciona una foto PNG, JPEG o WebP de hasta 10 MB.');
        const receiver=form.elements.receiver.value.trim(),observation=form.elements.observation.value.trim();
        if(!receiver||receiver.length>120)throw Error('Indica quién recibe, con un máximo de 120 caracteres.');
        if(observation.length>500)throw Error('La observación admite hasta 500 caracteres.');
        const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[photo.type];
        confirmationAttempt={photo,started:false,confirmed:false,payload:Object.freeze({p_delivery:selected.id,p_request:crypto.randomUUID(),p_object_path:`${selected.id}/${crypto.randomUUID()}.${ext}`,p_receiver:receiver,p_observation:observation||null})};
      }
      confirmationBusy=true;renderDriver();
      await confirmAttempt(confirmationAttempt,()=>check(active,attemptGeneration));check(active,attemptGeneration);
      await confirmationDeadline(signal=>reload({signal}));check(active,attemptGeneration);
      confirmationAttempt=null;form.reset();renderDriver();notice('Entrega y soporte guardados.');
    }catch(error){
      if(error?.stale||active!==session||attemptGeneration!==generation)return;
      if(confirmationAttempt)notice(confirmationAttempt.confirmed?'Entrega confirmada. No pudimos actualizar la lista; pulsa Actualizar vista.':'No pudimos verificar el resultado. Pulsa Verificar y reintentar para comprobar este mismo intento.',true);
      else fail(error);
    }finally{
      if(active===session&&attemptGeneration===generation){confirmationBusy=false;confirmationControls();}
    }
  };
  globalThis.addEventListener?.('beforeunload',event=>{
    if(confirmationAttempt&&!confirmationAttempt.confirmed){event.preventDefault();event.returnValue='';}
  });
  // Capability-scoped application API. Credentials and raw request remain private.
  const requireOperations=()=>{if(role!=='operations')throw Error('Acceso operativo requerido.');check(session,generation);};
  const textValue=(value,max,label)=>{const text=String(value??'').trim();if(!text||text.length>max)throw Error(label+' no válido.');return text;};
  async function createRecord(table,payload,requestId){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId||''))throw Error('Identificador del intento no válido.');
    const existing=await rest(table,'select='+Object.keys(payload).join(',')+'&id=eq.'+encodeURIComponent(requestId));
    if(existing.length){if(Object.keys(payload).some(key=>String(existing[0][key]??'')!==String(payload[key]??'')))throw Error('Este intento ya tiene datos distintos guardados. Actualiza y verifica el registro antes de continuar.');return;}
    await request('/rest/v1/'+table,{method:'POST',body:{id:requestId,...payload}});
  }
  globalThis.IncargoOperations=Object.freeze({
    async refresh(){requireOperations();await reload();notice('Datos actualizados.');},
    async businessCapabilities(){requireOperations();try{const capabilities=await rpc('incargo_business_capabilities',{});return {...capabilities,finance:FINANCE_RELEASE_ENABLED&&capabilities.finance===true};}catch(error){if(error?.status===404||error?.code==='PGRST202')return {commercial:false,finance:false};throw error;}},
    async quoteBoard(){requireOperations();return rpc('incargo_quote_board',{});},
    async orderBoard(){requireOperations();return rpc('incargo_order_board',{});},
    async receiptBoard(){requireOperations();requireFinanceRelease();return rpc('incargo_receipt_board',{});},
    async financeBoard(){requireOperations();requireFinanceRelease();return rpc('incargo_finance_board',{});},
    async invoiceDetail(id){requireOperations();requireFinanceRelease();return rpc('incargo_invoice_detail',{p_id:id});},
    async createQuote(request,data){requireOperations();return rpc('incargo_create_quote',{p_request:request,p_data:data});},
    async reviseQuote(request,id,reason,data){requireOperations();return rpc('incargo_revise_quote',{p_request:request,p_quote:id,p_reason:reason,p_data:data});},
    async cancelOrder(request,id,reason){requireOperations();return rpc('incargo_cancel_unassigned_order',{p_request:request,p_order:id,p_reason:reason});},
    async administrativeNotes(type,id){requireOperations();if(type==='invoice'||type==='receipt')requireFinanceRelease();return rpc('incargo_administrative_notes',{p_type:type,p_id:id});},
    async addAdministrativeNote(request,type,id,body,source){requireOperations();if(type==='invoice'||type==='receipt')requireFinanceRelease();return rpc('incargo_add_administrative_note',{p_request:request,p_type:type,p_id:id,p_body:body,p_source:source});},
    async acceptQuote(request,id,reference){requireOperations();return rpc('incargo_accept_quote',{p_request:request,p_quote:id,p_reference:reference});},
    async linkOrderDelivery(request,order,delivery){requireOperations();return rpc('incargo_link_order_delivery',{p_request:request,p_order:order,p_delivery:delivery});},
    async registerInvoice(request,data){requireOperations();requireFinanceRelease();return rpc('incargo_register_admin_invoice',{p_request:request,p_data:data});},
    async recordReceipt(request,data){requireOperations();requireFinanceRelease();return rpc('incargo_record_receipt',{p_request:request,p_data:data});},
    async applyReceipt(request,receipt,invoice,amount){requireOperations();requireFinanceRelease();return rpc('incargo_apply_receipt',{p_request:request,p_receipt:receipt,p_invoice:invoice,p_amount:amount});},
    async reverseAllocation(request,id,reason){requireOperations();requireFinanceRelease();return rpc('incargo_reverse_allocation',{p_request:request,p_allocation:id,p_reason:reason});},
    async createTrip(input){requireOperations();const payload={route_label:textValue(input.route_label,100,'Ruta'),scheduled_date:input.scheduled_date,vehicle_plate:textValue(input.vehicle_plate,20,'Placa').toUpperCase(),driver_user_id:input.driver_user_id||null};if(!/^\d{4}-\d{2}-\d{2}$/.test(payload.scheduled_date))throw Error('Fecha no válida.');await createRecord('incargo_trips',payload,input.request_id);await reload();},
    async assignTrip(id,driver){requireOperations();if(!trips.some(t=>t.id===id))throw Error('Viaje no disponible.');await rest('incargo_trips','id=eq.'+encodeURIComponent(id),{method:'PATCH',body:{driver_user_id:driver||null}});await reload();},
    async createDelivery(input){requireOperations();if(!trips.some(t=>t.id===input.trip_id))throw Error('Selecciona un viaje disponible.');const payload={trip_id:input.trip_id,customer_name:textValue(input.customer_name,120,'Cliente'),destination_text:input.destination_text||null,invoice_reference:input.invoice_reference||null,remittance_reference:input.remittance_reference||null,...(cargo?.enabled?cargo.parse(input):{})};for(const [key,max] of [['destination_text',200],['invoice_reference',80],['remittance_reference',80]])if(payload[key]?.length>max)throw Error('Referencia demasiado larga.');await createRecord('incargo_deliveries',payload,input.request_id);await reload();},
    async startDelivery(id){requireOperations();if(!deliveries.some(d=>d.id===id))throw Error('Entrega no disponible.');if(!await startDeparture(id))throw Error('No se confirmó la salida. Revisa el estado antes de reintentar.');},
    async detail(id){requireOperations();if(!deliveries.some(d=>d.id===id))throw Error('Entrega no disponible.');const events=await rest('incargo_delivery_events','select=id,event_type,note,occurred_at&delivery_id=eq.'+encodeURIComponent(id)+'&order=occurred_at.asc');const proofs=await rest('incargo_delivery_proofs','select=receiver_name,observation,captured_at&delivery_id=eq.'+encodeURIComponent(id));const links=await rpc('incargo_list_tracking_links',{p_delivery:id});return {events,proof:proofs[0]||null,links};},
    async proof(id){requireOperations();const rows=await rest('incargo_delivery_proofs','select=object_path&delivery_id=eq.'+encodeURIComponent(id));if(!rows[0]?.object_path)throw Error('No hay comprobante disponible.');return request('/storage/v1/object/authenticated/incargo-proofs/'+rows[0].object_path.split('/').map(encodeURIComponent).join('/'),{binary:true});},
    async tracking(id){requireOperations();const token=await rpc('incargo_create_tracking_link',{p_delivery:id,p_hours:72});return 'https://www.incargo.co/seguimiento.html#token='+encodeURIComponent(token);},
    async revokeTracking(id){requireOperations();await rpc('incargo_revoke_tracking_link_by_id',{p_id:id});},
    async accounts(){requireOperations();return rpc('incargo_client_admin_accounts',{});},
    async requests(){requireOperations();return rpc('incargo_pending_client_access_requests',{});},
    async createAccount(name){requireOperations();const result=await rpc('incargo_client_create_account',{p_display_name:textValue(name,120,'Cuenta')});await reload();return result;},
    async linkUser(account,user){requireOperations();return rpc('incargo_client_link_user',{p_account:account,p_user:user});},
    async assignClientDelivery(account,delivery){requireOperations();return rpc('incargo_client_assign_delivery',{p_account:account,p_delivery:delivery});},
    async unlinkUser(user){requireOperations();return rpc('incargo_client_unlink_user',{p_user:user});},
    async unassignClientDelivery(delivery){requireOperations();return rpc('incargo_client_unassign_delivery',{p_delivery:delivery});},
    async approveRequest(user,account,updatedAt){requireOperations();return rpc('incargo_approve_client_access_request',{p_user:user,p_account:account,p_updated_at:updatedAt});}
  });
  const restoreAttempt=generation;
  void (async()=>{try{await init();if(generation!==restoreAttempt)return;const next=await retain().restore();if(generation===restoreAttempt&&next)await showSession(next,restoreAttempt);}catch(error){if(generation===restoreAttempt)fail(error);}})();
})();

