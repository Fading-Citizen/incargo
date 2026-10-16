(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  let config, session, role, trips=[], deliveries=[], drivers=[], selectedId=null;
  const labels={pending:'Pendiente',in_transit:'En ruta',exception:'Novedad',delivered:'Entregada'};
  const node=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
  const notice=(message,error=false)=>{const n=$('notice');n.textContent=message;n.className=error?'error':'success';};
  const fail=error=>notice(error?.message||'No se pudo completar la operación.',true);
  async function request(path,{method='GET',body,storage=false}={}){
    const headers={apikey:config.publishableKey,Authorization:`Bearer ${session.access_token}`};
    if(body && !storage)headers['Content-Type']='application/json';
    if(storage)headers['Content-Type']=body.type;
    const response=await fetch(config.url+path,{method,headers,body:body?(storage?body:JSON.stringify(body)):undefined,cache:'no-store'});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.message||data.error_description||data.error||`Error ${response.status}`);}
    const text=await response.text();return text?JSON.parse(text):null;
  }
  const rest=(table,query='')=>request(`/rest/v1/${table}?${query}`);
  const rpc=(name,body)=>request(`/rest/v1/rpc/${name}`,{method:'POST',body});
  function renderProfile(){
    const email=typeof session?.user?.email==='string'?session.user.email.trim():'';
    $('profile-email').textContent=email||'No disponible';
    $('profile-role').textContent=role==='operations'?'Operaciones':role==='driver'?'Conductor':'No disponible';
  }
  function closeProfile(){ $('profile').hidden=true;$('profile-toggle').setAttribute('aria-expanded','false'); }
  $('profile-toggle').onclick=()=>{const open=$('profile').hidden;$('profile').hidden=!open;$('profile-toggle').setAttribute('aria-expanded',String(open));if(open)$('profile-title').focus();};
  function renderTrips(){
    const area=$('ops-trips');area.replaceChildren();
    if(!trips.length)area.append(node('p','Todavía no hay viajes.','muted'));
    trips.forEach(t=>{const item=node('div','', 'item');item.append(node('strong',t.route_label),node('small',`${t.scheduled_date} · ${t.vehicle_plate} · ${t.driver_user_id?'Conductor asignado':'Sin conductor'}`));const picker=node('select','');picker.setAttribute('aria-label','Conductor para '+t.route_label);const empty=node('option','Sin asignar');empty.value='';picker.append(empty);drivers.forEach(d=>{const option=node('option',d.user_id);option.value=d.user_id;picker.append(option);});picker.value=t.driver_user_id||'';const assign=node('button','Guardar asignación','secondary');assign.type='button';assign.onclick=async()=>{assign.disabled=true;try{await request(`/rest/v1/incargo_trips?id=eq.${t.id}`,{method:'PATCH',body:{driver_user_id:picker.value||null}});await reload();notice('Asignación actualizada.');}catch(error){fail(error);}finally{assign.disabled=false;}};item.append(picker,assign);area.append(item);});
    const pick=$('delivery-trip');pick.replaceChildren();trips.forEach(t=>{const option=node('option',t.route_label+' · '+t.scheduled_date);option.value=t.id;pick.append(option);});
  }
  function renderOpsDeliveries(){const area=$('ops-deliveries');area.replaceChildren();if(!deliveries.length)area.append(node('p','Todavía no hay entregas.','muted'));deliveries.forEach(d=>{const item=node('div','','item');item.append(node('strong',d.customer_name),node('small',`${d.invoice_reference||'Sin factura'} · ${labels[d.status]}`));const button=node('button','Crear enlace limitado','secondary');button.type='button';button.onclick=async()=>{button.disabled=true;try{const token=await rpc('incargo_create_tracking_link',{p_delivery:d.id,p_hours:72});const link=`https://www.incargo.co/seguimiento.html#token=${token}`;const output=node('p',link,'muted');output.style.overflowWrap='anywhere';item.append(output);await renderLinks(d.id,item);notice('Enlace creado. Cópialo y compártelo por el canal autorizado; no se envió ningún mensaje.');}catch(error){fail(error);}finally{button.disabled=false;}};item.append(button);area.append(item);renderLinks(d.id,item).catch(fail);});}
  async function renderLinks(deliveryId,item){const old=item.querySelector('.links');if(old)old.remove();const links=await rpc('incargo_list_tracking_links',{p_delivery:deliveryId});const area=node('div','','links');(links||[]).forEach(link=>{if(link.revoked_at)return;const row=node('div','Vence: '+new Date(link.expires_at).toLocaleString('es-CO'),'item');const revoke=node('button','Revocar enlace','secondary');revoke.type='button';revoke.onclick=async()=>{revoke.disabled=true;try{await rpc('incargo_revoke_tracking_link_by_id',{p_id:link.id});await renderLinks(deliveryId,item);notice('Enlace revocado.');}catch(error){fail(error);}finally{revoke.disabled=false;}};row.append(revoke);area.append(row);});item.append(area);}
  function renderDriver(){
    const tripArea=$('driver-trips');tripArea.replaceChildren();if(!trips.length)tripArea.append(node('p','No tienes viajes asignados.','muted'));trips.forEach(t=>tripArea.append(node('p',`${t.route_label} · ${t.scheduled_date} · ${t.vehicle_plate}`)));
    const area=$('driver-deliveries');area.replaceChildren();const query=$('search').value.trim().toLocaleLowerCase('es');const matches=deliveries.filter(d=>(d.customer_name+' '+(d.invoice_reference||'')).toLocaleLowerCase('es').includes(query));
    if(!matches.length)area.append(node('p',deliveries.length?'No hay coincidencias.':'No tienes entregas asignadas.','muted'));
    matches.forEach(d=>{const item=node('div','','item');item.append(node('strong',d.customer_name),node('small',`${d.invoice_reference||'Sin factura'} · ${labels[d.status]}`));const button=node('button','Seleccionar','secondary');button.type='button';button.onclick=()=>{selectedId=d.id;renderDriver();};item.append(button);area.append(item);});
    const selected=deliveries.find(d=>d.id===selectedId);$('selected').textContent=selected?`${selected.customer_name} · ${labels[selected.status]}`:'Selecciona una entrega.';
    $('issue-form').hidden=!selected||selected.status==='delivered';$('confirm-form').hidden=!selected||selected.status==='delivered';
  }
  async function loadClientAdmin(){
    const accounts=await rpc('incargo_client_admin_accounts',{});
    document.querySelectorAll('.client-account-select').forEach(select=>{select.replaceChildren();for(const account of accounts){const option=node('option',account.display_name);option.value=account.account_id;select.append(option);}});
    document.querySelectorAll('.client-delivery-select,#client-delivery-select').forEach(select=>{select.replaceChildren();for(const delivery of deliveries){const option=node('option',`${delivery.customer_name} · ${delivery.remittance_reference||'Sin remesa'}`);option.value=delivery.id;select.append(option);}});
    document.querySelectorAll('#ops form[id^="client-"] button').forEach(button=>button.disabled=false);
    $('client-admin-retry').hidden=true;
    adminStatus(accounts.length?'Cuentas disponibles para asignación.':'Aún no hay cuentas comerciales. Crea una cuenta tras verificar su identidad.');
  }
  async function refreshClientAdmin(){
    try{await loadClientAdmin();}
    catch(error){
      document.querySelectorAll('#ops form[id^="client-"] button').forEach(button=>button.disabled=true);
      $('client-admin-retry').hidden=false;
      adminStatus('No pudimos cargar las cuentas. Reintenta antes de crear o asignar vínculos.',true);
    }
  }
  $('client-admin-retry').onclick=refreshClientAdmin;
  function adminStatus(message,error=false){const area=$('client-admin-status');area.textContent=message;area.className=error?'error':'success';}
  async function submitClientAdmin(formId,rpcName,makeBody,refresh=false){
    const form=$(formId);form.onsubmit=async event=>{event.preventDefault();if($('client-admin-title').closest('section').hidden)return;const button=form.querySelector('button');button.disabled=true;adminStatus('Guardando…');try{const result=await rpc(rpcName,makeBody(new FormData(form)));form.reset();adminStatus(rpcName==='incargo_client_create_account'?`Cuenta creada: ${result}. Guarda este identificador para revisión.`:'Vínculo actualizado.');if(refresh){try{await loadClientAdmin();}catch(error){adminStatus(`Cuenta creada: ${result}. No pudimos actualizar la lista; recarga antes de continuar.`,true);}}}catch(error){adminStatus(error.message||'No se pudo actualizar el vínculo.',true);}finally{button.disabled=false;}};
  }
  submitClientAdmin('client-account-form','incargo_client_create_account',data=>({p_display_name:String(data.get('name')).trim()}),true);
  submitClientAdmin('client-user-form','incargo_client_link_user',data=>({p_account:data.get('account'),p_user:data.get('user')}));
  submitClientAdmin('client-delivery-form','incargo_client_assign_delivery',data=>({p_account:data.get('account'),p_delivery:data.get('delivery')}));
  submitClientAdmin('client-unlink-user-form','incargo_client_unlink_user',data=>({p_user:data.get('user')}));
  submitClientAdmin('client-unassign-delivery-form','incargo_client_unassign_delivery',data=>({p_delivery:data.get('delivery')}));
  async function reload(){trips=await rest('incargo_trips','select=id,route_label,scheduled_date,vehicle_plate,driver_user_id&order=scheduled_date.desc');deliveries=await rest('incargo_deliveries','select=id,trip_id,customer_name,destination_text,invoice_reference,remittance_reference,status&order=created_at.desc');if(role==='operations'){drivers=await rest('incargo_memberships','select=user_id&role=eq.driver');const picker=$('driver-select');picker.replaceChildren();const empty=node('option','Sin asignar');empty.value='';picker.append(empty);drivers.forEach(d=>{const option=node('option',d.user_id);option.value=d.user_id;picker.append(option);});renderTrips();renderOpsDeliveries();await refreshClientAdmin();}else renderDriver();}
  async function init(){
    const response=await fetch('/api/incargo-config',{cache:'no-store'});
    if(!response.ok)throw Error('La conexión no está configurada. Contacta a Incargo.');
    config=await response.json();
  }
  $('login-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;try{
    if(!config)await init();const data=new FormData(form);const response=await fetch(config.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:data.get('email'),password:data.get('password')}),cache:'no-store'});
    if(!response.ok)throw Error('Credenciales inválidas o cuenta no habilitada.');session=await response.json();
    const membership=await rest('incargo_memberships',`select=role&user_id=eq.${session.user.id}`);role=membership?.[0]?.role;
    if(!['operations','driver'].includes(role)){session=null;throw Error('Tu cuenta no tiene un rol de Incargo asignado.');}
    $('login').hidden=true;$('workspace').hidden=false;$('ops').hidden=role!=='operations';$('driver').hidden=role!=='driver';$('role-title').textContent=role==='operations'?'Operaciones':'Mis viajes';renderProfile();closeProfile();form.reset();await reload();notice('Sesión activa en esta pestaña.');
  }catch(error){fail(error);}finally{button.disabled=false;}};
  $('logout').onclick=()=>{session=null;role=null;trips=[];deliveries=[];selectedId=null;closeProfile();$('profile-email').textContent='No disponible';$('profile-role').textContent='No disponible';$('workspace').hidden=true;$('login').hidden=false;notice('Sesión cerrada en esta pestaña.');};
  $('trip-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;try{const data=new FormData(form);if(!String(data.get('route')).trim()||!String(data.get('vehicle')).trim())throw Error('Completa ruta y placa.');await request('/rest/v1/incargo_trips',{method:'POST',body:{route_label:String(data.get('route')).trim(),scheduled_date:data.get('date'),vehicle_plate:String(data.get('vehicle')).trim().toUpperCase(),driver_user_id:data.get('driver')||null}});form.reset();await reload();notice('Viaje creado.');}catch(error){fail(error);}finally{button.disabled=false;}};
  $('delivery-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;try{const data=new FormData(form);if(!String(data.get('customer')).trim())throw Error('Escribe el cliente.');await request('/rest/v1/incargo_deliveries',{method:'POST',body:{trip_id:data.get('trip'),customer_name:String(data.get('customer')).trim(),destination_text:data.get('destination')||null,invoice_reference:data.get('invoice')||null,remittance_reference:data.get('remittance')||null}});form.reset();await reload();notice('Entrega agregada.');}catch(error){fail(error);}finally{button.disabled=false;}};
  $('search').oninput=renderDriver;
  $('issue-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;try{if(!selectedId)throw Error('Selecciona una entrega.');await rpc('incargo_record_issue',{p_delivery:selectedId,p_request:crypto.randomUUID(),p_note:form.elements.note.value.trim()});form.reset();await reload();notice('Novedad guardada.');}catch(error){fail(error);}finally{button.disabled=false;}};
  $('confirm-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;try{if(!selectedId)throw Error('Selecciona una entrega.');const photo=form.elements.photo.files[0];if(!photo||!['image/png','image/jpeg','image/webp'].includes(photo.type)||photo.size>10485760||photo.size===0)throw Error('Selecciona una foto PNG, JPEG o WebP de hasta 10 MB.');const receiver=form.elements.receiver.value.trim();if(!receiver)throw Error('Indica quién recibe.');const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[photo.type];const path=`${selectedId}/${crypto.randomUUID()}.${ext}`;
    await request(`/storage/v1/object/incargo-proofs/${path}`,{method:'POST',body:photo,storage:true});
    await rpc('incargo_confirm_delivery',{p_delivery:selectedId,p_request:crypto.randomUUID(),p_object_path:path,p_receiver:receiver,p_observation:form.elements.observation.value.trim()||null});form.reset();await reload();notice('Entrega y soporte guardados.');
  }catch(error){fail(error);}finally{button.disabled=false;}};
  init().catch(fail);
})();
