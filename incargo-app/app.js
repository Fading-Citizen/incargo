/* Incargo browser prototype. All names and records below are invented. */
(function () {
  'use strict';
  const initial = [{ id:'V-001', route:'Medellín → Bogotá', date:'2026-10-14', vehicle:'DEM123', driver:'Conductor Ejemplo', deliveries:[
    {id:'E-001', customer:'Cliente Ficticio A', invoice:'FAC-DEMO-001', address:'Dirección de ejemplo 1', status:'pending', events:[{label:'Pedido recibido en origen', at:'Ejemplo'}]},
    {id:'E-002', customer:'Cliente Ficticio B', invoice:'FAC-DEMO-002', address:'Dirección de ejemplo 2', status:'in_transit', events:[{label:'Pedido recibido en origen', at:'Ejemplo'},{label:'En ruta', at:'Ejemplo'}]}
  ]}];
  const clone = value => JSON.parse(JSON.stringify(value));
  let trips = clone(initial), selectedTrip = 'V-001', selectedDelivery = 'E-001', clientDelivery = 'E-001', nextTrip = 2, nextDelivery = 3;
  const $ = id => document.getElementById(id);
  const statusLabel = {pending:'Pendiente',in_transit:'En ruta',at_delivery:'En entrega',delivered:'Entregada',exception:'Novedad'};
  const findTrip = id => trips.find(t => t.id === id);
  const findDelivery = id => trips.flatMap(t => t.deliveries).find(d => d.id === id);
  const showMessage = value => { $('message').textContent = value; };
  function el(tag, className, text) { const node=document.createElement(tag); if(className) node.className=className; if(text!==undefined) node.textContent=text; return node; }
  function statusNode(status) { return el('span','status '+status,statusLabel[status] || status); }
  function renderTrips() {
    $('trip-count').textContent = trips.length+' viaje'+(trips.length===1?'':'s');
    const list=$('trip-list'); list.replaceChildren();
    if(!trips.length) {list.append(el('p','empty','Aún no hay viajes. Crea uno con el formulario.'));return;}
    trips.forEach(trip => {
      const row=el('article','trip'); row.append(el('strong','',trip.route),el('small','',trip.date+' · '+trip.vehicle+' · '+trip.driver),el('small','',trip.deliveries.length+' entrega(s)'));
      const button=el('button','button button-quiet','Ver como conductor'); button.type='button'; button.addEventListener('click',()=>{selectedTrip=trip.id;selectedDelivery=trip.deliveries[0]?.id||null;showView('driver');}); row.append(button);list.append(row);
    });
  }
  function renderDriver() {
    const picker=$('driver-trip'); picker.replaceChildren();
    trips.forEach(trip=>{const option=el('option','',trip.route+' · '+trip.id);option.value=trip.id;picker.append(option);});
    if(!findTrip(selectedTrip)) selectedTrip=trips[0]?.id||null;
    picker.value=selectedTrip||'';
    const trip=findTrip(selectedTrip), list=$('delivery-list'); list.replaceChildren();
    $('driver-summary').textContent=trip ? trip.date+' · '+trip.vehicle+' · '+trip.driver+' · '+trip.deliveries.length+' entrega(s)' : 'No hay viaje seleccionado.';
    if(!trip){$('selected-delivery').textContent='Selecciona un viaje con entregas.';return;}
    const query=$('delivery-search').value.trim().toLocaleLowerCase('es');
    const matches=trip.deliveries.filter(d=>(d.customer+' '+d.invoice).toLocaleLowerCase('es').includes(query));
    if(!matches.length) list.append(el('p','empty',trip.deliveries.length?'No hay entregas que coincidan.':'Este viaje aún no tiene entregas.'));
    matches.forEach(d=>{const button=el('button','item'+(selectedDelivery===d.id?' selected':''));button.type='button';button.setAttribute('aria-label','Seleccionar '+d.customer+', '+statusLabel[d.status]);const top=el('span','item-top');top.append(el('strong','',d.customer),statusNode(d.status));button.append(top,el('small','',d.invoice+' · '+d.address));button.addEventListener('click',()=>{selectedDelivery=d.id;renderDriver();});list.append(button);});
    const selected=trip.deliveries.find(d=>d.id===selectedDelivery);
    $('selected-delivery').textContent=selected ? selected.customer+' · '+selected.invoice+' · '+statusLabel[selected.status] : 'Selecciona una entrega de este viaje.';
  }
  function renderClient() {
    const root=$('client-content');root.replaceChildren();
    const d=findDelivery(clientDelivery);
    if(!d){root.append(el('p','empty','No hay entrega seleccionada para esta vista.'));return;}
    root.append(el('h2','',d.customer),el('p','',d.invoice),el('p','muted','Estado actual: '+statusLabel[d.status]));
    const timeline=el('ol','timeline'); d.events.forEach(event=>{const item=el('li','');item.append(el('strong','',event.label),el('small','muted',event.at));timeline.append(item);});root.append(timeline);
    if(d.proof){root.append(el('h2','','Soporte de entrega'),el('p','', 'Recibió: '+d.proof.receiver));if(d.proof.observation)root.append(el('p','',d.proof.observation));const img=el('img','support-preview');img.src=d.proof.url;img.alt='Vista previa de soporte elegido en esta pestaña';root.append(img);}
    else root.append(el('p','muted','El soporte se mostrará aquí después de una confirmación en esta maqueta.'));
  }
  function showView(view) {
    document.querySelectorAll('.view').forEach(section=>{section.hidden=section.id!==view;});
    document.querySelectorAll('.nav button').forEach(button=>{if(button.dataset.view===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    showMessage('');renderTrips();renderDriver();renderClient();
    const heading=document.querySelector('#'+view+' h1');heading.setAttribute('tabindex','-1');heading.focus();
  }
  document.querySelectorAll('.nav button').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
  $('trip-form').addEventListener('submit',event=>{
    event.preventDefault();const form=event.currentTarget;
    if(!form.reportValidity()){showMessage('Completa los campos obligatorios del viaje.');return;}
    const data=new FormData(form);
    if(['route','vehicle','driver'].some(field=>!String(data.get(field)).trim())){showMessage('Ruta, vehículo y conductor no pueden quedar en blanco.');return;}
    const id='V-'+String(nextTrip++).padStart(3,'0');
    const deliveries=data.get('bundle')==='two'?[0,1].map(index=>({id:'E-'+String(nextDelivery++).padStart(3,'0'),customer:'Cliente Ficticio '+(index?'D':'C'),invoice:'FAC-DEMO-'+id+'-'+(index+1),address:'Dirección ficticia '+(index+1),status:'pending',events:[{label:'Pedido recibido en origen',at:'Ejemplo'}]})):[];
    trips.push({id,route:String(data.get('route')).trim(),date:String(data.get('date')),vehicle:String(data.get('vehicle')).trim().toUpperCase(),driver:String(data.get('driver')).trim(),deliveries});
    selectedTrip=id;selectedDelivery=deliveries[0]?.id||null;form.reset();renderTrips();renderDriver();showMessage('Viaje '+id+' creado solo en esta pestaña.');
  });
  $('driver-trip').addEventListener('change',event=>{selectedTrip=event.target.value;selectedDelivery=findTrip(selectedTrip)?.deliveries[0]?.id||null;renderDriver();});
  $('delivery-search').addEventListener('input',renderDriver);
  $('confirm-form').addEventListener('submit',event=>{
    event.preventDefault();const d=findTrip(selectedTrip)?.deliveries.find(row=>row.id===selectedDelivery);const form=event.currentTarget;
    if(!d){showMessage('Selecciona una entrega válida antes de confirmar.');return;}
    if(d.status==='delivered'){showMessage('Esta entrega ya fue confirmada en esta pestaña.');return;}
    if(!form.reportValidity()){showMessage('Indica quién recibe y elige una foto.');return;}
    if(!form.elements.receiver.value.trim()){showMessage('Indica el nombre de quien recibe.');return;}
    const photo=form.elements.photo.files[0];if(!photo || !['image/png','image/jpeg','image/webp'].includes(photo.type)){showMessage('El soporte debe ser PNG, JPEG o WebP.');return;}
    if(d.proof?.url) URL.revokeObjectURL(d.proof.url);
    d.proof={receiver:form.elements.receiver.value.trim(),observation:form.elements.observation.value.trim(),url:URL.createObjectURL(photo)};
    d.status='delivered';d.events.push({label:'Entregada',at:'Confirmada en maqueta local'});clientDelivery=d.id;form.reset();renderDriver();renderClient();showMessage('Entrega confirmada solo en esta pestaña. No se envió al servidor.');
  });
  $('issue-button').addEventListener('click',()=>{
    const d=findTrip(selectedTrip)?.deliveries.find(row=>row.id===selectedDelivery);
    if(!d){showMessage('Selecciona una entrega válida para registrar una novedad.');return;}
    if(d.status==='delivered'){showMessage('Una entrega confirmada no admite novedades en esta maqueta.');return;}
    const note=$('confirm-form').elements.observation.value.trim();if(!note){showMessage('Escribe la novedad en Observación.');return;}
    d.status='exception';d.events.push({label:'Novedad: '+note,at:'Registrada en maqueta local'});$('confirm-form').elements.observation.value='';clientDelivery=d.id;renderDriver();renderClient();showMessage('Novedad registrada solo en esta pestaña.');
  });
  $('reset').addEventListener('click',()=>{trips.forEach(t=>t.deliveries.forEach(d=>{if(d.proof?.url)URL.revokeObjectURL(d.proof.url);}));trips=clone(initial);selectedTrip='V-001';selectedDelivery=clientDelivery='E-001';nextTrip=2;nextDelivery=3;$('delivery-search').value='';$('trip-form').reset();$('confirm-form').reset();renderTrips();renderDriver();renderClient();showMessage('Ejemplo restablecido en esta pestaña.');});
  renderTrips();renderDriver();renderClient();
})();
