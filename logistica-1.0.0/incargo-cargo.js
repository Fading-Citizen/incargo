/* Origin/cargo activated after approved schema/RPC postflight. */
(() => {
  'use strict';
  const text=(value,max,label)=>{const s=String(value??'').trim();if(s.length>max)throw Error(label+' excede '+max+' caracteres.');return s||null;};
  function parse(values){
    const count=String(values.package_count??'').trim(),weight=String(values.gross_weight_kg??'').trim();
    if(count&&(!/^\d+$/.test(count)||Number(count)<1||Number(count)>2147483647))throw Error('Bultos debe ser un entero positivo.');
    if(weight&&(!/^\d+(?:[.,]\d{1,3})?$/.test(weight)||Number(weight.replace(',','.'))<=0||Number(weight.replace(',','.'))>999999999.999))throw Error('Peso debe ser positivo, en kg y con máximo tres decimales.');
    return {origin_text:text(values.origin_text,200,'Origen'),cargo_description:text(values.cargo_description,500,'Descripción'),package_count:count?Number(count):null,gross_weight_kg:weight?Number(weight.replace(',','.')):null};
  }
  function fields(row){
    for(const key of ['origin_text','cargo_description'])if(row[key]!=null&&typeof row[key]!=='string')throw Error('Datos de carga inválidos.');
    if(row.package_count!=null&&(!Number.isInteger(row.package_count)||row.package_count<1))throw Error('Bultos inválidos.');
    if(row.gross_weight_kg!=null&&typeof row.gross_weight_kg!=='number'&&typeof row.gross_weight_kg!=='string')throw Error('Peso inválido.');
    const data=parse(row);
    return [['Origen',data.origin_text||'Sin origen registrado'],['Descripción de la carga',data.cargo_description||'Sin descripción registrada'],['Bultos',data.package_count===null?'Sin cantidad registrada':String(data.package_count)],['Peso bruto (kg)',data.gross_weight_kg===null?'Sin peso registrado':data.gross_weight_kg.toLocaleString('es-CO',{maximumFractionDigits:3})+' kg']];
  }
  const api=Object.freeze({enabled:true,parse,fields});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.IncargoCargo=api;
})();
