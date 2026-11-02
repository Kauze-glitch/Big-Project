'use strict';
(() => {
  let frame=0,state=null,lastTime=0;
  const root=()=>document.scrollingElement||document.documentElement;
  const position=host=>host===window?window.scrollY:host.scrollTop;
  const limit=host=>Math.max(0,host===window?root().scrollHeight-window.innerHeight:host.scrollHeight-host.clientHeight);
  const clamp=(value,host)=>Math.max(0,Math.min(limit(host),value));
  function stop(){cancelAnimationFrame(frame);frame=0;state=null;lastTime=0;}
  window.Nhom12Scroll={stop};
  function enabled(){
    if(window.Nhom12Motion)return window.Nhom12Motion.enabled();
    try{const choice=localStorage.getItem('nhom12-motion');if(choice==='on')return true;if(choice==='off')return false;}catch{}
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }
  function write(host,top){if(typeof host.scrollTo==='function')host.scrollTo({top,behavior:'instant'});else host.scrollTop=top;}
  function step(time){
    if(!state||!enabled()){stop();return;}
    const {host}=state,current=position(host);
    if(host!==window&&!host.isConnected){stop();return;}
    // Yield immediately if a link, browser search, or another native action moved the page.
    if(Math.abs(current-state.expected)>2){stop();return;}
    const elapsed=lastTime?Math.min(50,time-lastTime):16;
    lastTime=time;state.target=clamp(state.target,host);
    const next=current+(state.target-current)*(1-Math.exp(-elapsed/85));
    const done=Math.abs(state.target-next)<.75;
    write(host,done?state.target:next);state.expected=position(host);
    if(done){stop();return;}
    frame=requestAnimationFrame(step);
  }
  function scrollHost(element,delta){
    if(!(element instanceof Element))return window;
    if(element.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return null;
    const modal=element.closest('dialog,[role="dialog"]');
    for(let node=element;node&&node!==document.body&&node!==document.documentElement;node=node.parentElement){
      const css=getComputedStyle(node),overflow=css.overflowY||css.overflow;
      if(/auto|scroll|overlay/.test(overflow)&&node.scrollHeight>node.clientHeight+1){
        const current=node.scrollTop,max=limit(node);
        if(delta>0?current<max-1:current>1)return node;
        if(/contain|none/.test(css.overscrollBehaviorY||css.overscrollBehavior))return null;
      }
      if(node===modal)return null;
    }
    return window;
  }
  window.addEventListener('wheel',event=>{
    if(!enabled()||event.defaultPrevented||!event.cancelable||event.ctrlKey||event.metaKey||event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)){
      stop();return;
    }
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?window.innerHeight:1);
    if(!delta)return;
    const host=scrollHost(event.target,delta);if(!host){stop();return;}
    const current=position(host);
    if(!state||state.host!==host){stop();state={host,target:current,expected:current};}
    // Reversing the wheel should respond immediately, without leftover momentum.
    if(!frame||Math.sign(delta)!==Math.sign(state.target-current))state.target=current;
    state.target=clamp(state.target+delta,host);
    if(state.target===current){stop();return;}
    event.preventDefault();
    if(!frame){lastTime=0;state.expected=current;frame=requestAnimationFrame(step);}
  },{passive:false});
  for(const type of ['pointerdown','touchstart','keydown','resize','pagehide'])window.addEventListener(type,stop,{passive:true});
  window.addEventListener('nhom12motionchange',()=>{if(!enabled())stop();});
})();
