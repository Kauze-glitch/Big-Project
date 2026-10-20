'use strict';
(() => {
  let frame=0,target=0,lastTime=0,expected=0;
  const limit=()=>Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
  const clamp=value=>Math.max(0,Math.min(limit(),value));
  function stop(){cancelAnimationFrame(frame);frame=0;lastTime=0;}
  window.Nhom12Scroll={stop};
  function step(time){
    // Yield immediately if a link, browser search, or another native action moved the page.
    if(Math.abs(window.scrollY-expected)>2){stop();return;}
    const elapsed=lastTime?Math.min(50,time-lastTime):16;
    lastTime=time;target=clamp(target);
    const next=window.scrollY+(target-window.scrollY)*(1-Math.exp(-elapsed/85));
    const done=Math.abs(target-next)<.75;
    window.scrollTo({top:done?target:next,behavior:'instant'});
    expected=window.scrollY;
    if(done){stop();return;}
    frame=requestAnimationFrame(step);
  }
  function nativeArea(element){
    if(!(element instanceof Element))return false;
    if(element.closest('input,textarea,select,[contenteditable],dialog,[role="dialog"]'))return true;
    for(let node=element;node&&node!==document.body;node=node.parentElement){
      const css=getComputedStyle(node);
      if(/auto|scroll|overlay/.test(css.overflowY)&&node.scrollHeight>node.clientHeight+1)return true;
      if(/auto|scroll|overlay/.test(css.overflowX)&&node.scrollWidth>node.clientWidth+1)return true;
    }
    return false;
  }
  window.addEventListener('wheel',event=>{
    let enabled=true;
    try{enabled=localStorage.getItem('nhom12-motion')!=='off';}catch{}
    if(!enabled||event.defaultPrevented||!event.cancelable||event.ctrlKey||event.metaKey||event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)||nativeArea(event.target)){
      stop();return;
    }
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?window.innerHeight:1);
    if(!delta)return;
    const current=window.scrollY;
    // Reversing the wheel should respond immediately, without leftover momentum.
    if(!frame||Math.sign(delta)!==Math.sign(target-current))target=current;
    target=clamp(target+delta);
    if(target===current){stop();return;}
    event.preventDefault();
    if(!frame){expected=current;frame=requestAnimationFrame(step);}
  },{passive:false});
  for(const type of ['pointerdown','touchstart','keydown','resize','pagehide'])window.addEventListener(type,stop,{passive:true});
})();
