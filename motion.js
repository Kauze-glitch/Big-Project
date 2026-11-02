'use strict';
(() => {
 const root=document.documentElement,media=window.matchMedia?.('(prefers-reduced-motion: reduce)'),active=new Map();
 let choice='auto';
 const read=()=>{try{const value=localStorage.getItem('nhom12-motion');return value==='on'||value==='off'?value:'auto';}catch{return 'auto';}};
 const enabled=()=>choice==='on'||(choice==='auto'&&!media?.matches);
 function cancel(element){active.get(element)?.cancel();active.delete(element);}
 function sync(){
  root.dataset.motion=enabled()?'on':'off';root.dataset.motionPreference=choice;root.dataset.motionEngine='js';
  if(!enabled())for(const element of [...active.keys()])cancel(element);
  window.dispatchEvent(new CustomEvent('nhom12motionchange',{detail:{enabled:enabled(),preference:choice,reduced:!!media?.matches}}));
 }
 function setPreference(value){if(!['auto','on','off'].includes(value))return;choice=value;try{if(value==='auto')localStorage.removeItem('nhom12-motion');else localStorage.setItem('nhom12-motion',value);}catch{}sync();}
 function enter(element,kind='page'){
  if(!element)return null;cancel(element);
  if(!enabled()||typeof element.animate!=='function')return null;
  const modal=kind==='dialog',animation=element.animate(modal?[
   {opacity:0,transform:'translateY(10px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}
  ]:[
   {opacity:.12,transform:'translateY(26px)',filter:'blur(2px)'},{opacity:1,transform:'translateY(0)',filter:'blur(0)'}
  ],{duration:modal?200:320,easing:'cubic-bezier(.2,.75,.25,1)'});
  active.set(element,animation);const clean=()=>{if(active.get(element)===animation)active.delete(element);};animation.finished?.then(clean,clean);return animation;
 }
 window.Nhom12Motion=Object.freeze({enabled,preference:()=>choice,reduced:()=>!!media?.matches,setPreference,enter,cancel});
 choice=read();sync();
 media?.addEventListener?.('change',sync);
 window.addEventListener('storage',event=>{if(event.key==='nhom12-motion'||event.key===null){choice=read();sync();}});
 function observe(){
  const isDialog=element=>element.matches?.('dialog:not(.presentation-dialog):not(#pdf-dialog):not(.statistics-print-dialog)');
  const run=records=>{
   const dialogs=new Set(),pages=new Set();
   for(const record of records){
    if(record.type==='attributes'&&isDialog(record.target)){if(record.target.open)dialogs.add(record.target);else cancel(record.target);}
    for(const node of record.addedNodes||[]){if(node.nodeType!==1)continue;if(isDialog(node)&&node.open)dialogs.add(node);for(const dialog of node.querySelectorAll('dialog[open]'))if(isDialog(dialog))dialogs.add(dialog);if(node.matches('.arrive'))pages.add(node);for(const page of node.querySelectorAll('.arrive'))pages.add(page);}
    for(const node of record.removedNodes||[]){if(node.nodeType!==1)continue;for(const element of [...active.keys()])if(element===node||node.contains(element))cancel(element);}
   }
   for(const dialog of dialogs)if(dialog.isConnected&&dialog.open)enter(dialog,'dialog');
   for(const page of pages)if(page.isConnected)enter(page);
  };
  new MutationObserver(run).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  for(const dialog of document.querySelectorAll('dialog[open]'))if(isDialog(dialog))enter(dialog,'dialog');
 }
 if(document.body)observe();else document.addEventListener('DOMContentLoaded',observe,{once:true});
})();
