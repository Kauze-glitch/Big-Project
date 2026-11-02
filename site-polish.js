'use strict';
(() => {
 function reportNavigation(){
 const sidebar=document.querySelector('.sidebar');
 if(!sidebar)return;
 const button=document.createElement('button');button.className='site-menu-toggle';button.type='button';
 sidebar.id=sidebar.id||'site-navigation';
 const items=[...sidebar.children].filter(e=>e.matches('.section-nav,.overview-link,.sidebar-bottom'));
 items.forEach((e,i)=>e.id=e.id||'site-menu-part-'+i);
 button.setAttribute('aria-controls',items.map(e=>e.id).join(' '));
 const set=open=>{sidebar.classList.toggle('menu-open',open);button.setAttribute('aria-expanded',String(open));button.textContent=open?'Đóng mục lục −':'Mở mục lục và công cụ +';};
 button.onclick=()=>set(!sidebar.classList.contains('menu-open'));
 sidebar.querySelector('.brand').after(button);sidebar.classList.add('menu-enhanced');set(false);
 sidebar.addEventListener('click',e=>{if(e.target.closest('a')&&window.matchMedia('(max-width: 760px)').matches){set(false);button.focus({preventScroll:true});}});
 sidebar.addEventListener('keydown',e=>{if(e.key==='Escape'&&sidebar.classList.contains('menu-open')){set(false);button.focus();}});
 }
 reportNavigation();

 // The portal replaces its shell after each route/data refresh. Enhance each new
 // member navigation once; the guest/citizen views never gain member controls.
 const portal=document.getElementById('portal-app');
 if(portal){
  function memberNavigation(){
   const nav=portal.querySelector('nav.workspace-nav');
   if(!nav||nav.classList.contains('workspace-nav-enhanced'))return;
   const current=nav.querySelector('[aria-current=page]')?.textContent.trim()||'Quản lý hồ sơ';
   const links=document.createElement('div');links.id='workspace-links';links.className='workspace-links';
   links.append(...nav.childNodes);
   const toggle=document.createElement('button');toggle.type='button';toggle.className='workspace-menu-toggle';
   toggle.setAttribute('aria-controls',links.id);
   const set=open=>{nav.classList.toggle('menu-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.textContent=(open?'Đóng danh mục':'Danh mục')+' · '+current;};
   nav.append(toggle,links);nav.classList.add('workspace-nav-enhanced');set(false);
   toggle.onclick=()=>set(!nav.classList.contains('menu-open'));
   nav.addEventListener('keydown',event=>{if(event.key==='Escape'&&nav.classList.contains('menu-open')){event.preventDefault();set(false);toggle.focus();}});
   links.addEventListener('click',event=>{if(event.target.closest('a')&&window.matchMedia?.('(max-width: 760px)').matches){set(false);toggle.focus({preventScroll:true});}});
  }
  memberNavigation();
  new MutationObserver(memberNavigation).observe(portal,{childList:true,subtree:true});
  portal.addEventListener('toggle',event=>{const detail=event.target;if(!detail.matches?.('details.row-more')||!detail.open)return;for(const other of portal.querySelectorAll('details.row-more[open]'))if(other!==detail)other.open=false;},true);
  portal.addEventListener('keydown',event=>{const detail=event.target.closest?.('details.row-more[open]');if(event.key==='Escape'&&detail){event.preventDefault();detail.open=false;detail.querySelector('summary').focus();}});
 }
})();
