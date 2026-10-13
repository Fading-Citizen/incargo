(() => {
  'use strict';
  const result=document.getElementById('result'),notice=document.getElementById('notice');
  const add=(tag,text)=>{const element=document.createElement(tag);element.textContent=text;result.append(element);return element;};
  async function load(){
    const token=new URLSearchParams(location.hash.slice(1)).get('token');
    if(!/^[0-9a-f]{64}$/.test(token||'')){notice.textContent='Enlace inválido o incompleto.';return;}
    try{
      const response=await fetch('https://gmjsqboyuvierfwruspv.supabase.co/functions/v1/incargo-tracking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),cache:'no-store'});
      if(!response.ok){notice.textContent=response.status===404?'Enlace vencido, revocado o inválido.':'No pudimos consultar la entrega. Inténtalo más tarde.';return;}
      const data=await response.json();notice.textContent='';result.hidden=false;
      add('h2',data.customer_name);if(data.invoice_reference)add('p','Factura: '+data.invoice_reference);add('p','Estado: '+({pending:'Pendiente',in_transit:'En ruta',exception:'Novedad',delivered:'Entregada'}[data.status]||data.status));
      const list=add('ul','');for(const event of data.events||[]){const item=document.createElement('li');item.textContent=({created:'Pedido recibido',in_transit:'En ruta',exception:'Novedad',delivered:'Entregada'}[event.type]||event.type)+' · '+new Date(event.at).toLocaleString('es-CO');list.append(item);}
      if(data.support_url){const link=add('a','Ver soporte de entrega');link.href=data.support_url;link.rel='noreferrer noopener';link.target='_blank';}
    }catch{notice.textContent='No pudimos consultar la entrega. Inténtalo más tarde.';}
  }
  load();
})();
