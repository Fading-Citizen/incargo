/* Local presentation controls. No network, credentials or business mutations. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const navigation=document.querySelectorAll('[data-panel]');
  navigation.forEach(button=>button.addEventListener('click',()=>{
    navigation.forEach(other=>{
      const active=other===button;
      $(other.dataset.panel).hidden=!active;
      if(active)other.setAttribute('aria-current','page');else other.removeAttribute('aria-current');
    });
    $(button.dataset.panel).querySelector('h2')?.focus();
  }));
  document.querySelector('a[href="#new-delivery"]')?.addEventListener('click',event=>{
    event.preventDefault();
    $('new-delivery').open=true;
    $('delivery-trip').focus();
  });
  function filterDeliveries(){
    const cards=[...$('ops-deliveries').querySelectorAll('.delivery-card')];
    const query=$('ops-search').value.trim().toLocaleLowerCase('es');
    const status=$('ops-status').value;
    let visible=0;
    cards.forEach(card=>{
      const matches=(!status||card.dataset.status===status)&&(!query||card.dataset.search.toLocaleLowerCase('es').includes(query));
      card.hidden=!matches;if(matches)visible++;
    });
    $('ops-no-matches').hidden=!cards.length||visible>0;
    $('ops-result-count').textContent=$('ops-deliveries').querySelector('.load-error')?'Carga pendiente':$('ops-deliveries').querySelector('.loading-state')?'Cargando entregas…':cards.length?`${visible} de ${cards.length} entregas`:'Sin entregas disponibles';
  }
  $('ops-search').addEventListener('input',filterDeliveries);
  $('ops-status').addEventListener('change',filterDeliveries);
  $('ops-clear-filters').addEventListener('click',()=>{$('ops-search').value='';$('ops-status').value='';filterDeliveries();$('ops-search').focus();});
  new MutationObserver(filterDeliveries).observe($('ops-deliveries'),{childList:true});
  function syncNotice(){
    const isSession=$('notice').textContent==='Sesión activa en esta pestaña.';
    if($('notice').classList.contains('session-notice')!==isSession)$('notice').classList.toggle('session-notice',isSession);
    if(!$('notice').classList.contains('error'))return;
    document.querySelectorAll('.loading-state').forEach(message=>{message.textContent='No pudimos cargar esta información. Actualiza la página para reintentar.';message.className='load-error empty-state';});
    if($('ops-deliveries').querySelector('.load-error'))$('ops-result-count').textContent='Carga pendiente';
  }
  new MutationObserver(syncNotice).observe($('notice'),{childList:true,attributes:true,attributeFilter:['class']});
  filterDeliveries();
  syncNotice();
})();
