'use strict';
(() => {
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
})();
