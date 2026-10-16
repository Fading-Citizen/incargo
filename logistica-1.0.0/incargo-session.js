/* Temporary per-tab sessions. No refresh token, renewal or stored authorization. */
(() => {
  'use strict';
  function createTabSession({storage,context,project,verifyUser,authorize,now=()=>Date.now()}) {
    if(!['client','operations'].includes(context)||!project)throw Error('Invalid session context');
    const key='incargo:tab-session:v1:'+project+':'+context;
    let generation=0,active=null;
    const valid=r=>r&&r.version===1&&r.project===project&&r.context===context&&
      typeof r.access_token==='string'&&r.access_token.length>0&&typeof r.user_id==='string'&&r.user_id.length>0&&
      Number.isSafeInteger(r.expires_at)&&r.expires_at*1000>now();
    function clear(){generation++;active=null;try{storage.removeItem(key);}catch{ /* Storage may be unavailable. */ }}
    function current(){if(active&&active.expires_at*1000<=now())clear();return active;}
    async function validate(record,attempt){
      const user=await verifyUser(record.access_token);
      if(attempt!==generation)return null;
      if(!user||user.id!==record.user_id)throw Error('Identity mismatch');
      const scope=await authorize(record.access_token,user);
      if(attempt!==generation)return null;
      if(!scope)throw Object.assign(Error('Unauthorized session'),{unauthorized:true});
      if(!valid(record))throw Error('Expired session');
      return {access_token:record.access_token,expires_at:record.expires_at,user,scope};
    }
    async function restore(){
      const attempt=++generation;active=null;
      try{
        const raw=storage.getItem(key);if(raw===null)return null;
        const record=JSON.parse(raw);if(!valid(record))throw Error('Invalid session');
        const result=await validate(record,attempt);if(attempt!==generation)return null;
        active=result;return active;
      }catch{if(attempt!==generation)return null;clear();throw Error('No pudimos restaurar tu sesi�n. Ingresa nuevamente.');}
    }
    async function remember(login){
      const record={version:1,project,context,access_token:login?.access_token,expires_at:login?.expires_at,user_id:login?.user?.id};
      const attempt=++generation;active=null;
      try{
        storage.removeItem(key);if(!valid(record))throw Error('Invalid session');
        const result=await validate(record,attempt);if(attempt!==generation)return null;
        storage.setItem(key,JSON.stringify(record));active=result;return active;
      }catch(error){if(attempt!==generation)return null;clear();if(error.unauthorized)throw Error(context==='client'?'Tu cuenta est� activa, pero Incargo a�n no la ha vinculado a una empresa o a env�os. Contacta al equipo.':'Tu cuenta no tiene un rol de Incargo asignado.');throw Error('No pudimos conservar tu sesi�n o confirmar tu acceso. Ingresa nuevamente.');}
    }
    return {restore,remember,current,clear};
  }
  const browserStorage={getItem:key=>sessionStorage.getItem(key),setItem:(key,value)=>sessionStorage.setItem(key,value),removeItem:key=>sessionStorage.removeItem(key)};
  function create({context,config}){
    const read=async(path,token,options={})=>{
      const response=await fetch(config.url+path,{...options,headers:{apikey:config.publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},cache:'no-store'});
      if(!response.ok)throw Error('No pudimos confirmar tu acceso. Ingresa nuevamente.');
      return response.json();
    };
    return createTabSession({storage:browserStorage,context,project:config.url,
      verifyUser:token=>read('/auth/v1/user',token),
      authorize:async(token,user)=>{
        const rows=context==='client'
          ?await read('/rest/v1/rpc/incargo_client_identity',token,{method:'POST',body:'{}'})
          :await read('/rest/v1/incargo_memberships?select=role&user_id=eq.'+encodeURIComponent(user.id),token);
        if(!Array.isArray(rows)||rows.length!==1)return null;
        return context==='client'?(rows[0].account_id?rows[0]:null):(['operations','driver'].includes(rows[0].role)?rows[0].role:null);
      }});
  }
  if(typeof module!=='undefined')module.exports={createTabSession};
  else globalThis.IncargoSession={create};
})();
