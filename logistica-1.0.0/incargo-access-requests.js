/* Prepared only. Requires explicit approval of client-access-requests.proposal.sql. */
(() => {
 'use strict';
 const enabled=false;
 function createOperations({root,rpc,document}){
  let epoch=0,busy=false,accounts=[];
  const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  const status=el('p',''),list=el('div',''),refresh=el('button','Actualizar solicitudes');refresh.type='button';list.className='request-list';status.setAttribute('role','status');
  root.append(el('h3','Solicitudes de acceso'),el('p','Revisa el correo verificado y confirma la empresa por un canal independiente. El nombre indicado no acredita pertenencia.'),refresh,status,list);
  function reset(){epoch++;busy=false;accounts=[];list.replaceChildren();status.textContent='';refresh.disabled=false;root.hidden=true;}
  async function load(nextAccounts){
   const current=++epoch;accounts=nextAccounts;root.hidden=false;list.replaceChildren();status.textContent='Cargando solicitudes.';refresh.disabled=true;
   try{
    const rows=await rpc('incargo_pending_client_access_requests',{});if(current!==epoch)return;
    if(!Array.isArray(rows)||rows.some(r=>!r||typeof r.user_id!=='string'||typeof r.email!=='string'||typeof r.company_claim!=='string'||typeof r.updated_at!=='string'))throw Error();
    status.textContent=rows.length?'Hasta 100 solicitudes pendientes, primero las más antiguas.':'No hay solicitudes pendientes.';
    for(const row of rows){
     const card=el('div','');card.className='item request-card';card.append(el('strong',row.email),el('p','Empresa indicada: '+row.company_claim));
     const label=el('label','Cuenta comercial verificada'),select=el('select',''),blank=el('option','Selecciona una cuenta');blank.value='';select.append(blank);
     for(const account of accounts){const option=el('option',account.display_name);option.value=account.account_id;select.append(option);}label.append(select);
     const checkLabel=el('label',''),check=el('input','');check.type='checkbox';checkLabel.className='request-confirm';checkLabel.append(check,el('span','He verificado la identidad y la cuenta elegida.'));
     const approve=el('button','Aprobar vinculación');approve.type='button';approve.disabled=true;
     const readiness=()=>{approve.disabled=busy||!select.value||!check.checked;};select.onchange=readiness;check.onchange=readiness;
     approve.onclick=async()=>{
      if(busy||!select.value||!check.checked||current!==epoch)return;busy=true;approve.disabled=true;select.disabled=true;check.disabled=true;status.textContent='Guardando vinculación.';
      try{await rpc('incargo_approve_client_access_request',{p_user:row.user_id,p_account:select.value,p_updated_at:row.updated_at});if(current!==epoch)return;busy=false;await load(accounts);}
      catch(error){if(current!==epoch)return;status.textContent='No pudimos confirmar la aprobación. Actualiza solicitudes antes de reintentar; no cambies de cuenta para resolver un conflicto.';}
      finally{if(current===epoch){busy=false;refresh.disabled=false;}}
     };
     card.append(label,checkLabel,approve);list.append(card);
    }
   }catch(error){if(current!==epoch)return;list.replaceChildren();status.textContent='No pudimos cargar las solicitudes. Reintenta.';}
   finally{if(current===epoch)refresh.disabled=false;}
  }
  refresh.onclick=()=>busy?undefined:load(accounts);
  return {reset,load};
 }
 const api={enabled,createOperations};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.IncargoAccessRequests=api;
})();
